import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/landing-page", () => ({
  createLandingPage: vi.fn(),
  completeLandingPage: vi.fn(),
  failLandingPage: vi.fn(),
  getLandingPagesByDerivation: vi.fn(),
}));

vi.mock("@/server/ai/landing-page", () => ({
  generateLandingPageStructure: vi.fn(),
}));

vi.mock("@/server/services/landing-page-renderer", () => ({
  renderLandingPageHtml: vi.fn(() => "<html>test</html>"),
}));

vi.mock("@/server/storage/r2", () => ({
  uploadBuffer: vi.fn(),
  getPresignedDownloadUrl: vi.fn(() => Promise.resolve("https://cdn.example.com/download")),
  getPublicUrl: vi.fn(() => "https://cdn.example.com/image.png"),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createLandingPage,
  completeLandingPage,
  failLandingPage,
  getLandingPagesByDerivation,
} from "@/server/repositories/landing-page";
import { generateLandingPageStructure } from "@/server/ai/landing-page";
import { uploadBuffer } from "@/server/storage/r2";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockCreateLandingPage = vi.mocked(createLandingPage);
const mockCompleteLandingPage = vi.mocked(completeLandingPage);
const mockFailLandingPage = vi.mocked(failLandingPage);
const mockGetLandingPagesByDerivation = vi.mocked(getLandingPagesByDerivation);
const mockGenerateLandingPageStructure = vi.mocked(generateLandingPageStructure);
const mockUploadBuffer = vi.mocked(uploadBuffer);

function requestFor(id: string): Request {
  return new Request(`http://localhost/api/derivations/${id}/landing-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/landing-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLandingPagesByDerivation.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when derivation is missing", async () => {
    mockGetDerivationById.mockResolvedValue(null);

    const res = await POST(requestFor("missing-id"), {
      params: paramsWith("missing-id"),
    });

    expect(res.status).toBe(404);
  });

  it("returns 409 when derivation is not approved", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 when derivation has no outputKey", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: null,
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when campaign is missing", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetCampaignById.mockResolvedValue(null);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(404);
  });

  it("creates landing page, generates, renders, uploads, and returns downloadUrl", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      prompt: "A vibrant ad",
      ctaText: "Shop Now",
      format: "1:1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Summer Sale",
      client: "Acme Fashion",
      product: "Linen dress",
      objective: "Conversion",
      audience: "Women 25-34",
      offer: "20% off",
      tone: "Bold",
      constraints: "No red",
      notes: "Keep a premium but accessible feel",
      ctaVariants: ["Shop Now"],
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockCreateLandingPage.mockResolvedValue({
      id: "lp-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
      sourceDerivationId: "derivation-id",
      status: "queued",
    } as Awaited<ReturnType<typeof createLandingPage>>);

    mockGenerateLandingPageStructure.mockResolvedValue({
      title: "Generated LP",
      sections: {
        hero: { headline: "H", body: "B", cta: "C" },
        problem: { headline: "P", body: "B" },
        solution: { headline: "S", body: "B" },
        benefits: { headline: "Be", body: "B" },
        trust: { headline: "T", body: "B" },
        offer: { headline: "O", body: "B", cta: "C" },
        faq: { headline: "F", items: [{ question: "Q", answer: "A" }] },
        finalCta: { headline: "FC", body: "B", cta: "C" },
      },
    });

    mockCompleteLandingPage.mockResolvedValue({
      id: "lp-1",
      status: "completed",
      title: "Generated LP",
      htmlKey: "landing-pages/workspace-1/derivation-id/1234567890.html",
    } as Awaited<ReturnType<typeof completeLandingPage>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.landingPage.status).toBe("completed");
    expect(body.landingPage.title).toBe("Generated LP");
    expect(body.downloadUrl).toBe("https://cdn.example.com/download");
    expect(mockGenerateLandingPageStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Summer Sale",
        client: "Acme Fashion",
        product: "Linen dress",
        notes: "Keep a premium but accessible feel",
      }),
      expect.objectContaining({
        prompt: "A vibrant ad",
        ctaText: "Shop Now",
        format: "1:1",
      })
    );
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.stringContaining("landing-pages/workspace-1/derivation-id/"),
      Buffer.from("<html>test</html>", "utf-8"),
      "text/html"
    );
  });

  it("returns existing completed landing page without regenerating", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Summer Sale",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetLandingPagesByDerivation.mockResolvedValue([
      {
        id: "lp-existing",
        status: "completed",
        htmlKey: "landing-pages/workspace-1/derivation-id/existing.html",
        title: "Existing",
      },
    ] as Awaited<ReturnType<typeof getLandingPagesByDerivation>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBeUndefined();
    expect(body.landingPage.id).toBe("lp-existing");
    expect(mockCreateLandingPage).not.toHaveBeenCalled();
    expect(mockGenerateLandingPageStructure).not.toHaveBeenCalled();
  });

  it("rejects duplicate landing page generation while queued", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Summer Sale",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetLandingPagesByDerivation.mockResolvedValue([
      { id: "lp-queued", status: "queued", htmlKey: null },
    ] as Awaited<ReturnType<typeof getLandingPagesByDerivation>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(429);
    expect(mockCreateLandingPage).not.toHaveBeenCalled();
  });

  it("marks landing page failed when AI or upload throws", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Summer Sale",
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockCreateLandingPage.mockResolvedValue({
      id: "lp-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
      sourceDerivationId: "derivation-id",
      status: "queued",
    } as Awaited<ReturnType<typeof createLandingPage>>);

    mockGenerateLandingPageStructure.mockRejectedValue(new Error("AI error"));

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(500);
    expect(mockFailLandingPage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lp-1",
        workspaceId: "workspace-1",
        error: "AI error",
      })
    );
  });
});
