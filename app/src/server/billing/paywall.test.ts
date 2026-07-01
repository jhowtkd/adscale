import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConversionErrorPayload } from "@/lib/billing/conversion-contract";

vi.mock("./credits", () => ({
  recordUsage: vi.fn(),
  canSpend: vi.fn(),
}));

vi.mock("./access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number, details?: unknown) => ({
    status,
    json: async () => ({ code, details }),
  })),
}));

import { recordUsage } from "./credits";
import { getWorkspaceBillingAccess } from "./access";
import { apiError } from "@/lib/api-response";
import { getAccess, getAccessFromBilling, spend, spendOrApiError } from "./paywall";

const mockRecordUsage = vi.mocked(recordUsage);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockApiError = vi.mocked(apiError);

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

const betaExhaustedAccess = {
  kind: "beta" as const,
  label: "Acesso beta",
  creditBalance: 0,
  remainingAds: 0,
  hasSpendAccess: true,
  subscriptionStatus: "none" as const,
  subscription: null,
  latestSubscription: null,
  betaEntitlement: { id: "beta-1" },
  testerEntitlement: null,
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
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    const result = await spend({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "usage-key",
      returnPath: "/campaigns/c1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.conversionPayload).toMatchObject({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      amount: 5,
      balance: 0,
      returnPath: "/campaigns/c1",
    });
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("workspace-1");
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
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      ...paidAccess,
      kind: "none",
      hasSpendAccess: false,
      subscriptionStatus: "none",
    } as typeof paidAccess);

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

describe("paywall.spendOrApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests when usage is recorded", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 20 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spendOrApiError({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "test-key",
      })
    ).resolves.toBeNull();
  });

  it("returns structured conversion payload when usage is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    const response = await spendOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      returnPath: "/campaigns/c1",
    });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body?.code).toBe("beta_exhausted");
    expect(body?.details).toMatchObject({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      returnPath: "/campaigns/c1",
    });
    expect(mockApiError).toHaveBeenCalledWith(
      "beta_exhausted",
      402,
      expect.objectContaining({
        reason: "beta_exhausted",
        returnPath: "/campaigns/c1",
      })
    );
  });

  it("forwards userId to recordUsage for analytics emission", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    await spendOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      userId: "user-1",
    });

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    );
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
