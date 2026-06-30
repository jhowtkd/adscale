import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetWithMetadata: vi.fn(),
  updateAssetMetadata: vi.fn(),
  claimAssetAnalysis: vi.fn().mockResolvedValue("claimed"),
}));

vi.mock("@/server/ai/campaign-deduction", () => ({
  analyzeCampaignCreative: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    publicUrl: vi.fn((key: string) => `https://r2.example.com/${key}`),
  },}));

import { getAssetWithMetadata, updateAssetMetadata } from "@/server/repositories/asset";
import { analyzeCampaignCreative } from "@/server/ai/campaign-deduction";

const mockGetAsset = vi.mocked(getAssetWithMetadata);
const mockUpdateAsset = vi.mocked(updateAssetMetadata);
const mockAnalyze = vi.mocked(analyzeCampaignCreative);

describe("POST /api/campaigns/[id]/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyze.mockReset();
    mockGetAsset.mockReset();
    mockUpdateAsset.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("analyzes asset and stores result on success", async () => {
    mockGetAsset.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      campaignId: "camp-1",
      workspaceId: "workspace-1",
      key: "campaigns/camp-1/image.jpg",
      metadata: {},
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    mockAnalyze.mockResolvedValue({
      product: { value: "Shoes", confidence: "high" },
      analyzedAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.analysis.product.value).toBe("Shoes");
    expect(mockUpdateAsset).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001", "workspace-1", expect.objectContaining({
      analysisResult: expect.objectContaining({
        product: { value: "Shoes", confidence: "high" },
      }),
    }), "completed");
  });

  it("returns graceful failure when AI analysis fails", async () => {
    mockGetAsset.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      campaignId: "camp-1",
      workspaceId: "workspace-1",
      key: "campaigns/camp-1/image.jpg",
      metadata: {},
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    mockAnalyze.mockRejectedValue(new Error("AI Error"));

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("failed");
    expect(body.analysis).toEqual({});
    expect(mockUpdateAsset).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001", "workspace-1", expect.objectContaining({
      analysisResult: {},
    }), "failed");
  });

  it("rejects invalid assetId", async () => {
    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "not-a-uuid" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("rejects asset from different workspace", async () => {
    // getAssetWithMetadata filters by workspaceId, so different workspace returns null
    mockGetAsset.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("rejects asset from different campaign", async () => {
    mockGetAsset.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      campaignId: "camp-2",
      workspaceId: "workspace-1",
      key: "campaigns/camp-2/image.jpg",
      metadata: {},
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(404);
  });
});
