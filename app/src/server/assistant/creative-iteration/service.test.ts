import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReviseCreativeActionDisplay,
  handleCreativeRevisionMessage,
  markCreativeProposalsStaleOnPlanChange,
} from "./service";

vi.mock("./intent", () => ({
  classifyCreativeRevisionIntent: vi.fn(),
}));

vi.mock("./proposal", () => ({
  proposeCreativeRevision: vi.fn(),
}));

vi.mock("@/server/assistant/action-contracts/validate", () => ({
  validateProposeAction: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  createAssistantAction: vi.fn(),
}));

vi.mock("@/server/repositories/artifact-version", async (original) => {
  const actual = await original<typeof import("@/server/repositories/artifact-version")>();
  return {
    ...actual,
    listArtifactProposalsByPlanVersion: vi.fn(),
    transitionArtifactProposal: vi.fn(),
  };
});

import { classifyCreativeRevisionIntent } from "./intent";
import { proposeCreativeRevision } from "./proposal";
import { validateProposeAction } from "@/server/assistant/action-contracts/validate";
import { createAssistantAction } from "@/server/repositories/assistant-action";
import {
  listArtifactProposalsByPlanVersion,
  transitionArtifactProposal,
} from "@/server/repositories/artifact-version";

const mockClassify = vi.mocked(classifyCreativeRevisionIntent);
const mockPropose = vi.mocked(proposeCreativeRevision);
const mockValidate = vi.mocked(validateProposeAction);
const mockCreateAction = vi.mocked(createAssistantAction);
const mockListByPlanVersion = vi.mocked(listArtifactProposalsByPlanVersion);
const mockTransition = vi.mocked(transitionArtifactProposal);

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  userId: "user-1",
  scope: {
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    campaignId: "campaign-1",
    threadId: "thread-1",
  },
  userMessage: "Muda a cor de fundo para azul",
};

const buildProposalResult = () => ({
  kind: "proposal" as const,
  proposalId: "proposal-1",
  lineageId: "lineage-1",
  sourceVersionId: "version-1",
  sourceVersionNumber: 2,
  planVersionId: "plan-version-1",
  planVersionLabel: "v2",
  lineageHeadRevision: 2,
  payloadDigest: "a".repeat(64),
  sourceVersionLabel: "v2",
  approvedVersionLabel: "v1",
  workingDiffersFromApproved: true,
  summary: "Muda cor de fundo para azul",
  intendedChanges: ["Cor de fundo: azul"],
  format: "1:1",
  referenceIds: ["ref-1", "ref-2"],
  creditImpact: 5,
  writes: ["Gera nova versão do criativo", "Cobra 5 créditos"],
  payload: {
    type: "creative_revision" as const,
    schemaVersion: 1 as const,
    summary: "Muda cor de fundo para azul",
    intendedChanges: ["Cor de fundo: azul"],
    format: "1:1",
    referenceIds: ["ref-1", "ref-2"],
    creditImpact: 5,
    writes: ["Gera nova versão do criativo", "Cobra 5 créditos"],
    planVersionId: "plan-version-1",
  },
});

describe("buildReviseCreativeActionDisplay", () => {
  it("includes creative revision fields", () => {
    const display = buildReviseCreativeActionDisplay({
      proposal: buildProposalResult(),
      baseDisplay: {
        label: "Confirmar revisão do criativo",
        riskLabel: "medium",
        creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
        riskCopyLines: [],
        confirmationPolicy: "required",
      },
      resolvedReferences: [
        { id: "ref-1", name: "Hero shot", thumbnailUrl: null },
        { id: "ref-2", name: "Logo dark", thumbnailUrl: null },
      ],
    });

    expect(display).toMatchObject({
      actionType: "revise_creative",
      proposalId: "proposal-1",
      summary: "Muda cor de fundo para azul",
      sourceVersionLabel: "v2",
      approvedVersionLabel: "v1",
      workingDiffersFromApproved: true,
      intendedChanges: ["Cor de fundo: azul"],
      format: "1:1",
      referenceCount: 2,
      planVersionLabel: "v2",
      writes: ["Gera nova versão do criativo", "Cobra 5 créditos"],
      proposalStatus: "pending",
      creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
    });
    expect(display.referenceItems).toEqual([
      { id: "ref-1", name: "Hero shot", thumbnailUrl: null },
      { id: "ref-2", name: "Logo dark", thumbnailUrl: null },
    ]);
    expect(display.mismatchWarning).toContain("v2");
  });

  it("falls back to referenceCount when referenceIds can't be resolved", () => {
    const display = buildReviseCreativeActionDisplay({
      proposal: buildProposalResult(),
      baseDisplay: {
        label: "Confirmar revisão do criativo",
        riskLabel: "medium",
        creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
        riskCopyLines: [],
        confirmationPolicy: "required",
      },
      resolvedReferences: [],
    });

    expect(display.referenceCount).toBe(2);
    expect(display.referenceItems).toBeUndefined();
  });

  it("omits mismatchWarning when working matches approved", () => {
    const proposal = {
      ...buildProposalResult(),
      workingDiffersFromApproved: false,
      approvedVersionLabel: "v2",
    };

    const display = buildReviseCreativeActionDisplay({
      proposal,
      baseDisplay: {
        label: "Confirmar revisão do criativo",
        riskLabel: "medium",
        creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
        riskCopyLines: [],
        confirmationPolicy: "required",
      },
      resolvedReferences: [],
    });

    expect(display.mismatchWarning).toBeUndefined();
  });
});

