import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/billing", () => ({
  getActiveSubscriptionByWorkspace: vi.fn(),
  getAvailableCreditGrants: vi.fn(),
  updateCreditGrantRemaining: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.spyOn(db, "transaction").mockImplementation(async (callback) => callback({} as never));

import { db } from "@/server/db";

import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  updateCreditGrantRemaining,
} from "@/server/repositories/billing";
import {
  getUsageByIdempotencyKey,
  trackUsage,
} from "@/server/repositories/usage";
import { canSpend, recordUsage } from "./credits";

const mockGetActiveSubscription = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockUpdateCreditGrantRemaining = vi.mocked(updateCreditGrantRemaining);
const mockGetUsageByIdempotencyKey = vi.mocked(getUsageByIdempotencyKey);
const mockTrackUsage = vi.mocked(trackUsage);

const activeSubscription = {
  id: "subscription-id",
  workspaceId: "workspace-1",
  billingCustomerId: null,
  stripeSubscriptionId: "sub_123",
  stripeCustomerId: "cus_123",
  status: "active",
  planKey: "starter",
  priceId: "price_starter",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
    mockGetActiveSubscription.mockResolvedValue(activeSubscription);
    mockGetAvailableCreditGrants.mockResolvedValue([grant("grant-1", 20)]);
  });

  it("allows active subscriptions with enough credits", async () => {
    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({ allowed: true, amount: 5, balance: 20 });
  });

  it("blocks inactive subscriptions", async () => {
    mockGetActiveSubscription.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getActiveSubscriptionByWorkspace>>
    );

    const result = await canSpend("workspace-1", "image_derivation");

    expect(result).toEqual({
      allowed: false,
      amount: 5,
      balance: 20,
      reason: "inactive_subscription",
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
      { derivationId: "123", creditAmount: 5 },
      "derivation:123"
    );
    expect(result.status).toBe("recorded");
  });
});

