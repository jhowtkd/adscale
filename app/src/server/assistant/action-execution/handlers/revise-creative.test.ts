import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
}));

vi.mock("@/server/assistant/creative-iteration/proposal", () => ({
  confirmCreativeRevision: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
  failQueuedDerivation: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
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
      jobRefs: [],
    })
  ),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn(() => Promise.resolve({ ids: ["event-1"] })),
  },
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(() => Promise.resolve(null)),
  trackUsage: vi.fn(() => Promise.resolve({ id: "u-1" })),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(),
  CREDIT_COSTS: { image_derivation: 5, creative_work_output: 5, social_post: 5, restyling: 5, regeneration: 5 },
}));

vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: vi.fn(),
}));

import "@/server/assistant/action-contracts/contracts";
import { confirmCreativeRevision } from "@/server/assistant/creative-iteration/proposal";
import { createDerivation } from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { reviseCreativeInputSchema } from "@/server/assistant/action-contracts/contracts/revise-creative";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { executeReviseCreative } from "./revise-creative";

const mockConfirm = vi.mocked(confirmCreativeRevision);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockInngestSend = vi.mocked(inngest.send);
const mockStartSettlement = vi.mocked(startGenerationSettlement);

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

  it("exposes reviseCreativeInputSchema", () => {
    expect(reviseCreativeInputSchema).toBeDefined();
  });

  it("validates a fully-populated input snapshot including planVersionId", () => {
    expect(
      reviseCreativeInputSchema.safeParse({
        proposalId: "00000000-0000-4000-8000-000000000301",
        lineageId: "00000000-0000-4000-8000-000000000101",
        sourceVersionId: "00000000-0000-4000-8000-000000000201",
        payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        planVersionId: "00000000-0000-4000-8000-000000000401",
      }).success
    ).toBe(true);
  });

  it("rejects missing planVersionId", () => {
    expect(
      reviseCreativeInputSchema.safeParse({
        proposalId: "00000000-0000-4000-8000-000000000301",
        lineageId: "00000000-0000-4000-8000-000000000101",
        sourceVersionId: "00000000-0000-4000-8000-000000000201",
        payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      }).success
    ).toBe(false);
  });

  it("rejects missing payloadDigest", () => {
    expect(
      reviseCreativeInputSchema.safeParse({
        proposalId: "00000000-0000-4000-8000-000000000301",
        lineageId: "00000000-0000-4000-8000-000000000101",
        sourceVersionId: "00000000-0000-4000-8000-000000000201",
        planVersionId: "00000000-0000-4000-8000-000000000401",
      }).success
    ).toBe(false);
  });

  it("rejects payload digest that is not exactly 64 characters", () => {
    expect(
      reviseCreativeInputSchema.safeParse({
        proposalId: "00000000-0000-4000-8000-000000000301",
        lineageId: "00000000-0000-4000-8000-000000000101",
        sourceVersionId: "00000000-0000-4000-8000-000000000201",
        payloadDigest: "tooshort",
        planVersionId: "00000000-0000-4000-8000-000000000401",
      }).success
    ).toBe(false);
  });
});

describe("executeReviseCreative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDerivation.mockResolvedValue({
      id: "derivation-1",
      campaignId: "campaign-1",
      workspaceId: "ws-1",
      status: "queued",
      format: "1:1",
      generationMode: "creative_revision",
      variantIndex: 0,
      updatedAt: new Date("2026-07-27T12:00:00.000Z"),
    } as never);
    mockInngestSend.mockResolvedValue({ ids: ["event-1"] } as never);
    mockStartSettlement.mockImplementation(async (adapter) => {
      const reservation = await adapter.reserve();
      const charge = await adapter.charge(reservation);
      if (!charge.ok) return { ok: false, error: { code: "credit_blocked", reason: charge.reason } };
      await adapter.dispatch(reservation);
      await adapter.completeDispatch(reservation);
      return { ok: true, value: reservation.value };
    });
    mockConfirm.mockResolvedValue({
      proposal: null,
      head: null,
      idempotent: false,
      version: { id: "v-new", versionNumber: 1 },
    } as never);
  });

  it("delegates charge, reservation, dispatch, and ack to Generation Settlement", async () => {
    const result = await executeReviseCreative(buildContext() as never);

    expect(result.mode).toBe("async");
    expect(mockStartSettlement).toHaveBeenCalledTimes(1);
    expect(mockCreateDerivation).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
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

  it("duplicate confirm surfaces idempotent summary", async () => {
    mockConfirm.mockResolvedValue({
      proposal: null,
      head: null,
      idempotent: true,
      version: { id: "v-existing", versionNumber: 4 },
    } as never);

    const result = await executeReviseCreative(buildContext() as never);

    expect(result.resultSummary).toContain("já confirmada");
  });

  it("throws credit_blocked when settlement reports credit_blocked", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", reason: "insufficient_credits" },
    });

    await expect(executeReviseCreative(buildContext() as never)).rejects.toMatchObject({
      code: "credit_blocked",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("throws execution_failed when settlement reports dispatch_failed", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "dispatch_failed",
        value: {
          derivation: {
            id: "derivation-1",
            campaignId: "campaign-1",
            workspaceId: "ws-1",
            status: "failed",
          },
        },
        compensated: true,
      },
    });

    await expect(executeReviseCreative(buildContext() as never)).rejects.toMatchObject({
      code: "execution_failed",
    });
  });

  it("throws execution_failed when thread has no campaign", async () => {
    const { getAssistantThreadById } = await import(
      "@/server/repositories/assistant-thread"
    );
    vi.mocked(getAssistantThreadById).mockResolvedValueOnce({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: null,
    } as never);

    await expect(executeReviseCreative(buildContext() as never)).rejects.toMatchObject({
      code: "scope_mismatch",
    });
  });

  it("invalid inputs throws execution_failed", async () => {
    await expect(
      executeReviseCreative(buildContext({ planVersionId: undefined }) as never)
    ).rejects.toMatchObject({ code: "execution_failed" });
    expect(mockStartSettlement).not.toHaveBeenCalled();
  });
});