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
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  downloadBuffer: vi.fn(),
}));

vi.mock("@/server/ai/smart-resize", () => ({
  analyzeSmartResize: vi.fn(),
  getPlatformRules: vi.fn(() => ({
    meta_ads: { textMaxPercent: 20, safeZones: ["top"], notes: "meta rules" },
  })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeSmartResize } from "@/server/ai/smart-resize";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockDownloadBuffer = vi.mocked(downloadBuffer);
const mockAnalyzeSmartResize = vi.mocked(analyzeSmartResize);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

describe("GET /api/campaigns/[id]/smart-resize-preview", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns analysis for campaign with assets", async () => {
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      platforms: ["meta_ads"],
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([
      { id: "a1", key: "asset.png", role: "base" },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("fake-image"));
    mockAnalyzeSmartResize.mockResolvedValue({
      crops: { "1:1": { x: 0, y: 0, width: 1, height: 1 } },
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [{ platform: "meta_ads", recommendation: "Keep text under 20%", compliance: "pass" }],
    });

    const res = await GET(new Request("http://localhost/api/campaigns/camp-1/smart-resize-preview"), { params: makeParams("camp-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.analysis.crops).toBeDefined();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0].platform).toBe("meta_ads");
  });

  it("returns 404 for missing campaign", async () => {
    mockGetCampaignById.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/campaigns/camp-999/smart-resize-preview"), { params: makeParams("camp-999") });

    expect(res.status).toBe(404);
  });

  it("returns 400 when no assets", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/campaigns/camp-1/smart-resize-preview"), { params: makeParams("camp-1") });

    expect(res.status).toBe(400);
  });
});
