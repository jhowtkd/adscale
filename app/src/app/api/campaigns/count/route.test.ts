import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getWorkspaceCampaignCount } from "@/server/repositories/campaign";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getWorkspaceCampaignCount: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  handleApiError: vi.fn((error: unknown) => {
    return new Response(JSON.stringify({ error: "internalError" }), { status: 500 });
  }),
}));

const mockGetWorkspaceCampaignCount = vi.mocked(getWorkspaceCampaignCount);

describe("GET /api/campaigns/count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns workspace campaign count", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(7);

    const res = await GET(new Request("http://localhost/api/campaigns/count"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetWorkspaceCampaignCount).toHaveBeenCalledWith("workspace-1");
    expect(body).toEqual({ count: 7 });
  });
});
