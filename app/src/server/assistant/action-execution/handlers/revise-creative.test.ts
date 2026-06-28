import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActionState = vi.hoisted(() => ({
  jobRefs: [] as Array<{ kind: string; id: string }>,
}));

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(),
}));

vi.mock("@/server/assistant/creative-iteration/proposal", () => ({
  confirmCreativeRevision: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(() =>
    Promise.resolve({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: "campaign-1",
    })
  ),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(() =>
    Promise.resolve({
      id: "action-1",
      workspaceId: "ws-1",
      threadId: "thread-1",
      messageId: "message-1",
      status: "confirmed",
      inputSnapshot: {},
      jobRefs: mockActionState.jobRefs,
    })
  ),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn(() => Promise.resolve({ ids: ["event-1"] })),
  },
}));

import "@/server/assistant/action-contracts/contracts";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { confirmCreativeRevision } from "@/server/assistant/creative-iteration/proposal";
import { createDerivation, updateDerivationStatus } from "@/server/repositories/derivation";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { inngest } from "@/server/jobs/client";
import { reviseCreativeInputSchema } from "@/server/assistant/action-contracts/contracts/revise-creative";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { executeReviseCreative } from "./revise-creative";

const mockSpendCredits = vi.mocked(spendCreditsOrApiError);
const mockConfirm = vi.mocked(confirmCreativeRevision);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockUpdateDerivationStatus = vi.mocked(updateDerivationStatus);
const mockInngestSend = vi.mocked(inngest.send);
const mockGetAction = vi.mocked(getAssistantActionById);

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    threadId: "thread-1",
    userId: "user-1",
    actionId: "action-1",
    actionType: "revise_creative",
    locale: "pt-BR",
    inputSnapshot: {
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      planVersionId: "00000000-0000-4000-8000-000000000401",
      ...overrides,
    },
  };
}

describe("revise_creative contract", () => {
  it("registers revise_creative in the action contract registry", () => {
    const contract = getActionContract("revise_creative");
    expect(contract).toBeDefined();
    expect(contract?.actionType).toBe("revise_creative");
    expect(contract?.intentFamily).toBe("complete_campaign");
    expect(contract?.riskLabel).toBe("medium");
    expect(contract?.confirmationPolicy).toBe("required");
    expect(contract?.requiredFields).toContain("planVersionId");
  });

  it("uses creditAction credit impact with image_derivation action", () => {
    const contract = getActionContract("revise_creative");
    expect(contract?.creditImpact).toEqual({
      kind: "creditAction",
      action: "image_derivation",
      label: "5 créditos",
    });
  });

  it("validates a fully-populated input snapshot including planVersionId", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      planVersionId: "00000000-0000-4000-8000-000000000401",
      lineageHeadRevision: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing planVersionId", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing payloadDigest", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      planVersionId: "00000000-0000-4000-8000-000000000401",
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload digest that is not exactly 64 characters", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "short-digest",
      planVersionId: "00000000-0000-4000-8000-000000000401",
    });
    expect(result.success).toBe(false);
  });
});

