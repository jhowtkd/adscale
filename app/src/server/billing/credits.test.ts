import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getAvailableCreditGrants: vi.fn(),
  getRefundableCreditGrants: vi.fn(),
  pickRefundTargetGrant: vi.fn((grants: Array<{ remaining: number }>) => {
    if (!grants.length) return null;
    return grants.find((g) => g.remaining > 0) ?? grants[grants.length - 1] ?? null;
  }),
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
  getRefundableCreditGrants,
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
const mockGetRefundableCreditGrants = vi.mocked(getRefundableCreditGrants);
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
    creditBalance: 200,
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
    creditBalance: 500,
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
    creditBalance: 200,
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
    creditBalance: 300,
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
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 200)]);
  });

  it("allows active subscriptions with enough credits", async () => {
    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 50, balance: 200 });
  });

  it("blocks workspaces without paid or beta access", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(noAccess());

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 50,
      balance: 200,
      reason: "inactive_subscription",
    });
  });

  it("allows past_due workspaces to spend existing credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(pastDueAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 300)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 50, balance: 300 });
  });

  it("allows beta workspaces with enough credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 500)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 50, balance: 500 });
  });

  it("blocks beta workspaces without credits", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaAccess());
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 20)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 50,
      balance: 20,
      reason: "insufficient_credits",
    });
  });

  it("blocks insufficient credit balance", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 30)]);

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 50,
      balance: 30,
      reason: "insufficient_credits",
    });
  });

  it("does not double debit duplicate idempotency keys", async () => {
    const existingUsage = {
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:123",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockResolvedValue(existingUsage);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
      userId: "user-1",
    });

    expect(result).toEqual({ status: "duplicate", usage: existingUsage });
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockTrackUsage).not.toHaveBeenCalled();
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("debits grants and records usage with metadata", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([
      grant("grant-1", 30),
      grant("grant-2", 70),
    ]);
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123", creditAmount: 50 },
      createdAt: new Date(),
    });

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123" },
    });

    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith("grant-1", 0, expect.anything());
    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith("grant-2", 50, expect.anything());
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "image_derivation",
      50,
      { derivationId: "123", creditAmount: 50, unlimitedBillingBypass: undefined },
      "derivation:123",
      expect.anything()
    );
    expect(result.status).toBe("recorded");
  });

  it("propagates ledger failure inside the financial transaction", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "ledger-failure",
      metadata: null,
      createdAt: new Date(),
    });
    mockCreateCreditTransaction.mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(
      recordUsage({
        workspaceId: "workspace-1",
        userId: "user-1",
        action: "image_derivation",
        idempotencyKey: "ledger-failure",
      })
    ).rejects.toThrow("ledger unavailable");

    const transactionExecutor = mockTrackUsage.mock.calls[0][5];
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", type: "usage" }),
      transactionExecutor
    );
  });

  it("shares one transaction executor across grant debit, usage, and ledger", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:123",
      metadata: null,
      createdAt: new Date(),
    });
    mockCreateCreditTransaction.mockResolvedValue({ id: "tx-1" });

    const result = await recordUsage({
      workspaceId: "workspace-1",
      userId: "user-1",
      action: "image_derivation",
      idempotencyKey: "derivation:123",
    });

    expect(result.status).toBe("recorded");
    const transactionExecutor = mockTrackUsage.mock.calls[0][5];
    expect(transactionExecutor).toBeDefined();
    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith(
      "grant-1",
      expect.any(Number),
      transactionExecutor
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        amount: -50,
        type: "usage",
      }),
      transactionExecutor
    );
  });

  it("emits credit_spend on successful recordUsage when userId is provided", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:123",
      metadata: { derivationId: "123", creditAmount: 50 },
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
        estimateCredits: 50,
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
          actualCredits: 50,
          estimateCredits: 50,
          creditUnitVersion: 2,
        }),
      })
    );
  });

  it("emits creditDelta when estimate differs from actual spend", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 80,
      idempotencyKey: "derivation:delta",
      metadata: { creditAmount: 80 },
      createdAt: new Date(),
    });

    await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      amount: 80,
      idempotencyKey: "derivation:delta",
      userId: "user-1",
      metadata: {
        preview: true,
        operation_key: "preview",
        estimateCredits: 50,
      },
    });
    await flushAnalytics();

    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "credit_spend",
        properties: expect.objectContaining({
          operation_key: "preview",
          estimateCredits: 50,
          actualCredits: 80,
          creditDelta: 30,
          creditUnitVersion: 2,
        }),
      })
    );
  });

  it("emits credit_blocked when recordUsage is blocked and userId is provided", async () => {
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 30)]);

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
          estimateCredits: 50,
          creditUnitVersion: 2,
        }),
      })
    );
  });

  it("does not change recordUsage result when analytics emit fails", async () => {
    mockTrackUsage.mockResolvedValue({
      id: "usage-1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:123",
      metadata: { creditAmount: 50 },
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

  it("returns duplicate when a concurrent operation settles on an exact balance", async () => {
    // Exact balance for a single operation: a concurrent commit between the
    // first checks and the grant locks must not surface as insufficient
    // credits for an already-charged operation.
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 50)]);
    const racedUsage = {
      id: "usage-raced",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:race",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:race",
      userId: "user-1",
    });

    expect(result).toEqual({ status: "duplicate", usage: racedUsage });
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockTrackUsage).not.toHaveBeenCalled();
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("returns duplicate when a concurrent insert wins the idempotency race", async () => {
    mockTrackUsage.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    const racedUsage = {
      id: "usage-raced",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:race-insert",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:race-insert",
      userId: "user-1",
    });

    expect(result).toEqual({ status: "duplicate", usage: racedUsage });
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("rethrows transaction conflicts that have no matching usage for the workspace key", async () => {
    mockTrackUsage.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );

    await expect(
      recordUsage({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "derivation:race-unknown",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "23505" });
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("returns duplicate when the winner charges before a blocked spend check", async () => {
    // Interleaving: pre-check sees nothing, the concurrent winner charges the
    // exact balance, then canSpend reads zero. The blocked return must not
    // hide the already-charged operation.
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 0)]);
    const racedUsage = {
      id: "usage-raced",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:race-blocked",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:race-blocked",
      userId: "user-1",
    });

    expect(result).toEqual({ status: "duplicate", usage: racedUsage });
    expect(mockTrackUsage).not.toHaveBeenCalled();
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("confirms replays through the real DrizzleQueryError cause chain", async () => {
    mockTrackUsage.mockRejectedValueOnce(
      new DrizzleQueryError(
        'insert into "adscale_app"."usage_events"',
        [],
        Object.assign(new Error('duplicate key value violates unique constraint'), { code: "23505" })
      )
    );
    const racedUsage = {
      id: "usage-raced",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 50,
      idempotencyKey: "derivation:race-driver",
      metadata: null,
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "derivation:race-driver",
      userId: "user-1",
    });

    expect(result).toEqual({ status: "duplicate", usage: racedUsage });
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("rethrows driver-level conflicts with no matching workspace operation", async () => {
    const driverError = new DrizzleQueryError(
      'insert into "adscale_app"."usage_events"',
      [],
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: "23505" })
    );
    mockTrackUsage.mockRejectedValueOnce(driverError);
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );

    await expect(
      recordUsage({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "derivation:race-driver-unknown",
        userId: "user-1",
      })
    ).rejects.toBe(driverError);
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });
});

