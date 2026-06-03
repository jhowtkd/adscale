import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    transaction: vi.fn(async (callback) => callback({})),
  },
}));

vi.mock("@/server/repositories/billing", () => ({
  createCreditGrant: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", () => ({
  createBetaEntitlement: vi.fn(),
  getActiveBetaEntitlementByWorkspace: vi.fn(),
  getBetaRedemptionByWorkspace: vi.fn(),
  recordBetaRedemption: vi.fn(),
}));

import { createCreditGrant } from "@/server/repositories/billing";
import {
  createBetaEntitlement,
  getActiveBetaEntitlementByWorkspace,
  getBetaRedemptionByWorkspace,
  recordBetaRedemption,
} from "@/server/repositories/entitlements";
import {
  BetaRedeemError,
  getConfiguredBetaCodes,
  isBetaCodeValid,
  redeemBetaAccess,
} from "./beta";

const mockCreateCreditGrant = vi.mocked(createCreditGrant);
const mockCreateBetaEntitlement = vi.mocked(createBetaEntitlement);
const mockGetActiveBetaEntitlement = vi.mocked(getActiveBetaEntitlementByWorkspace);
const mockGetBetaRedemption = vi.mocked(getBetaRedemptionByWorkspace);
const mockRecordBetaRedemption = vi.mocked(recordBetaRedemption);

describe("beta access codes", () => {
  const originalEnv = process.env.BETA_ACCESS_CODES;

  beforeEach(() => {
    process.env.BETA_ACCESS_CODES = "ALPHA,BETA-TEST";
  });

  afterEach(() => {
    process.env.BETA_ACCESS_CODES = originalEnv;
  });

  it("normalizes and validates configured codes", () => {
    expect(getConfiguredBetaCodes()).toEqual(["ALPHA", "BETA-TEST"]);
    expect(isBetaCodeValid("beta-test")).toBe(true);
    expect(isBetaCodeValid("missing")).toBe(false);
  });
});

describe("redeemBetaAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETA_ACCESS_CODES = "BETA2026";
    mockGetActiveBetaEntitlement.mockResolvedValue(null);
    mockGetBetaRedemption.mockResolvedValue(null);
    mockCreateBetaEntitlement.mockResolvedValue({
      id: "ent-1",
      workspaceId: "workspace-1",
      kind: "beta_tester",
      status: "active",
      sourceCode: "BETA2026",
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRecordBetaRedemption.mockResolvedValue({
      id: "red-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      code: "BETA2026",
      entitlementId: "ent-1",
      createdAt: new Date(),
    });
    mockCreateCreditGrant.mockResolvedValue({
      id: "grant-1",
      workspaceId: "workspace-1",
      source: "beta_tester",
      sourceId: "ent-1",
      amount: 50,
      remaining: 50,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("rejects invalid codes", async () => {
    await expect(
      redeemBetaAccess({
        workspaceId: "workspace-1",
        userId: "user-1",
        code: "nope",
      })
    ).rejects.toMatchObject({ code: "invalid_code" });
  });

  it("rejects duplicate redemption", async () => {
    mockGetBetaRedemption.mockResolvedValue({
      id: "red-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      code: "BETA2026",
      entitlementId: "ent-1",
      createdAt: new Date(),
    });

    await expect(
      redeemBetaAccess({
        workspaceId: "workspace-1",
        userId: "user-1",
        code: "BETA2026",
      })
    ).rejects.toBeInstanceOf(BetaRedeemError);
  });

  it("creates entitlement and beta credit grant", async () => {
    const result = await redeemBetaAccess({
      workspaceId: "workspace-1",
      userId: "user-1",
      code: "beta2026",
    });

    expect(mockCreateBetaEntitlement).toHaveBeenCalled();
    expect(mockRecordBetaRedemption).toHaveBeenCalled();
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "beta_tester",
        amount: 50,
      }),
      expect.anything()
    );
    expect(result.grant.remaining).toBe(50);
  });
});
