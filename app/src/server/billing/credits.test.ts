import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getAvailableCreditGrants: vi.fn(),
  updateCreditGrantRemaining: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

vi.mock("@/server/repositories/credit-transactions", () => ({
  createCreditTransaction: vi.fn(),
}));

vi.mock("@/server/billing/unlimited-access", () => ({
  workspaceHasUnlimitedBillingAccess: vi.fn(() => Promise.resolve(false)),
  UNLIMITED_CREDIT_BALANCE: 999_999,
}));

vi.spyOn(db, "transaction").mockImplementation(async (callback) => callback({} as never));

import { db } from "@/server/db";

import { getWorkspaceBillingAccess } from "@/server/billing/access";
import {
  getAvailableCreditGrants,
  updateCreditGrantRemaining,
} from "@/server/repositories/billing";
import {
  getUsageByIdempotencyKey,
  trackUsage,
} from "@/server/repositories/usage";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { createCreditTransaction } from "@/server/repositories/credit-transactions";
import { workspaceHasUnlimitedBillingAccess } from "@/server/billing/unlimited-access";
import { canSpend, recordUsage, refundCredits } from "./credits";

const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockUpdateCreditGrantRemaining = vi.mocked(updateCreditGrantRemaining);
const mockGetUsageByIdempotencyKey = vi.mocked(getUsageByIdempotencyKey);
const mockTrackUsage = vi.mocked(trackUsage);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);
const mockCreateCreditTransaction = vi.mocked(createCreditTransaction);
const mockWorkspaceHasUnlimitedBillingAccess = vi.mocked(workspaceHasUnlimitedBillingAccess);

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

function paidAccess() {
  return {
    kind: "paid" as const,
    label: "Assinatura ativa",
    creditBalance: 20,
    remainingAds: 4,
    hasSpendAccess: true,
    subscription: null,
    betaEntitlement: null,
  };
}

function betaAccess() {
  return {
    kind: "beta" as const,
    label: "Acesso beta",
    creditBalance: 50,
    remainingAds: 10,
    hasSpendAccess: true,
    subscription: null,
    betaEntitlement: null,
  };
}

function noAccess() {
  return {
    kind: "none" as const,
    label: "Sem acesso ativo",
    creditBalance: 20,
    remainingAds: null,
    hasSpendAccess: false,
    subscriptionStatus: "none" as const,
    subscription: null,
    latestSubscription: null,
    betaEntitlement: null,
  };
}

function pastDueAccess() {
  return {
    kind: "paid" as const,
    label: "Pagamento pendente",
    creditBalance: 30,
    remainingAds: 6,
    hasSpendAccess: true,
    subscriptionStatus: "past_due" as const,
    subscription: null,
    latestSubscription: { status: "past_due" },
    betaEntitlement: null,
  };
}

function grant(id: string, remaining: number) {
  return {
    id,
    workspaceId: "workspace-1",
    source: "subscription",
    sourceId: "sub_123",
    amount: remaining,
    remaining,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("credit entitlement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );
    mockGetWorkspaceBillingAccess.mockResolvedValue(paidAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 20)]);
  });

  it("allows active subscriptions with enough credits", async () => {
    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 5, balance: 20 });
  });

  it("blocks workspaces without paid or beta access", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(noAccess());

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 5,
      balance: 20,
      reason: "inactive_subscription",
    });
  });

  it("allows past_due workspaces to spend existing credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(pastDueAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 30)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 5, balance: 30 });
  });

  it("allows beta workspaces with enough credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 50)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 5, balance: 50 });
  });

  it("blocks beta workspaces without credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 2)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 5,
      balance: 2,
      reason: "insufficient_credits",
    });
  });

  it("blocks insufficient credit balance", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 3)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 5,
      balance: 3,
      reason: "insufficient_credits",
    });
  });

  it("does not double debit duplicate idempotency keys", async () => {
    const existingUsage = {
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 5,
      idempotencyKey: "derivation:123",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockResolvedValue(existingUsage);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
    });

    expect(result).toEqual({ status: "duplicate", usage: existingUsage });
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  it("debits grants and records usage with metadata", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([
      grant("grant-1", 3),
      grant("grant-2", 7),
    ]);
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 5,
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123", creditAmount: 5 },
      createdAt: new Date(),
    });

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123" },
    });

    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith("grant-1", 0, expect.anything());
    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith("grant-2", 5, expect.anything());
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "image_derivation",
      5,
      { derivationId: "123", creditAmount: 5, unlimitedBillingBypass: undefined },
      "derivation:123",
      expect.anything()
    );
    expect(result.status).toBe("recorded");
  });

  it("emits credit_spend on successful recordUsage when userId is provided", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 5,
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123", creditAmount: 5 },
      createdAt: new Date(),
    });

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
      userId: "user-1",
      metadata: {
        campaignId: "550e8400-e29b-41d4-a716-446655440001",
        derivationId: "550e8400-e29b-41d4-a716-446655440002",
        estimateCredits: 5,
        betaSessionId: VALID_SESSION_ID,
      },
    });
    await flushAnalytics();

    expect(result.status).toBe("recorded");
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "credit_spend",
        source: "server",
        userId: "user-1",
        workspaceId: "workspace-1",
        sessionId: VALID_SESSION_ID,
        properties: expect.objectContaining({
          operation: "image_derivation",
          operation_key: "image_derivation",
          actualCredits: 5,
          estimateCredits: 5,
        }),
      })
    );
  });

  it("emits creditDelta when estimate differs from actual spend", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 8,
      idempotencyKey: "derivation:delta",
      metadata: { creditAmount: 8 },
      createdAt: new Date(),
    });

    await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      amount: 8,
      idempotencyKey: "derivation:delta",
      userId: "user-1",
      metadata: {
        preview: true,
        operation_key: "preview",
        estimateCredits: 5,
      },
    });
    await flushAnalytics();

    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "credit_spend",
        properties: expect.objectContaining({
          operation_key: "preview",
          estimateCredits: 5,
          actualCredits: 8,
          creditDelta: 3,
        }),
      })
    );
  });

  it("emits credit_blocked when recordUsage is blocked and userId is provided", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 3)]);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:blocked",
      userId: "user-1",
    });
    await flushAnalytics();

    expect(result.status).toBe("blocked");
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "credit_blocked",
        source: "server",
        userId: "user-1",
        properties: expect.objectContaining({
          operation: "image_derivation",
          operation_key: "image_derivation",
          reasonCode: "insufficient_credits",
          estimateCredits: 5,
        }),
      })
    );
  });

  it("does not change recordUsage result when analytics emit fails", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 5,
      idempotencyKey: "derivation:123",
      metadata: { creditAmount: 5 },
      createdAt: new Date(),
    });
    mockRecordBetaAnalyticsEvent.mockRejectedValue(new Error("analytics down"));

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:analytics-fail",
      userId: "user-1",
    });
    await flushAnalytics();

    expect(result.status).toBe("recorded");
  });
});

