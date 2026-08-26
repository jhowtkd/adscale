import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockRequireWorkspaceAccess = vi.fn();
const mockRedeemBetaAccess = vi.fn();
const mockGetWorkspaceBillingAccess = vi.fn();

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mockRequireWorkspaceAccess(...args),
}));

vi.mock("@/server/billing/beta", () => ({
  redeemBetaAccess: (...args: unknown[]) => mockRedeemBetaAccess(...args),
}));

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: (...args: unknown[]) => mockGetWorkspaceBillingAccess(...args),
}));

describe("POST /api/billing/beta/redeem (closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 410 Gone with error beta_closed", async () => {
    const request = new Request("http://localhost/api/billing/beta/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "BETA-2026" }),
    });

    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json).toEqual({ error: "beta_closed" });

    // Verify that auth, redemption, and access check functions are never called
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mockRedeemBetaAccess).not.toHaveBeenCalled();
    expect(mockGetWorkspaceBillingAccess).not.toHaveBeenCalled();
  });
});
