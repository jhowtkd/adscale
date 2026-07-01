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

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn(),
  },}));

vi.mock("@/server/ai/image-analysis", () => ({
  analyzeImageContent: vi.fn(),
}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
}));

import { NextResponse } from "next/server";
import { getCampaignById } from "@/server/repositories/campaign";
import { objectStorage } from "@/server/storage";
import { analyzeImageContent } from "@/server/ai/image-analysis";
import { spendOrApiError } from "@/server/billing/paywall";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockDownloadBuffer = vi.mocked(objectStorage.get);
const mockAnalyzeImageContent = vi.mocked(analyzeImageContent);
const mockSpendCredits = vi.mocked(spendOrApiError);

describe("POST /api/campaigns/:id/auto-briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when campaign not found", async () => {
    mockGetCampaignById.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.png" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when request body is invalid", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as unknown as Awaited<ReturnType<typeof getCampaignById>>);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 402 when credit spending fails", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as unknown as Awaited<ReturnType<typeof getCampaignById>>);
    mockSpendCredits.mockResolvedValue(
      NextResponse.json({ error: "insufficientCredits" }, { status: 402 })
    );

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.png" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "insufficientCredits" });
  });

  it("analyzes image and returns extracted fields with confidence", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as unknown as Awaited<ReturnType<typeof getCampaignById>>);
    mockSpendCredits.mockResolvedValue(null);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("fake-image"));
    mockAnalyzeImageContent.mockResolvedValue({
      product: "Acme Widget",
      offer: "20% off",
      cta: { text: "Buy now", style: "button" },
      brandElements: ["blue logo", "slogan"],
      keyVisual: "product shot",
      textContent: { headline: "Amazing Deal", bullets: ["Fast shipping"] },
      format: "1:1",
    });

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.png" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.extracted).toEqual({
      client: "Acme Widget",
      product: "Acme Widget",
      offer: "20% off",
      objective: "Drive action: Buy now",
      audience: "Visual target: product shot",
      ctaText: "Buy now",
      constraints: "Preserve: blue logo, slogan",
    });

    expect(body.confidence).toEqual({
      client: 0.85,
      offer: 0.8,
      ctaText: 0.9,
      audience: 0.6,
    });

    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "creative_qa",
        amount: 1,
        idempotencyKey: "auto-briefing:camp-1:assets/image.png",
      })
    );

    expect(mockAnalyzeImageContent).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png"
    );
  });

  it("uses webp mime type for webp images", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as unknown as Awaited<ReturnType<typeof getCampaignById>>);
    mockSpendCredits.mockResolvedValue(null);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("fake-image"));
    mockAnalyzeImageContent.mockResolvedValue({
      product: "",
      offer: "",
      cta: { text: "", style: "" },
      brandElements: [],
      keyVisual: "",
      textContent: { headline: "", bullets: [] },
      format: "1:1",
    });

    await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.webp" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(mockAnalyzeImageContent).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/webp"
    );
  });

  it("returns low confidence when fields are empty", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as unknown as Awaited<ReturnType<typeof getCampaignById>>);
    mockSpendCredits.mockResolvedValue(null);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("fake-image"));
    mockAnalyzeImageContent.mockResolvedValue({
      product: "",
      offer: "",
      cta: { text: "", style: "" },
      brandElements: [],
      keyVisual: "",
      textContent: { headline: "", bullets: [] },
      format: "1:1",
    });

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.jpg" }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    const body = await res.json();
    expect(body.confidence.client).toBe(0.3);
    expect(body.confidence.offer).toBe(0.3);
    expect(body.confidence.ctaText).toBe(0.2);
    expect(body.confidence.audience).toBe(0.2);
  });
});
