import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: vi.fn(),
}));
vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "test-model" },
}));
vi.mock("@/server/repositories/artifact-version", () => ({
  ArtifactVersionValidationError: class ArtifactVersionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ArtifactVersionValidationError";
    }
  },
  createArtifactProposal: vi.fn(),
  transitionArtifactProposal: vi.fn(),
  getArtifactHead: vi.fn(),
  getArtifactLineage: vi.fn(),
  getArtifactProposal: vi.fn(),
  getArtifactVersion: vi.fn(),
  listArtifactLineages: vi.fn(),
  listArtifactVersions: vi.fn(),
  staleSiblingProposals: vi.fn(),
  findActiveGenerationForLineage: vi.fn(async () => false),
}));
vi.mock("./draft", () => ({
  clearCreativeFeedbackDraft: vi.fn(() => Promise.resolve(false)),
  saveCreativeFeedbackDraft: vi.fn(() => Promise.resolve({ draftText: "" })),
}));

import {
  ArtifactVersionValidationError,
  createArtifactProposal,
  getArtifactHead,
  getArtifactLineage,
  getArtifactProposal,
  getArtifactVersion,
  listArtifactLineages,
  listArtifactVersions,
  staleSiblingProposals,
  transitionArtifactProposal,
} from "@/server/repositories/artifact-version";
import { clearCreativeFeedbackDraft } from "./draft";
import {
  cancelCreativeRevision,
  confirmCreativeRevision,
  finalizeCreativeRevisionProposal,
  proposeCreativeRevision,
  resolveCreativeRevisionSource,
  validateCreativeRevisionProposal,
} from "./proposal";
import { canonicalProposalPayloadDigest } from "../plan-iteration/digest";

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

const planLineageId = "00000000-0000-4000-8000-000000000101";
const creativeLineageId = "00000000-0000-4000-8000-000000000102";
const planVersionId = "00000000-0000-4000-8000-000000000201";
const workingVersionId = "00000000-0000-4000-8000-000000000202";
const approvedVersionId = "00000000-0000-4000-8000-000000000203";

const sourceSnapshot = {
  type: "creative" as const,
  derivationId: "00000000-0000-4000-8000-000000000301",
  outputKey: "creatives/test.png",
  format: "1:1",
  generationMode: "image",
  ctaText: "Compre agora",
  planVersionId,
};

const workingVersion = {
  id: workingVersionId,
  lineageId: creativeLineageId,
  versionNumber: 2,
  snapshot: sourceSnapshot,
  sourceVersionId: approvedVersionId,
};

const approvedVersion = {
  id: approvedVersionId,
  lineageId: creativeLineageId,
  versionNumber: 1,
  snapshot: sourceSnapshot,
  sourceVersionId: null,
};

const planVersion = {
  id: planVersionId,
  versionNumber: 1,
};

const mockGenerate = vi.fn(async () => ({
  intendedChanges: ["Muda cor de fundo para azul"],
  format: "1:1",
  summary: "Revisão visual: nova cor de fundo.",
}));

function mockHead(overrides: Record<string, unknown> = {}) {
  return {
    lineageId: creativeLineageId,
    workingVersionId,
    approvedCurrentVersionId: approvedVersionId,
    revision: 3,
    ...overrides,
  };
}

function mockPlanHead(overrides: Record<string, unknown> = {}) {
  return {
    lineageId: planLineageId,
    workingVersionId: planVersionId,
    approvedCurrentVersionId: planVersionId,
    revision: 1,
    ...overrides,
  };
}

