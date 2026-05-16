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

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationQa: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  downloadBuffer: vi.fn(),
}));

vi.mock("@/server/ai/creative-qa", () => ({
  analyzeCreativeQa: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  updateDerivationQa,
} from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationQa = vi.mocked(updateDerivationQa);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockDownloadBuffer = vi.mocked(downloadBuffer);
const mockAnalyzeCreativeQa = vi.mocked(analyzeCreativeQa);

function requestFor(id: string): Request {
  return new Request(`http://localhost/api/derivations/${id}/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/qa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns 400 when derivation has no output", async () => {
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

  it("runs QA and persists result for approved derivation with output", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      ctaText: "Comprar",
      format: "4:5",
      generationMode: "art_variation",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Campaign",
      client: "Client",
      product: "Product",
      offer: "20% off",
      objective: "Conversion",
      audience: "Buyers",
      tone: "Bold",
      creativeDiagnosis: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockDownloadBuffer.mockResolvedValue(Buffer.from("png"));

    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "Readable" },
        ctaOffer: { status: "passed", note: "Preserved" },
        briefMatch: { status: "warning", note: "Could be clearer" },
        formatFit: { status: "passed", note: "Fits" },
        creativeRisk: { status: "warning", note: "Generic" },
      },
      issues: ["Could be clearer"],
      suggestions: ["Add cues"],
    });

    mockUpdateDerivationQa.mockResolvedValue({
      id: "derivation-id",
      qaStatus: "warning",
    } as Awaited<ReturnType<typeof updateDerivationQa>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.qa.status).toBe("warning");
    expect(mockUpdateDerivationQa).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      expect.objectContaining({
        qaStatus: "warning",
        qaIssues: ["Could be clearer"],
        qaSuggestions: ["Add cues"],
      })
    );
  });

  it("returns 500 when analyzer throws", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Campaign",
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockDownloadBuffer.mockResolvedValue(Buffer.from("png"));
    mockAnalyzeCreativeQa.mockRejectedValue(new Error("Vision model error"));

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(500);
  });
});