describe("handleCreativeRevisionMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassify.mockReturnValue({ kind: "creative" });
  });

  it("returns continue when intent classifier says continue", async () => {
    mockClassify.mockReturnValue({ kind: "continue" });

    const result = await handleCreativeRevisionMessage(baseInput);

    expect(result).toEqual({ kind: "continue" });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("returns assistant clarify message", async () => {
    mockPropose.mockResolvedValue({
      kind: "clarify",
      question: "Pode detalhar o que deve mudar no criativo?",
    });

    const result = await handleCreativeRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "assistant",
      content: "Pode detalhar o que deve mudar no criativo?",
    });
    expect(mockCreateAction).not.toHaveBeenCalled();
  });

  it("returns assistant ask_target message", async () => {
    mockPropose.mockResolvedValue({
      kind: "ask_target",
      question: "Qual criativo desta conversa você quer revisar?",
    });

    const result = await handleCreativeRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "assistant",
      content: "Qual criativo desta conversa você quer revisar?",
    });
    expect(mockCreateAction).not.toHaveBeenCalled();
  });

  it("returns assistant redirect message", async () => {
    mockPropose.mockResolvedValue({
      kind: "redirect",
      message: "Esse pedido muda o formato. Use a adaptação de formato.",
    });

    const result = await handleCreativeRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "assistant",
      content: "Esse pedido muda o formato. Use a adaptação de formato.",
    });
    expect(mockCreateAction).not.toHaveBeenCalled();
  });

  it("returns action_card with planVersionId in inputSnapshot when proposal succeeds", async () => {
    mockPropose.mockResolvedValue(buildProposalResult());
    mockValidate.mockResolvedValue({
      display: {
        label: "Confirmar revisão do criativo",
        actionType: "revise_creative",
        riskLabel: "medium",
        creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
        riskCopyLines: [],
        confirmationPolicy: "required",
      },
      contract: {} as never,
    } as Awaited<ReturnType<typeof validateProposeAction>>);
    mockCreateAction.mockResolvedValue({
      action: { id: "action-1" },
    } as Awaited<ReturnType<typeof createAssistantAction>>);

    const result = await handleCreativeRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "action_card",
      content: "Muda cor de fundo para azul",
      actionRecordId: "action-1",
    });

    expect(mockValidate).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", threadId: "thread-1", userId: "user-1" }),
      expect.objectContaining({
        actionType: "revise_creative",
        inputSnapshot: expect.objectContaining({
          proposalId: "proposal-1",
          lineageId: "lineage-1",
          sourceVersionId: "version-1",
          payloadDigest: "a".repeat(64),
          planVersionId: "plan-version-1",
        }),
      })
    );

    expect(mockCreateAction).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        threadId: "thread-1",
        inputSnapshot: expect.objectContaining({
          proposalId: "proposal-1",
          lineageId: "lineage-1",
          sourceVersionId: "version-1",
          payloadDigest: "a".repeat(64),
          planVersionId: "plan-version-1",
        }),
        display: expect.objectContaining({
          actionType: "revise_creative",
          proposalId: "proposal-1",
          planVersionLabel: "v2",
        }),
      })
    );
  });

  it("passes attachmentReferenceIds to proposeCreativeRevision", async () => {
    mockPropose.mockResolvedValue({
      kind: "clarify",
      question: "...",
    });

    await handleCreativeRevisionMessage({
      ...baseInput,
      attachmentReferenceIds: ["att-1", "att-2"],
    });

    expect(mockPropose).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: baseInput.scope,
        feedback: baseInput.userMessage,
        attachmentReferenceIds: ["att-1", "att-2"],
      })
    );
  });
});

describe("markCreativeProposalsStaleOnPlanChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions pending creative proposals matching planVersionId to stale", async () => {
    mockListByPlanVersion.mockResolvedValue([
      { id: "proposal-1", status: "pending", proposalType: "creative_revision" },
      { id: "proposal-2", status: "pending", proposalType: "creative_revision" },
    ] as never);
    mockTransition.mockResolvedValue({} as never);

    const result = await markCreativeProposalsStaleOnPlanChange({
      scope: baseInput.scope,
      oldPlanVersionId: "plan-version-1",
    });

    expect(result).toEqual({ staleProposalIds: ["proposal-1", "proposal-2"] });
    expect(mockListByPlanVersion).toHaveBeenCalledWith({
      scope: baseInput.scope,
      planVersionId: "plan-version-1",
    });
    expect(mockTransition).toHaveBeenCalledTimes(2);
    expect(mockTransition).toHaveBeenNthCalledWith(1, {
      scope: baseInput.scope,
      proposalId: "proposal-1",
      nextStatus: "stale",
    });
    expect(mockTransition).toHaveBeenNthCalledWith(2, {
      scope: baseInput.scope,
      proposalId: "proposal-2",
      nextStatus: "stale",
    });
  });

  it("returns empty list when no matching proposals", async () => {
    mockListByPlanVersion.mockResolvedValue([] as never);

    const result = await markCreativeProposalsStaleOnPlanChange({
      scope: baseInput.scope,
      oldPlanVersionId: "plan-version-1",
    });

    expect(result).toEqual({ staleProposalIds: [] });
    expect(mockTransition).not.toHaveBeenCalled();
  });
});