describe("resolveCreativeRevisionSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactLineage).mockImplementation(
      async (_scope, lineageId) =>
        ({
          id: lineageId,
          artifactType: lineageId === creativeLineageId ? "creative" : "plan",
        }) as never
    );
    vi.mocked(getArtifactHead).mockImplementation(async (_scope, lineageId) =>
      lineageId === creativeLineageId
        ? (mockHead() as never)
        : (mockPlanHead() as never)
    );
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) => {
      if (id === workingVersionId) return workingVersion as never;
      if (id === approvedVersionId) return approvedVersion as never;
      if (id === planVersionId) return planVersion as never;
      return null;
    });
    vi.mocked(listArtifactLineages).mockResolvedValue([
      { id: planLineageId, artifactType: "plan" } as never,
    ]);
  });

  it("resolves source creative with frozen plan version binding", async () => {
    const result = await resolveCreativeRevisionSource(
      scope,
      creativeLineageId
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.sourceVersionId).toBe(workingVersionId);
      expect(result.source.sourceVersionNumber).toBe(2);
      expect(result.source.planVersionId).toBe(planVersionId);
      expect(result.source.planVersionLabel).toBe("v1");
    }
  });

  it("asks target when no plan lineage exists in thread", async () => {
    vi.mocked(listArtifactLineages).mockResolvedValue([]);
    const result = await resolveCreativeRevisionSource(
      scope,
      creativeLineageId
    );
    expect(result.kind).toBe("ask_target");
    expect(result.question.toLowerCase()).toContain("plano");
  });

  it("picks working creative version by default", async () => {
    const result = await resolveCreativeRevisionSource(
      scope,
      creativeLineageId
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.sourceVersionId).toBe(workingVersionId);
    }
  });

  it("falls back to approved current when working is null", async () => {
    vi.mocked(getArtifactHead).mockImplementation(async (_scope, lineageId) =>
      lineageId === creativeLineageId
        ? (mockHead({ workingVersionId: null }) as never)
        : (mockPlanHead() as never)
    );
    const result = await resolveCreativeRevisionSource(
      scope,
      creativeLineageId
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.sourceVersionId).toBe(approvedVersionId);
    }
  });

  it("includes warning when working differs from approved", async () => {
    const result = await resolveCreativeRevisionSource(
      scope,
      creativeLineageId
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.workingDiffersFromApproved).toBe(true);
      expect(result.source.sourceVersionLabel).toBe("v2");
      expect(result.source.approvedVersionLabel).toBe("v1");
    }
  });
});

