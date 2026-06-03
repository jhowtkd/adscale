import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getBillingCustomerByWorkspace: vi.fn(),
}));

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
  getBetaAllowanceSummary: vi.fn((remainingAds: number) => ({
    totalAds: 10,
    remainingAds,
    exhausted: remainingAds <= 0,
  })),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import { getBillingCustomerByWorkspace } from "@/server/repositories/billing";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockGetBillingCustomer = vi.mocked(getBillingCustomerByWorkspace);

describe("billing status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Test", slug: "test" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockGetBillingCustomer.mockResolvedValue(null);
  });

  it("returns beta access without subscription", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "beta",
      label: "Acesso beta",
      creditBalance: 50,
      remainingAds: 10,
      hasSpendAccess: true,
      subscription: null,
      betaEntitlement: { id: "ent-1" },
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.billing.access.kind).toBe("beta");
    expect(body.billing.subscription).toBeNull();
    expect(body.billing.access.beta.remainingAds).toBe(10);
  });
});
