import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn().mockResolvedValue("https://r2.example.com/signed?X-Amz-Signature=abc123"),
  },}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import { GET } from "@/app/api/campaigns/[id]/assets/route";

describe("GET /api/campaigns/[id]/assets", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      workspace: { id: workspaceId },
    });
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
    });
  });

  it("returns signed download URLs instead of public URLs", async () => {
    (getAssetsByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "asset-1", key: "campaigns/camp-456/uuid-1.png", type: "image/png", size: 1024 },
    ]);

    const request = new Request("http://localhost/api/campaigns/camp-456/assets");
    const response = await GET(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].url).toBe("https://r2.example.com/signed?X-Amz-Signature=abc123");
    expect(objectStorage.signedDownloadUrl).toHaveBeenCalledWith("campaigns/camp-456/uuid-1.png");
  });
});