describe("executeReviseCreative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActionState.jobRefs = [];
    mockGetAction.mockResolvedValue({
      id: "action-1",
      workspaceId: "ws-1",
      threadId: "thread-1",
      messageId: "message-1",
      status: "confirmed",
      inputSnapshot: {},
      jobRefs: mockActionState.jobRefs,
    } as Awaited<ReturnType<typeof getAssistantActionById>>);
    mockSpendCredits.mockResolvedValue(null);
    mockConfirm.mockResolvedValue({
      proposal: { id: "proposal-1", status: "confirmed" },
      head: { revision: 0, workingVersionId: "v-1", approvedCurrentVersionId: null },
      idempotent: false,
      version: null,
    } as never);
    mockCreateDerivation.mockResolvedValue({
      id: "derivation-1",
      campaignId: "campaign-1",
      workspaceId: "ws-1",
      status: "queued",
      generationMode: "creative_revision",
      format: "1:1",
      variantIndex: 0,
    } as never);
  });

  it("charges credits with deterministic per-attempt idempotency key on first attempt", async () => {
    const result = await executeReviseCreative(buildContext() as never);

    expect(mockSpendCredits).toHaveBeenCalledTimes(1);
    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        action: "image_derivation",
        amount: 5,
        idempotencyKey: "assistant-action:action-1:creative_revision:retry:0",
        metadata: expect.objectContaining({
          actionId: "action-1",
          campaignId: "campaign-1",
          mode: "creative_revision",
          attempt: 0,
        }),
        userId: "user-1",
      })
    );
    expect(result.mode).toBe("async");
  });

  it("enqueues derivation.generate job with assistantActionId, planVersionId, and creative_revision mode", async () => {
    await executeReviseCreative(buildContext() as never);

    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        workspaceId: "ws-1",
        status: "queued",
        generationMode: "creative_revision",
        variantIndex: 0,
      })
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({
          derivationId: "derivation-1",
          campaignId: "campaign-1",
          workspaceId: "ws-1",
          triggeredByUserId: "user-1",
          locale: "pt-BR",
          generationMode: "creative_revision",
          variantIndex: 0,
          format: "1:1",
          assistantActionId: "action-1",
          planVersionId: "00000000-0000-4000-8000-000000000401",
        }),
      })
    );
  });

  it("returns async mode with derivation jobRef", async () => {
    const result = await executeReviseCreative(buildContext() as never);

    expect(result).toEqual({
      mode: "async",
      jobRef: { kind: "derivation", id: "derivation-1" },
      resultSummary: expect.stringContaining("Revisão do criativo"),
      campaignId: "campaign-1",
    });
  });

  it("duplicate confirm is idempotent — spend returns duplicate, confirm returns idempotent", async () => {
    mockSpendCredits.mockResolvedValue(null);
    mockConfirm.mockResolvedValue({
      proposal: null,
      head: null,
      idempotent: true,
      version: { id: "v-existing", versionNumber: 4 },
    } as never);

    const result = await executeReviseCreative(buildContext() as never);

    expect(mockSpendCredits).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockCreateDerivation).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(result.resultSummary).toContain("já confirmada");
  });

  it("retry charges again with deterministic per-attempt key derived from jobRefs.length", async () => {
    mockActionState.jobRefs = [
      { kind: "derivation", id: "derivation-old-1" },
    ];
    mockGetAction.mockResolvedValue({
      id: "action-1",
      workspaceId: "ws-1",
      threadId: "thread-1",
      messageId: "message-1",
      status: "failed",
      inputSnapshot: {},
      jobRefs: mockActionState.jobRefs,
    } as Awaited<ReturnType<typeof getAssistantActionById>>);

    await executeReviseCreative(buildContext() as never);

    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "assistant-action:action-1:creative_revision:retry:1",
        metadata: expect.objectContaining({ attempt: 1 }),
      })
    );
  });

  it("second retry uses retry:2 idempotency key", async () => {
    mockActionState.jobRefs = [
      { kind: "derivation", id: "derivation-old-1" },
      { kind: "derivation", id: "derivation-old-2" },
    ];
    mockGetAction.mockResolvedValue({
      id: "action-1",
      workspaceId: "ws-1",
      threadId: "thread-1",
      messageId: "message-1",
      status: "failed",
      inputSnapshot: {},
      jobRefs: mockActionState.jobRefs,
    } as Awaited<ReturnType<typeof getAssistantActionById>>);

    await executeReviseCreative(buildContext() as never);

    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "assistant-action:action-1:creative_revision:retry:2",
        metadata: expect.objectContaining({ attempt: 2 }),
      })
    );
  });

  it("insufficient credits throws credit_blocked", async () => {
    mockSpendCredits.mockResolvedValue({ error: "insufficient_credits", status: 402 } as never);

    await expect(executeReviseCreative(buildContext() as never)).rejects.toMatchObject({
      code: "credit_blocked",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("one active generation per lineage blocks concurrent confirm", async () => {
    mockConfirm.mockRejectedValue(
      new Error("Já existe uma geração em andamento para este criativo.")
    );

    await expect(executeReviseCreative(buildContext() as never)).rejects.toThrow(
      /em andamento/
    );
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("inngest.send failure marks derivation as failed and throws execution_failed", async () => {
    mockInngestSend.mockRejectedValueOnce(new Error("send failed"));

    await expect(executeReviseCreative(buildContext() as never)).rejects.toMatchObject({
      code: "execution_failed",
    });
    expect(mockUpdateDerivationStatus).toHaveBeenCalledWith(
      "derivation-1",
      "ws-1",
      "failed"
    );
  });

  it("invalid inputs throws execution_failed", async () => {
    await expect(
      executeReviseCreative(buildContext({ planVersionId: undefined }) as never)
    ).rejects.toMatchObject({ code: "execution_failed" });
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });
});