describe("refundCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );
    mockWorkspaceHasUnlimitedBillingAccess.mockResolvedValue(false);
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 10)]);
    mockCreateCreditTransaction.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      campaignId: null,
      derivationId: null,
      amount: 5,
      type: "refund",
      description: "image_derivation_refund",
      createdAt: new Date(),
    });
    mockTrackUsage.mockResolvedValue({
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -5,
      idempotencyKey: "refund-key",
      metadata: { refund: true, creditAmount: 5 },
      createdAt: new Date(),
    });
  });

  it("credits grants back and creates refund transaction", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 8)]);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-1:refund",
      userId: "user-1",
      metadata: { actionId: "action-1", derivationId: "derivation-1" },
    });

    expect(result.status).toBe("refunded");
    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith(
      "grant-1",
      13,
      expect.anything()
    );
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "image_derivation",
      -5,
      expect.objectContaining({
        refund: true,
        creditAmount: 5,
        actionId: "action-1",
        derivationId: "derivation-1",
      }),
      "assistant-action:action-1:refund"
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        amount: 5,
        type: "refund",
        description: "image_derivation_refund",
        derivationId: "derivation-1",
      })
    );
  });

  it("returns duplicate on repeat idempotency key without double-crediting", async () => {
    const existingUsage = {
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -5,
      idempotencyKey: "assistant-action:action-1:refund",
      metadata: { refund: true, creditAmount: 5 },
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockResolvedValue(existingUsage);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-1:refund",
    });

    expect(result.status).toBe("duplicate");
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockTrackUsage).not.toHaveBeenCalled();
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("does not modify grants for unlimited billing workspaces but still records transaction", async () => {
    mockWorkspaceHasUnlimitedBillingAccess.mockResolvedValue(true);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-dev:refund",
      userId: "user-1",
      metadata: { actionId: "action-dev" },
    });

    expect(result.status).toBe("refunded");
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "image_derivation",
      0,
      expect.objectContaining({
        refund: true,
        creditAmount: 5,
        unlimitedBillingBypass: true,
      }),
      "assistant-action:action-dev:refund"
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5,
        type: "refund",
        userId: "user-1",
      })
    );
  });

  it("does not call canSpend — refund is unconditional", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([]);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-empty:refund",
      userId: "user-1",
    });

    expect(result.status).toBe("refunded");
    expect(mockGetWorkspaceBillingAccess).not.toHaveBeenCalled();
    expect(mockTrackUsage).toHaveBeenCalled();
  });

  it("uses default credit cost when amount is not provided", async () => {
    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "landing_page",
      idempotencyKey: "assistant-action:action-lp:refund",
      userId: "user-1",
    });

    expect(result.status).toBe("refunded");
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "landing_page",
      -10,
      expect.objectContaining({ creditAmount: 10 }),
      "assistant-action:action-lp:refund"
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10, type: "refund" })
    );
  });
});

