import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
  getCampaignsPage: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
  getClientReferencesByIds: vi.fn(),
}));

import { getCampaignsPage } from "@/server/repositories/campaign";

const mockGetCampaignsPage = vi.mocked(getCampaignsPage);

describe("GET /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes query params to the paginated repository call", async () => {
    mockGetCampaignsPage.mockResolvedValue({
      campaigns: [{ id: "camp-1", name: "Summer", status: "draft" }],
      totalCount: 1,
    } as Awaited<ReturnType<typeof getCampaignsPage>>);

    const res = await GET(
      new Request(
        "http://localhost/api/campaigns?q=summer&status=draft&platform=Meta&sort=name-desc&page=2&limit=25"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetCampaignsPage).toHaveBeenCalledWith("workspace-1", {
      searchQuery: "summer",
      statusFilter: "draft",
      platformFilter: "Meta",
      sortOption: "name-desc",
      limit: 25,
      offset: 25,
    });
    expect(body).toEqual({
      campaigns: [{ id: "camp-1", name: "Summer", status: "draft" }],
      totalCount: 1,
    });
  });
});
