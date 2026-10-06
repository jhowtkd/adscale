import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

// Records each rate-limit call and delegates to the real implementation (the other tests rely on it).
const rateLimit = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/with-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/with-rate-limit")>();
  return {
    ...actual,
    checkRateLimit: (...args: Parameters<typeof actual.checkRateLimit>) => {
      rateLimit.calls.push(args);
      return actual.checkRateLimit(...args);
    },
  };
});

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

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn(),
  },}));

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
import { objectStorage } from "@/server/storage";
import { analyzeSmartResize } from "@/server/ai/smart-resize";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockDownloadBuffer = vi.mocked(objectStorage.get);
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

describe("GET /api/campaigns/[id]/smart-resize-preview on the free plan (ticket 11, part 2)", () => {
  const get = () =>
    GET(new Request("http://localhost/api/campaigns/camp-1/smart-resize-preview"), { params: makeParams("camp-1") });

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.calls.length = 0;
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  afterEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  it("refuses with 402 free_plan, before the rate limit, the download and the model", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.code).toBe("free_plan");
    expect(json.details).toMatchObject({ recommendedAction: "plan_request", reason: "free_plan", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(rateLimit.calls).toHaveLength(0);
    expect(mockGetCampaignById).not.toHaveBeenCalled();
    expect(mockGetAssetsByCampaign).not.toHaveBeenCalled();
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockAnalyzeSmartResize).not.toHaveBeenCalled();
  });

  it("does not refuse outside the free plan: asks the rule with the workspace id and runs the analysis", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1", platforms: ["meta_ads"] } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([{ id: "a1", key: "asset.png", role: "base" }] as Awaited<ReturnType<typeof getAssetsByCampaign>>);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("fake-image"));
    mockAnalyzeSmartResize.mockResolvedValue({
      crops: {},
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [],
    });

    const res = await get();

    expect(res.status).toBe(200);
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(rateLimit.calls).toHaveLength(1);
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeSmartResize).toHaveBeenCalledTimes(1);
  });
});
