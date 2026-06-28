import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: vi.fn(),
}));
vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "test-model" },
}));
vi.mock("@/server/assistant/artifact-version/service", () => ({
  adoptArtifactForThread: vi.fn(),
}));
vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(),
}));
vi.mock("@/server/repositories/artifact-version", () => ({
  createArtifactProposal: vi.fn(),
  transitionArtifactProposal: vi.fn(),
  getArtifactHead: vi.fn(),
  getArtifactLineage: vi.fn(),
  getArtifactVersion: vi.fn(),
  listArtifactLineages: vi.fn(),
}));
vi.mock("./draft", () => ({
  clearPlanFeedbackDraft: vi.fn(() => Promise.resolve(false)),
  savePlanFeedbackDraft: vi.fn(() => Promise.resolve({ draftText: "" })),
}));
vi.mock("@/server/assistant/artifact-iteration-telemetry", () => ({
  emitArtifactIterationTelemetry: vi.fn(),
}));

import { adoptArtifactForThread } from "@/server/assistant/artifact-version/service";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import {
  createArtifactProposal,
  getArtifactHead,
  getArtifactLineage,
  getArtifactVersion,
  listArtifactLineages,
  transitionArtifactProposal,
} from "@/server/repositories/artifact-version";
import { getPlanByCampaign } from "@/server/repositories/plan";
import { clearPlanFeedbackDraft } from "./draft";
import {
  cancelPlanRevision,
  proposePlanRevision,
  resolvePlanRevisionSource,
} from "./proposal";

const mockEmitTelemetry = vi.mocked(emitArtifactIterationTelemetry);

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

const lineageId = "00000000-0000-4000-8000-000000000101";
const workingVersionId = "00000000-0000-4000-8000-000000000201";
const approvedVersionId = "00000000-0000-4000-8000-000000000202";

const sourceSnapshot = {
  type: "plan" as const,
  strategy: "Estratégia base",
  angles: ["Ângulo A"],
  hooks: ["Hook 1"],
  ctas: ["Compre agora"],
  constraints: null,
};

const workingVersion = {
  id: workingVersionId,
  lineageId,
  versionNumber: 2,
  snapshot: sourceSnapshot,
  sourceVersionId: approvedVersionId,
};

const approvedVersion = {
  id: approvedVersionId,
  lineageId,
  versionNumber: 1,
  snapshot: sourceSnapshot,
  sourceVersionId: null,
};

const mockGenerate = vi.fn(async () => ({
  strategy: "Estratégia revisada",
  angles: ["Ângulo A"],
  hooks: ["Hook 1"],
  ctas: ["Compre já"],
  constraints: null,
}));

function mockHead(overrides: Record<string, unknown> = {}) {
  return {
    lineageId,
    workingVersionId,
    approvedCurrentVersionId: approvedVersionId,
    revision: 3,
    ...overrides,
  };
}

describe("resolvePlanRevisionSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactLineage).mockResolvedValue({
      id: lineageId,
      artifactType: "plan",
    } as never);
    vi.mocked(getArtifactHead).mockResolvedValue(mockHead() as never);
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) => {
      if (id === workingVersionId) return workingVersion as never;
      if (id === approvedVersionId) return approvedVersion as never;
      return null;
    });
  });

  it("picks working version by default", async () => {
    const result = await resolvePlanRevisionSource(scope, lineageId);
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.sourceVersionId).toBe(workingVersionId);
      expect(result.source.sourceVersionNumber).toBe(2);
    }
  });

  it("falls back to approved current when working is null", async () => {
    vi.mocked(getArtifactHead).mockResolvedValue(
      mockHead({ workingVersionId: null }) as never
    );
    const result = await resolvePlanRevisionSource(scope, lineageId);
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.sourceVersionId).toBe(approvedVersionId);
    }
  });

  it("includes warning metadata when working differs from approved", async () => {
    const result = await resolvePlanRevisionSource(scope, lineageId);
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source.workingDiffersFromApproved).toBe(true);
      expect(result.source.sourceVersionLabel).toBe("v2");
      expect(result.source.approvedVersionLabel).toBe("v1");
    }
  });

  it("asks which plan to revise when no version pointers exist", async () => {
    vi.mocked(getArtifactHead).mockResolvedValue(
      mockHead({ workingVersionId: null, approvedCurrentVersionId: null }) as never
    );
    const result = await resolvePlanRevisionSource(scope, lineageId);
    expect(result).toEqual({
      kind: "ask_target",
      question: expect.stringContaining("versão"),
    });
  });
});

