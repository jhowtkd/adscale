import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConversionErrorPayload } from "@/lib/billing/conversion-contract";

vi.mock("./credits", () => ({
  recordUsage: vi.fn(),
}));

vi.mock("./access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("./conversion", () => ({
  buildConversionErrorPayloadForWorkspace: vi.fn(),
}));

import { recordUsage } from "./credits";
import { getWorkspaceBillingAccess } from "./access";
import { buildConversionErrorPayloadForWorkspace } from "./conversion";
import { getAccess, getAccessFromBilling, spend } from "./paywall";

const mockRecordUsage = vi.mocked(recordUsage);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockBuildConversionPayload = vi.mocked(buildConversionErrorPayloadForWorkspace);

const paidAccess = {
  kind: "paid" as const,
  label: "Assinatura ativa",
  creditBalance: 20,
  remainingAds: 4,
  hasSpendAccess: true,
  subscriptionStatus: "active" as const,
  subscription: null,
  latestSubscription: null,
  betaEntitlement: null,
  testerEntitlement: null,
};

const conversionPayload = {
  reason: "beta_exhausted" as const,
  recommendedAction: "checkout" as const,
  suggestedPlan: "starter" as const,
  amount: 5,
  balance: 0,
  returnPath: "/campaigns/c1",
  analytics: {
    reasonCode: "beta_exhausted",
    estimateCredits: 5,
    operation: "image_derivation",
  },
};

describe("paywall.spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when usage is recorded", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 20 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 5 });
  });

  it("returns ok with duplicate flag for idempotent replays", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "duplicate",
      usage: {},
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 0, duplicate: true });
  });

  it("returns 402 conversion payload when spend is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockBuildConversionPayload.mockResolvedValue(conversionPayload);

    const result = await spend({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "usage-key",
      returnPath: "/campaigns/c1",
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 402,
      conversionPayload,
    });
    expect(mockBuildConversionPayload).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
      returnPath: "/campaigns/c1",
      operation: "image_derivation",
    });
    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
      })
    );
  });

  it("keeps conversion payload compatible with the client contract parser", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "inactive_subscription",
      },
    });
    mockBuildConversionPayload.mockResolvedValue(conversionPayload);

    const result = await spend({
      workspaceId: "workspace-1",
      action: "creative_plan",
      idempotencyKey: "usage-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(parseConversionErrorPayload(result.conversionPayload)).toEqual(
      result.conversionPayload
    );
  });

  it("records spend for unlimited-access workspaces without blocking", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 999_999 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-tester",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 5 });
  });
});

describe("paywall.getAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to getWorkspaceBillingAccess", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(paidAccess);

    await expect(getAccess("workspace-1")).resolves.toEqual(paidAccess);
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("workspace-1");
  });
});

describe("paywall.getAccessFromBilling", () => {
  it("returns the billing access snapshot unchanged", () => {
    expect(getAccessFromBilling(paidAccess)).toBe(paidAccess);
  });
});
