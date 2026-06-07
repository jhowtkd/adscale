import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "./route";

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

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

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetWithMetadata: vi.fn(),
  updateAssetMetadata: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  downloadBuffer: vi.fn(),
}));

vi.mock("@/server/ai/preflight-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/preflight-analysis")>();
  return {
    ...actual,
    analyzePreflight: vi.fn(),
  };
});

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetWithMetadata, updateAssetMetadata } from "@/server/repositories/asset";
import { analyzePreflight } from "@/server/ai/preflight-analysis";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";

const mockGetCampaign = vi.mocked(getCampaignById);
const mockGetAsset = vi.mocked(getAssetWithMetadata);
const mockUpdateAsset = vi.mocked(updateAssetMetadata);
const mockAnalyzePreflight = vi.mocked(analyzePreflight);
const mockSpendCredits = vi.mocked(spendCreditsOrApiError);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);

const samplePreflight = {
  overallScore: 82,
  breakdown: {
    technicalQuality: { score: 85, suggestion: "Technical quality is good." },
    textLegibility: { score: 80, suggestion: "Text is legible." },
    visualHierarchy: { score: 78, suggestion: "Hierarchy is clear." },
    ctaProminence: { score: 75, suggestion: "CTA is visible." },
    composition: { score: 80, suggestion: "Composition works." },
    brandConsistency: { score: 82, suggestion: "Brand fit is strong." },
    platformReadiness: { score: 79, suggestion: "Platform fit is acceptable." },
  },
  criticalIssues: [],
  suggestions: [],
  technical: {
    actualWidth: 1080,
    actualHeight: 1080,
    claimedWidth: 1080,
    claimedHeight: 1080,
    aspectRatio: "1:1",
    format: "png",
    fileSizeBytes: 2048,
    hasAlpha: false,
    estimatedContrast: 0.7,
  },
};

const campaign = {
  id: "camp-1",
  name: "Summer Sale",
  product: "Running shoes",
  offer: "20% off",
};

const completedAsset = {
  id: "asset-1",
  campaignId: "camp-1",
  workspaceId: "workspace-1",
  key: "campaigns/camp-1/base.png",
  type: "image/png",
  width: 1080,
  height: 1080,
  analysisStatus: "completed" as const,
  analyzedAt: "2026-06-05T10:00:00.000Z",
  metadata: {
    preflightResult: samplePreflight,
    analyzedAt: "2026-06-05T10:00:00.000Z",
  },
};

describe("GET /api/campaigns/[id]/assets/[assetId]/preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaign.mockResolvedValue(campaign as Awaited<ReturnType<typeof getCampaignById>>);
  });

  it("returns cached preflight with readiness", async () => {
    mockGetAsset.mockResolvedValue(completedAsset as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    const res = await GET(new Request("http://localhost/preflight"), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.preflight).toEqual(samplePreflight);
    expect(body.readiness).toMatchObject({
      overallScore: 82,
      status: "ready",
      canGenerate: true,
      source: {
        campaignId: "camp-1",
        assetId: "asset-1",
      },
    });
  });

  it("returns 404 when campaign is missing", async () => {
    mockGetCampaign.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/preflight"), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns pending when asset has no completed metadata", async () => {
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      analysisStatus: "pending",
      metadata: null,
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    const res = await GET(new Request("http://localhost/preflight"), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.preflight).toBeNull();
    expect(body.readiness).toBeNull();
    expect(body.status).toBe("pending");
  });
});

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("POST /api/campaigns/[id]/assets/[assetId]/preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaign.mockResolvedValue(campaign as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAsset.mockResolvedValue(completedAsset as Awaited<ReturnType<typeof getAssetWithMetadata>>);
    mockAnalyzePreflight.mockResolvedValue(samplePreflight);
    mockSpendCredits.mockResolvedValue(null);
  });

  it("returns cached readiness without spending credits", async () => {
    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.readiness.status).toBe("ready");
    expect(mockSpendCredits).not.toHaveBeenCalled();
    expect(mockAnalyzePreflight).not.toHaveBeenCalled();
  });

  it("forces rerun when force=true is sent", async () => {
    const res = await POST(
      new Request("http://localhost/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBeUndefined();
    expect(body.readiness.status).toBe("ready");
    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^preflight:camp-1:asset-1:force:/),
        metadata: expect.objectContaining({ forceRerun: true }),
      })
    );
    expect(mockAnalyzePreflight).toHaveBeenCalled();
    expect(mockUpdateAsset).toHaveBeenCalledWith("asset-1", "workspace-1", expect.any(Object), "completed");
  });

  it("returns 404 when asset does not belong to campaign", async () => {
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      campaignId: "other-camp",
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 500 when analysis fails", async () => {
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      analysisStatus: "pending",
      metadata: null,
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);
    mockAnalyzePreflight.mockRejectedValue(new Error("OpenAI failed"));

    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });

    expect(res.status).toBe(500);
    expect(mockUpdateAsset).toHaveBeenCalledWith(
      "asset-1",
      "workspace-1",
      { preflightResult: null },
      "failed"
    );
  });

  it("emits credit_blocked when spendCreditsOrApiError returns 402", async () => {
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      analysisStatus: "pending",
      metadata: null,
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);
    mockSpendCredits.mockResolvedValue(
      NextResponse.json(
        { error: "insufficient_credits", code: "insufficient_credits" },
        { status: 402 }
      )
    );

    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    await flushAnalytics();

    expect(res.status).toBe(402);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "credit_blocked",
        source: "server",
        userId: "user-1",
        workspaceId: "workspace-1",
        campaignId: "camp-1",
        properties: expect.objectContaining({
          operation: "creative_qa",
          reasonCode: "insufficient_credits",
          estimateCredits: 1,
          stage: "readiness",
          missionKey: "readiness",
        }),
      })
    );
  });

  it("emits readiness_completed for cached response without blocks", async () => {
    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "readiness_completed",
        source: "server",
        campaignId: "camp-1",
        properties: expect.objectContaining({
          blockingCount: 0,
          readinessStatus: "ready",
          stage: "readiness",
          missionKey: "readiness",
        }),
      })
    );
  });

  it("emits readiness_blocked after fresh analysis with blocking issues", async () => {
    const blockedPreflight = {
      ...samplePreflight,
      criticalIssues: ["CTA is not visible"],
    };
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      analysisStatus: "pending",
      metadata: null,
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);
    mockAnalyzePreflight.mockResolvedValue(blockedPreflight);

    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "readiness_blocked",
        source: "server",
        properties: expect.objectContaining({
          blockingCount: expect.any(Number),
          readinessStatus: "blocked",
        }),
      })
    );
  });

  it("emits readiness_completed after fresh analysis without blocks", async () => {
    mockGetAsset.mockResolvedValue({
      ...completedAsset,
      analysisStatus: "pending",
      metadata: null,
    } as Awaited<ReturnType<typeof getAssetWithMetadata>>);

    const res = await POST(new Request("http://localhost/preflight", { method: "POST" }), {
      params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }),
    });
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "readiness_completed",
        source: "server",
        properties: expect.objectContaining({
          blockingCount: 0,
          readinessStatus: "ready",
        }),
      })
    );
  });

  it("passes sessionId from x-beta-session-id header", async () => {
    const res = await POST(
      new Request("http://localhost/preflight", {
        method: "POST",
        headers: { "x-beta-session-id": VALID_SESSION_ID },
      }),
      { params: Promise.resolve({ id: "camp-1", assetId: "asset-1" }) }
    );

    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: VALID_SESSION_ID,
      })
    );
  });
});