describe("proposePlanRevision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockClear();
    vi.mocked(getArtifactLineage).mockResolvedValue({
      id: lineageId,
      artifactType: "plan",
    } as never);
    vi.mocked(listArtifactLineages).mockResolvedValue([
      { id: lineageId, artifactType: "plan" } as never,
    ]);
    vi.mocked(getArtifactHead).mockResolvedValue(mockHead() as never);
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) => {
      if (id === workingVersionId) return workingVersion as never;
      if (id === approvedVersionId) return approvedVersion as never;
      return null;
    });
    vi.mocked(getPlanByCampaign).mockResolvedValue({ id: "plan-1" } as never);
    vi.mocked(adoptArtifactForThread).mockResolvedValue({
      lineageId,
      working: { id: workingVersionId, versionNumber: 2, snapshot: sourceSnapshot },
      approvedCurrent: { id: approvedVersionId, versionNumber: 1 },
    } as never);
    vi.mocked(createArtifactProposal).mockImplementation(async (input) => ({
      id: `proposal-${Math.random()}`,
      ...input,
      status: "pending",
    }) as never);
  });

  it("creates a pending proposal without changing approved current", async () => {
    const result = await proposePlanRevision({
      scope,
      feedback: "Ajuste o CTA principal para Compre já e revise a estratégia",
      messageId: "msg-1",
      generateRevisedPlanSnapshot: mockGenerate,
    });
    expect(result.kind).toBe("proposal");
    expect(createArtifactProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalType: "plan_revision",
        sourceVersionId: workingVersionId,
      })
    );
    expect(mockEmitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        eventKey: "proposal_created",
        metadata: expect.objectContaining({
          artifactType: "plan",
          lineageId,
          sourceVersionNumber: 2,
          headRevision: 3,
        }),
      })
    );
    const head = await getArtifactHead(scope, lineageId);
    expect(head?.approvedCurrentVersionId).toBe(approvedVersionId);
  });

  it("creates a new proposal on each feedback call without replacing prior pending", async () => {
    await proposePlanRevision({
      scope,
      feedback: "Ajuste o CTA principal para Compre já",
      generateRevisedPlanSnapshot: mockGenerate,
    });
    await proposePlanRevision({
      scope,
      feedback: "Também atualize os ganchos com urgência",
      generateRevisedPlanSnapshot: mockGenerate,
    });
    expect(createArtifactProposal).toHaveBeenCalledTimes(2);
    expect(transitionArtifactProposal).not.toHaveBeenCalled();
  });

  it("returns clarify for vague feedback without creating a proposal", async () => {
    const result = await proposePlanRevision({
      scope,
      feedback: "melhora",
      messageId: "msg-1",
    });
    expect(result.kind).toBe("clarify");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("redirects out-of-scope briefing feedback", async () => {
    const result = await proposePlanRevision({
      scope,
      feedback: "Mude o público-alvo e o orçamento da campanha no briefing",
      messageId: "msg-1",
    });
    expect(result.kind).toBe("redirect");
    expect(createArtifactProposal).not.toHaveBeenCalled();
  });

  it("builds changes and neutral summary server-side", async () => {
    const result = await proposePlanRevision({
      scope,
      feedback: "Ajuste o CTA principal para Compre já e revise a estratégia",
      messageId: "msg-1",
      generateRevisedPlanSnapshot: mockGenerate,
    });
    expect(result.kind).toBe("proposal");
    if (result.kind === "proposal") {
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.summary).not.toContain("Compre já");
      expect(result.payload.proposedSnapshot.ctas).toEqual(["Compre já"]);
      expect(result.payload.changes).toEqual(result.changes);
      expect(clearPlanFeedbackDraft).toHaveBeenCalledWith(scope);
    }
  });

  it("preserves all plan fields in proposed snapshot", async () => {
    const result = await proposePlanRevision({
      scope,
      feedback: "Ajuste o CTA principal para Compre já",
      messageId: "msg-1",
      generateRevisedPlanSnapshot: mockGenerate,
    });
    expect(result.kind).toBe("proposal");
    if (result.kind === "proposal") {
      expect(result.payload.proposedSnapshot).toMatchObject({
        type: "plan",
        angles: ["Ângulo A"],
        hooks: ["Hook 1"],
      });
      expect(createArtifactProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: "Ajuste o CTA principal para Compre já",
        })
      );
    }
  });
});

describe("cancelPlanRevision", () => {
  it("transitions proposal to canceled without version mutation", async () => {
    vi.mocked(transitionArtifactProposal).mockResolvedValue({
      id: "proposal-1",
      status: "canceled",
    } as never);
    const result = await cancelPlanRevision(scope, "proposal-1");
    expect(transitionArtifactProposal).toHaveBeenCalledWith({
      scope,
      proposalId: "proposal-1",
      nextStatus: "canceled",
    });
    expect(result.status).toBe("canceled");
  });
});