describe("refundCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );
    mockWorkspaceHasUnlimitedBillingAccess.mockResolvedValue(false);
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 100)]);
    mockGetRefundableCreditGrants.mockResolvedValue([grant("grant-1", 100)]);
    mockCreateCreditTransaction.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      campaignId: null,
      derivationId: null,
      amount: 50,
      type: "refund",
      description: "image_derivation_refund",
      createdAt: new Date(),
    });
    mockTrackUsage.mockResolvedValue({
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -50,
      idempotencyKey: "refund-key",
      metadata: { refund: true, creditAmount: 50 },
      createdAt: new Date(),
    });
  });

  it("credits grants back and creates refund transaction", async () => {
    mockGetRefundableCreditGrants.mockResolvedValue([grant("grant-1", 80)]);

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
      130,
      expect.anything()
    );
    expect(mockTrackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "image_derivation",
      -50,
      expect.objectContaining({
        refund: true,
        creditAmount: 50,
        actionId: "action-1",
        derivationId: "derivation-1",
      }),
      "assistant-action:action-1:refund",
      expect.anything()
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        amount: 50,
        type: "refund",
        description: "image_derivation_refund",
        derivationId: "derivation-1",
      }),
      expect.anything()
    );
  });

  it("returns duplicate on repeat idempotency key without double-crediting", async () => {
    const existingUsage = {
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -50,
      idempotencyKey: "assistant-action:action-1:refund",
      metadata: { refund: true, creditAmount: 50 },
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

  it("treats in-transaction unique conflicts as duplicate only when the usage exists", async () => {
    mockTrackUsage.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    const racedUsage = {
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -50,
      idempotencyKey: "assistant-action:action-race:refund",
      metadata: { refund: true, creditAmount: 50 },
      createdAt: new Date(),
    };
    // Hermetic queue: the pre-check plus the two in-transaction duplicate
    // checks see nothing; only the post-23505 verification outside the
    // aborted tx observes the raced commit.
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-race:refund",
    });

    expect(result.status).toBe("duplicate");
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("rethrows unique violations that have no matching usage for the workspace key", async () => {
    mockTrackUsage.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );

    await expect(
      refundCredits({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "assistant-action:action-race:refund",
      })
    ).rejects.toMatchObject({ code: "23505" });
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("confirms refund replays through the real DrizzleQueryError cause chain", async () => {
    mockTrackUsage.mockRejectedValueOnce(
      new DrizzleQueryError(
        'insert into "adscale_app"."usage_events"',
        [],
        Object.assign(new Error('duplicate key value violates unique constraint'), { code: "23505" })
      )
    );
    const racedUsage = {
      id: "usage-r1",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: -50,
      idempotencyKey: "assistant-action:action-driver:refund",
      metadata: { refund: true, creditAmount: 50 },
      createdAt: new Date(),
    };
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>)
      .mockResolvedValue(racedUsage as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-driver:refund",
    });

    expect(result.status).toBe("duplicate");
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("rethrows driver-level refund conflicts with no matching workspace operation", async () => {
    const driverError = new DrizzleQueryError(
      'insert into "adscale_app"."usage_events"',
      [],
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: "23505" })
    );
    mockTrackUsage.mockRejectedValueOnce(driverError);
    mockGetUsageByIdempotencyKey.mockReset();
    mockGetUsageByIdempotencyKey.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getUsageByIdempotencyKey>>
    );

    await expect(
      refundCredits({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "assistant-action:action-driver-unknown:refund",
      })
    ).rejects.toBe(driverError);
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("restores a fully depleted grant instead of claiming success with no credit", async () => {
    mockGetRefundableCreditGrants.mockResolvedValue([grant("grant-drained", 0)]);

    const result = await refundCredits({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-drained:refund",
      userId: "user-1",
    });

    expect(result.status).toBe("refunded");
    expect(mockUpdateCreditGrantRemaining).toHaveBeenCalledWith(
      "grant-drained",
      50,
      expect.anything()
    );
  });

  it("records a settled unused bypass without treating the unused amount as a refund", async () => {
    mockWorkspaceHasUnlimitedBillingAccess.mockResolvedValue(true);
    mockTrackUsage.mockResolvedValue({
      id: "usage-bypass",
      workspaceId: "workspace-1",
      type: "image_derivation",
      amount: 0,
      idempotencyKey: "creative-work:work-1:output:output-1:generate",
      metadata: { creditAmount: 50, unlimitedBillingBypass: true },
      createdAt: new Date(),
    });

    const result = await recordUsage({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "creative-work:work-1:output:output-1:generate",
      amount: 50,
      metadata: { creativeWorkId: "work-1", outputId: "output-1" },
      userId: "user-1",
    });

    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("expected recorded");
    expect(result.usage.amount).toBe(0);
    expect(result.settlement).toEqual({
      kind: "unlimited_billing_bypass",
      billedCredits: 0,
      listedCredits: 50,
      internalDebit: false,
      refund: "not_applicable",
      reason: "settled_without_internal_debit",
    });
    expect(mockUpdateCreditGrantRemaining).not.toHaveBeenCalled();
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("records unlimited bypass refunds as zero-amount events without financial movement", async () => {
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
        creditAmount: 50,
        unlimitedBillingBypass: true,
      }),
      "assistant-action:action-dev:refund",
      expect.anything()
    );
    expect(mockCreateCreditTransaction).not.toHaveBeenCalled();
  });

  it("fails closed when no refundable grant exists", async () => {
    mockGetRefundableCreditGrants.mockResolvedValue([]);

    await expect(
      refundCredits({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "assistant-action:action-empty:refund",
        userId: "user-1",
      })
    ).rejects.toThrow(/no_refundable_grant/);
    expect(mockTrackUsage).not.toHaveBeenCalled();
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
      -100,
      expect.objectContaining({ creditAmount: 100 }),
      "assistant-action:action-lp:refund",
      expect.anything()
    );
    expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, type: "refund" }),
      expect.anything()
    );
  });
});

