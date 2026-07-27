import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
}));

const validateMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const adapterInputMock = vi.hoisted(() => vi.fn());
const startSettlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/assistant/creative-iteration/proposal", () => ({
  validateCreativeRevisionProposal: validateMock,
  confirmCreativeRevision: confirmMock,
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
  CREDIT_COSTS: {
    image_derivation: 5,
    creative_work_output: 5,
    social_post: 5,
    restyling: 5,
    regeneration: 5,
  },
}));

vi.mock("@/server/generation/settlement-adapters", () => ({
  campaignDerivationUnitSettlementAdapter: adapterInputMock,
}));

vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: startSettlementMock,
}));

import "@/server/assistant/action-contracts/contracts";
import { reviseCreativeInputSchema } from "@/server/assistant/action-contracts/contracts/revise-creative";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { executeReviseCreative } from "./revise-creative";

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

const settledValue = {
  derivation: {
    id: "derivation-1",
    campaignId: "campaign-1",
    workspaceId: "ws-1",
    status: "queued",
    format: "1:1",
    generationMode: "creative_revision",
    variantIndex: 0,
  },
};

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
        sourceVersionId: "00000000-4000-4000-8000-000000000201" as unknown as string,
        planVersionId: "00000000-0000-4000-8000-000000000401",
      } as never).success
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
    validateMock.mockResolvedValue({
      proposal: { id: "proposal-1" },
      head: { revision: 1 },
      sourceVersion: { versionNumber: 1 },
      lineage: { id: "lineage-1" },
    });
    confirmMock.mockResolvedValue({
      version: null,
      head: { revision: 1 },
      proposal: { id: "proposal-1", status: "confirmed" },
      idempotent: false,
    });
    adapterInputMock.mockReturnValue({ marker: "adapter-input" });
    startSettlementMock.mockResolvedValue({ ok: true, value: settledValue });
  });

  it("delegates to startGenerationSettlement via the adapter factory and translates the typed result", async () => {
    const result = await executeReviseCreative(buildContext() as never);

    expect(adapterInputMock).toHaveBeenCalledTimes(1);
    expect(startSettlementMock).toHaveBeenCalledTimes(1);
    expect(startSettlementMock).toHaveBeenCalledWith({ marker: "adapter-input" });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "async",
      jobRef: { kind: "derivation", id: "derivation-1" },
      resultSummary: "Revisão do criativo em processamento.",
      campaignId: "campaign-1",
    });
  });

  it("runs side-effect-free preflight BEFORE settlement so a stale proposal never reaches billing", async () => {
    validateMock.mockImplementationOnce(async () => {
      throw new Error("proposal stale");
    });

    await expect(
      executeReviseCreative(buildContext() as never)
    ).rejects.toThrow(/proposal stale/);
    expect(startSettlementMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("blocks on concurrent active generation without reaching settlement", async () => {
    validateMock.mockImplementationOnce(async () => {
      throw new Error("Já existe uma geração em andamento para este criativo.");
    });

    await expect(
      executeReviseCreative(buildContext() as never)
    ).rejects.toThrow(/em andamento/);
    expect(startSettlementMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("does NOT consume the proposal when settlement returns credit_blocked", async () => {
    startSettlementMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", reason: "insufficient_credits" },
    });

    await expect(
      executeReviseCreative(buildContext() as never)
    ).rejects.toMatchObject({ code: "credit_blocked" });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("does NOT consume the proposal when settlement returns dispatch_failed", async () => {
    startSettlementMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "dispatch_failed", value: settledValue, compensated: true },
    });

    await expect(
      executeReviseCreative(buildContext() as never)
    ).rejects.toMatchObject({ code: "execution_failed" });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("confirms the proposal only AFTER settlement produces a real derivation", async () => {
    const callOrder: string[] = [];
    validateMock.mockImplementationOnce(async () => {
      callOrder.push("validate");
      return {
        proposal: { id: "proposal-1" },
        head: { revision: 1 },
        sourceVersion: { versionNumber: 1 },
        lineage: { id: "lineage-1" },
      };
    });
    startSettlementMock.mockImplementationOnce(async () => {
      callOrder.push("settlement");
      return { ok: true, value: settledValue };
    });
    confirmMock.mockImplementationOnce(async () => {
      callOrder.push("confirm");
      return {
        version: null,
        head: { revision: 1 },
        proposal: { id: "proposal-1", status: "confirmed" },
        idempotent: false,
      };
    });

    await executeReviseCreative(buildContext() as never);

    expect(callOrder).toEqual(["validate", "settlement", "confirm"]);
  });

  it("uses the idempotent summary when confirm reports a duplicate confirmation", async () => {
    confirmMock.mockResolvedValueOnce({
      version: null,
      head: { revision: 1 },
      proposal: { id: "proposal-1", status: "confirmed" },
      idempotent: true,
    });

    const result = await executeReviseCreative(buildContext() as never);

    expect(result.resultSummary).toContain("já confirmada");
  });

  it("throws scope_mismatch when thread has no campaign", async () => {
    const { getAssistantThreadById } = await import(
      "@/server/repositories/assistant-thread"
    );
    vi.mocked(getAssistantThreadById).mockResolvedValueOnce({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: null,
    } as never);

    await expect(
      executeReviseCreative(buildContext() as never)
    ).rejects.toMatchObject({ code: "scope_mismatch" });
    expect(startSettlementMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("throws execution_failed on invalid inputs without calling validate, settlement, or confirm", async () => {
    await expect(
      executeReviseCreative(buildContext({ planVersionId: undefined }) as never)
    ).rejects.toMatchObject({ code: "execution_failed" });
    expect(validateMock).not.toHaveBeenCalled();
    expect(startSettlementMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });
});