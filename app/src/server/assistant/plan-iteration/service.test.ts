import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReviseCreativePlanActionDisplay,
  handlePlanRevisionMessage,
} from "./service";

vi.mock("./intent", () => ({
  classifyPlanRevisionIntent: vi.fn(),
}));

vi.mock("./proposal", () => ({
  proposePlanRevision: vi.fn(),
}));

vi.mock("@/server/assistant/action-contracts/validate", () => ({
  validateProposeAction: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  createAssistantAction: vi.fn(),
}));

import { classifyPlanRevisionIntent } from "./intent";
import { proposePlanRevision } from "./proposal";
import { validateProposeAction } from "@/server/assistant/action-contracts/validate";
import { createAssistantAction } from "@/server/repositories/assistant-action";

const mockClassify = vi.mocked(classifyPlanRevisionIntent);
const mockPropose = vi.mocked(proposePlanRevision);
const mockValidate = vi.mocked(validateProposeAction);
const mockCreateAction = vi.mocked(createAssistantAction);

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
  userMessage: "Ajuste o CTA",
};

describe("buildReviseCreativePlanActionDisplay", () => {
  it("includes proposalId and plan revision fields", () => {
    const display = buildReviseCreativePlanActionDisplay({
      proposal: {
        kind: "proposal",
        proposalId: "proposal-1",
        lineageId: "lineage-1",
        sourceVersionId: "version-1",
        sourceVersionNumber: 2,
        lineageHeadRevision: 2,
        payloadDigest: "a".repeat(64),
        sourceVersionLabel: "v2",
        approvedVersionLabel: "v1",
        workingDiffersFromApproved: true,
        summary: "Altera CTAs",
        changes: [{ field: "ctas", description: "CTA updated" }],
        writes: ["Cria v3 do plano"],
        payload: {
          type: "plan_revision",
          lineageId: "lineage-1",
          sourceVersionId: "version-1",
          proposedSnapshot: {
            strategy: "s",
            angles: [],
            hooks: [],
            ctas: ["Compre já"],
            constraints: [],
          },
          feedback: "Ajuste o CTA",
        },
      },
      baseDisplay: {
        label: "Confirmar revisão do plano",
        riskLabel: "medium",
        creditImpact: { kind: "fixed", credits: 0 },
        confirmationPolicy: "required",
      },
    });

    expect(display).toMatchObject({
      actionType: "revise_creative_plan",
      proposalId: "proposal-1",
      summary: "Altera CTAs",
      sourceVersionLabel: "v2",
      writes: ["Cria v3 do plano"],
      proposalStatus: "pending",
    });
    expect(display.mismatchWarning).toContain("v2");
  });
});

describe("handlePlanRevisionMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassify.mockReturnValue({ kind: "revise" });
  });

  it("returns continue when intent classifier says continue", async () => {
    mockClassify.mockReturnValue({ kind: "continue" });

    const result = await handlePlanRevisionMessage(baseInput);

    expect(result).toEqual({ kind: "continue" });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("returns assistant clarify message", async () => {
    mockPropose.mockResolvedValue({
      kind: "clarify",
      question: "Qual campo ajustar?",
    });

    const result = await handlePlanRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "assistant",
      content: "Qual campo ajustar?",
    });
  });

  it("returns action_card when proposal succeeds", async () => {
    mockPropose.mockResolvedValue({
      kind: "proposal",
      proposalId: "proposal-1",
      lineageId: "lineage-1",
      sourceVersionId: "version-1",
      sourceVersionNumber: 2,
      lineageHeadRevision: 2,
      payloadDigest: "a".repeat(64),
      sourceVersionLabel: "v2",
      approvedVersionLabel: "v1",
      workingDiffersFromApproved: false,
      summary: "Altera CTAs",
      changes: [],
      writes: ["Cria v3 do plano"],
      payload: {
        type: "plan_revision",
        lineageId: "lineage-1",
        sourceVersionId: "version-1",
        proposedSnapshot: {
          strategy: "s",
          angles: [],
          hooks: [],
          ctas: [],
          constraints: [],
        },
        feedback: "Ajuste o CTA",
      },
    });
    mockValidate.mockResolvedValue({
      display: {
        label: "Confirmar revisão do plano",
        riskLabel: "medium",
        creditImpact: { kind: "fixed", credits: 0 },
        confirmationPolicy: "required",
      },
    } as Awaited<ReturnType<typeof validateProposeAction>>);
    mockCreateAction.mockResolvedValue({
      action: { id: "action-1" },
    } as Awaited<ReturnType<typeof createAssistantAction>>);

    const result = await handlePlanRevisionMessage(baseInput);

    expect(result).toEqual({
      kind: "action_card",
      content: "Altera CTAs",
      actionRecordId: "action-1",
    });
    expect(mockCreateAction).toHaveBeenCalled();
  });
});