describe("proposeCreativeRevision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockClear();
    vi.mocked(getArtifactLineage).mockImplementation(
      async (_scope, lineageId) =>
        ({
          id: lineageId,
          artifactType: lineageId === creativeLineageId ? "creative" : "plan",
        }) as never
    );
    vi.mocked(listArtifactLineages).mockResolvedValue([
      { id: creativeLineageId, artifactType: "creative" } as never,
      { id: planLineageId, artifactType: "plan" } as never,
    ]);
    vi.mocked(getArtifactHead).mockImplementation(async (_scope, lineageId) =>
      lineageId === creativeLineageId
        ? (mockHead() as never)
        : (mockPlanHead() as never)
    );
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) => {
      if (id === workingVersionId) return workingVersion as never;
      if (id === approvedVersionId) return approvedVersion as never;
      if (id === planVersionId) return planVersion as never;
      return null;
    });
    vi.mocked(createArtifactProposal).mockImplementation(async (input) => ({
      id: `proposal-${Math.random()}`,
      ...input,
      status: "pending",
    }) as never);
  });

  it("creates a creative_revision proposal with frozen planVersionId in payload", async () => {
    const result = await proposeCreativeRevision({
      scope,
      feedback: "muda a cor de fundo para azul",
      messageId: "msg-1",
      generateCreativeRevisionProposal: mockGenerate,
    });
    expect(result.kind).toBe("proposal");
    if (result.kind === "proposal") {
      expect(createArtifactProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalType: "creative_revision",
          sourceVersionId: workingVersionId,
        })
      );
      expect(result.payload.planVersionId).toBe(planVersionId);
      expect(result.payload.intendedChanges).toEqual([
        "Muda cor de fundo para azul",
      ]);
      expect(result.payload.format).toBe("1:1");
      expect(result.payload.creditImpact).toBe(5);
      expect(result.planVersionLabel).toBe("v1");
      expect(clearCreativeFeedbackDraft).toHaveBeenCalledWith(scope);
    }
  });

  it("returns clarify for vague feedback and saves draft", async () => {
    const result = await proposeCreativeRevision({
      scope,
      feedback: "melhora",
      messageId: "msg-1",
    });
    expect(result.kind).toBe("clarify");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("redirects format-change requests without creating proposal", async () => {
    const result = await proposeCreativeRevision({
      scope,
      feedback: "faz em 9:16",
      messageId: "msg-1",
    });
    expect(result.kind).toBe("redirect");
    expect(result.message.toLowerCase()).toContain("formato");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("asks target when no creative lineage exists", async () => {
    vi.mocked(listArtifactLineages).mockResolvedValue([
      { id: planLineageId, artifactType: "plan" } as never,
    ]);
    const result = await proposeCreativeRevision({
      scope,
      feedback: "muda a cor de fundo",
      messageId: "msg-1",
      generateCreativeRevisionProposal: mockGenerate,
    });
    expect(result.kind).toBe("ask_target");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("asks target when multiple creative lineages exist", async () => {
    vi.mocked(listArtifactLineages).mockResolvedValue([
      { id: creativeLineageId, artifactType: "creative" } as never,
      { id: "creative-other", artifactType: "creative" } as never,
      { id: planLineageId, artifactType: "plan" } as never,
    ]);
    const result = await proposeCreativeRevision({
      scope,
      feedback: "muda a cor de fundo",
      messageId: "msg-1",
      generateCreativeRevisionProposal: mockGenerate,
    });
    expect(result.kind).toBe("ask_target");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("merges attachment reference ids into payload", async () => {
    const attachmentRef = "00000000-0000-4000-8000-000000000999";
    const result = await proposeCreativeRevision({
      scope,
      feedback: "muda a cor de fundo",
      messageId: "msg-1",
      attachmentReferenceIds: [attachmentRef],
      generateCreativeRevisionProposal: mockGenerate,
    });
    expect(result.kind).toBe("proposal");
    if (result.kind === "proposal") {
      expect(result.payload.referenceIds).toContain(attachmentRef);
    }
  });
});

describe("cancelCreativeRevision", () => {
  it("transitions proposal to canceled", async () => {
    vi.mocked(transitionArtifactProposal).mockResolvedValue({
      id: "proposal-1",
      status: "canceled",
    } as never);
    const result = await cancelCreativeRevision(scope, "proposal-1");
    expect(transitionArtifactProposal).toHaveBeenCalledWith({
      scope,
      proposalId: "proposal-1",
      nextStatus: "canceled",
    });
    expect(result.status).toBe("canceled");
  });
});

describe("confirmCreativeRevision", () => {
  const proposalRecord = {
    id: "proposal-1",
    lineageId: creativeLineageId,
    sourceVersionId: workingVersionId,
    proposalType: "creative_revision" as const,
    status: "pending" as const,
    feedback: "muda a cor",
    payload: {
      type: "creative_revision" as const,
      schemaVersion: 1 as const,
      summary: "Revisão visual",
      intendedChanges: ["Muda cor"],
      format: "1:1",
      referenceIds: [],
      creditImpact: 5,
      writes: ["Gera nova versão"],
      planVersionId,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validDigest = canonicalProposalPayloadDigest(proposalRecord.payload);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactProposal).mockResolvedValue(proposalRecord as never);
    vi.mocked(getArtifactHead).mockResolvedValue(mockHead() as never);
    vi.mocked(getArtifactLineage).mockResolvedValue({
      id: creativeLineageId,
      artifactType: "creative",
      originalArtifactId: "creative-orig-1",
    } as never);
    vi.mocked(transitionArtifactProposal).mockResolvedValue({
      ...proposalRecord,
      status: "confirmed",
    } as never);
    vi.mocked(staleSiblingProposals).mockResolvedValue([]);
    vi.mocked(listArtifactVersions).mockResolvedValue([]);
    vi.mocked(getArtifactVersion).mockResolvedValue(workingVersion as never);
  });

  it("transitions proposal to confirmed and stales siblings", async () => {
    const result = await confirmCreativeRevision({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      payloadDigest: validDigest,
    });
    expect(result.idempotent).toBe(false);
    expect(transitionArtifactProposal).toHaveBeenCalledWith({
      scope,
      proposalId: "proposal-1",
      nextStatus: "confirmed",
    });
    expect(staleSiblingProposals).toHaveBeenCalled();
  });

  it("rejects stale proposal status", async () => {
    vi.mocked(getArtifactProposal).mockResolvedValue({
      ...proposalRecord,
      status: "stale",
    } as never);
    await expect(
      confirmCreativeRevision({
        scope,
        proposalId: "proposal-1",
        lineageId: creativeLineageId,
        sourceVersionId: workingVersionId,
        payloadDigest: validDigest,
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });

  it("rejects non-pending proposal status", async () => {
    vi.mocked(getArtifactProposal).mockResolvedValue({
      ...proposalRecord,
      status: "confirmed",
    } as never);
    await expect(
      confirmCreativeRevision({
        scope,
        proposalId: "proposal-1",
        lineageId: creativeLineageId,
        sourceVersionId: workingVersionId,
        payloadDigest: validDigest,
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });

  it("rejects digest mismatch", async () => {
    vi.mocked(getArtifactProposal).mockResolvedValue({
      ...proposalRecord,
      payload: {
        ...proposalRecord.payload,
        summary: "Different summary",
      },
    } as never);
    await expect(
      confirmCreativeRevision({
        scope,
        proposalId: "proposal-1",
        lineageId: creativeLineageId,
        sourceVersionId: workingVersionId,
        payloadDigest: "wrong-digest",
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });

  it("returns idempotent when actionId already produced a version", async () => {
    const actionId = "00000000-0000-4000-8000-000000000abc";
    const existingVersion = {
      id: "version-prev",
      lineageId: creativeLineageId,
      versionNumber: 2,
      snapshot: sourceSnapshot,
      provenance: { actionId },
    };
    vi.mocked(listArtifactVersions).mockResolvedValue([
      existingVersion as never,
    ]);
    const result = await confirmCreativeRevision({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      payloadDigest: validDigest,
      actionId,
    });
    expect(result.idempotent).toBe(true);
    expect(transitionArtifactProposal).not.toHaveBeenCalled();
  });

  it("rejects when another generation is already running on lineage", async () => {
    const actionId = "00000000-0000-4000-8000-000000000def";
    await expect(
      confirmCreativeRevision({
        scope,
        proposalId: "proposal-1",
        lineageId: creativeLineageId,
        sourceVersionId: workingVersionId,
        payloadDigest: validDigest,
        actionId,
        hasActiveGeneration: vi.fn(async () => true),
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });

  it("allows confirm when no active generation", async () => {
    const result = await confirmCreativeRevision({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      payloadDigest: validDigest,
      hasActiveGeneration: vi.fn(async () => false),
    });
    expect(result.idempotent).toBe(false);
    expect(transitionArtifactProposal).toHaveBeenCalled();
  });
});

describe("validateCreativeRevisionProposal", () => {
  const proposalRecord = {
    id: "proposal-1",
    lineageId: creativeLineageId,
    sourceVersionId: workingVersionId,
    proposalType: "creative_revision" as const,
    status: "pending" as const,
    payload: {
      type: "creative_revision" as const,
      schemaVersion: 1 as const,
      summary: "Revisão visual",
      intendedChanges: ["Muda cor"],
      format: "1:1",
      referenceIds: [],
      creditImpact: 5,
      writes: ["Gera nova versão"],
      planVersionId,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validDigest = canonicalProposalPayloadDigest(proposalRecord.payload);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactProposal).mockResolvedValue(proposalRecord as never);
    vi.mocked(getArtifactHead).mockResolvedValue(mockHead() as never);
    vi.mocked(getArtifactLineage).mockResolvedValue({
      id: creativeLineageId,
      artifactType: "creative",
      originalArtifactId: "creative-orig-1",
    } as never);
    vi.mocked(getArtifactVersion).mockResolvedValue(workingVersion as never);
  });

  it("forwards excludeActionId to the active-generation check", async () => {
    const hasActiveGeneration = vi.fn(async () => false);

    await validateCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      payloadDigest: validDigest,
      excludeActionId: "action-self",
      hasActiveGeneration,
    });

    expect(hasActiveGeneration).toHaveBeenCalledWith(
      scope,
      creativeLineageId,
      "action-self"
    );
  });

  it("uses findActiveGenerationForLineage by default and passes excludeActionId", async () => {
    const { findActiveGenerationForLineage } = await import(
      "@/server/repositories/artifact-version"
    );
    vi.mocked(findActiveGenerationForLineage).mockResolvedValue(false);

    await validateCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      payloadDigest: validDigest,
      excludeActionId: "action-self",
    });

    expect(findActiveGenerationForLineage).toHaveBeenCalledWith(
      scope,
      creativeLineageId,
      "action-self"
    );
  });

  it("rejects when another active generation exists (excluding self)", async () => {
    await expect(
      validateCreativeRevisionProposal({
        scope,
        proposalId: "proposal-1",
        lineageId: creativeLineageId,
        sourceVersionId: workingVersionId,
        payloadDigest: validDigest,
        excludeActionId: "action-self",
        hasActiveGeneration: vi.fn(async () => true),
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });
});

describe("finalizeCreativeRevisionProposal", () => {
  const pendingProposal = {
    id: "proposal-1",
    lineageId: creativeLineageId,
    sourceVersionId: workingVersionId,
    proposalType: "creative_revision" as const,
    status: "pending" as const,
    payload: {
      type: "creative_revision" as const,
      schemaVersion: 1 as const,
      summary: "Revisão visual",
      intendedChanges: ["Muda cor"],
      format: "1:1",
      referenceIds: [],
      creditImpact: 5,
      writes: ["Gera nova versão"],
      planVersionId,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactProposal).mockResolvedValue(pendingProposal as never);
    vi.mocked(transitionArtifactProposal).mockResolvedValue({
      ...pendingProposal,
      status: "confirmed",
    } as never);
    vi.mocked(staleSiblingProposals).mockResolvedValue([]);
    vi.mocked(listArtifactVersions).mockResolvedValue([]);
  });

  it("transitions pending proposal to confirmed and stales siblings", async () => {
    const result = await finalizeCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      actionId: "action-1",
    });

    expect(result.idempotent).toBe(false);
    expect(staleSiblingProposals).toHaveBeenCalledWith({
      scope,
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      exceptProposalId: "proposal-1",
    });
    expect(transitionArtifactProposal).toHaveBeenCalledWith({
      scope,
      proposalId: "proposal-1",
      nextStatus: "confirmed",
    });
  });

  it("returns idempotent when proposal was already confirmed by a concurrent run", async () => {
    vi.mocked(getArtifactProposal).mockResolvedValue({
      ...pendingProposal,
      status: "confirmed",
    } as never);

    const result = await finalizeCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      actionId: "action-1",
    });

    expect(result.idempotent).toBe(true);
    expect(transitionArtifactProposal).not.toHaveBeenCalled();
    expect(staleSiblingProposals).not.toHaveBeenCalled();
  });

  it("returns idempotent when proposal was staled by a sibling confirmation", async () => {
    vi.mocked(getArtifactProposal).mockResolvedValue({
      ...pendingProposal,
      status: "stale",
    } as never);

    const result = await finalizeCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      actionId: "action-1",
    });

    expect(result.idempotent).toBe(true);
    expect(transitionArtifactProposal).not.toHaveBeenCalled();
  });

  it("returns idempotent when actionId already produced a version", async () => {
    vi.mocked(listArtifactVersions).mockResolvedValue([
      {
        id: "version-prev",
        lineageId: creativeLineageId,
        versionNumber: 2,
        provenance: { actionId: "action-1" },
      } as never,
    ]);

    const result = await finalizeCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      actionId: "action-1",
    });

    expect(result.idempotent).toBe(true);
    expect(transitionArtifactProposal).not.toHaveBeenCalled();
  });

  it("does NOT re-validate digest, lineage head, or active generation", async () => {
    const { findActiveGenerationForLineage } = await import(
      "@/server/repositories/artifact-version"
    );

    await finalizeCreativeRevisionProposal({
      scope,
      proposalId: "proposal-1",
      lineageId: creativeLineageId,
      sourceVersionId: workingVersionId,
      actionId: "action-1",
    });

    expect(findActiveGenerationForLineage).not.toHaveBeenCalled();
    expect(getArtifactHead).not.toHaveBeenCalled();
    expect(getArtifactVersion).not.toHaveBeenCalled();
    expect(getArtifactLineage).not.toHaveBeenCalled();
  });
});
