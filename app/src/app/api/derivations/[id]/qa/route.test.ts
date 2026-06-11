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
  updateDerivationQualityGate: vi.fn(),
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

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  updateDerivationQa,
  updateDerivationQualityGate,
} from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationQa = vi.mocked(updateDerivationQa);
const mockUpdateDerivationQualityGate = vi.mocked(updateDerivationQualityGate);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockDownloadBuffer = vi.mocked(downloadBuffer);
const mockAnalyzeCreativeQa = vi.mocked(analyzeCreativeQa);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

function requestFor(id: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/derivations/${id}/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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
    mockGetDerivationById.mockResolvedValue(null as never);

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
      qualityScore: 85,
      scoreIssues: [],
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
        informationPreservation: { status: "passed", note: "Preserved" },
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

    mockUpdateDerivationQualityGate.mockResolvedValue({
      id: "derivation-id",
      qualityVerdict: "improvable",
      hardFailures: [],
      polishSuggestions: ["Could be clearer", "Generic"],
    } as Awaited<ReturnType<typeof updateDerivationQualityGate>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.qa.status).toBe("warning");
    expect(body.qualityVerdict).toBe("improvable");
    expect(body.hardFailures).toEqual([]);
    expect(body.polishSuggestions.length).toBeGreaterThan(0);
    expect(mockUpdateDerivationQa).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      expect.objectContaining({
        qaStatus: "warning",
        qaIssues: ["Could be clearer"],
        qaSuggestions: ["Add cues"],
      })
    );
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      expect.objectContaining({
        qualityVerdict: "improvable",
        hardFailures: [],
      })
    );
  });

  it("persists invalid qualityVerdict when checklist has hard failures", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      ctaText: "Shop Now",
      format: "4:5",
      generationMode: "art_variation",
      qualityScore: 90,
      scoreIssues: [],
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Campaign",
      client: "Acme Corp",
      product: "Widget",
      offer: "20% off",
      objective: "Conversion",
      audience: "Buyers",
      tone: "Bold",
      creativeDiagnosis: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockDownloadBuffer.mockResolvedValue(Buffer.from("png"));

    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "failed",
      checklist: {
        legibility: { status: "passed", note: "Readable" },
        ctaOffer: {
          status: "failed",
          note: "CTA was replaced with a different call to action.",
        },
        informationPreservation: { status: "passed", note: "Preserved" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "Fits" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: ["CTA drift"],
      suggestions: [],
    });

    mockUpdateDerivationQa.mockResolvedValue({
      id: "derivation-id",
      qaStatus: "failed",
    } as Awaited<ReturnType<typeof updateDerivationQa>>);

    mockUpdateDerivationQualityGate.mockResolvedValue({
      id: "derivation-id",
      qualityVerdict: "invalid",
      hardFailures: [{ code: "cta_drift", message: "CTA was replaced with a different call to action." }],
      polishSuggestions: [],
    } as Awaited<ReturnType<typeof updateDerivationQualityGate>>);

    const res = await POST(requestFor("derivation-id"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.qualityVerdict).toBe("invalid");
    expect(body.hardFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "cta_drift" }),
      ])
    );
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      expect.objectContaining({
        qualityVerdict: "invalid",
        hardFailures: expect.arrayContaining([
          expect.objectContaining({ code: "cta_drift" }),
        ]),
      })
    );
  });

  it("emits mission_completed when QA analysis completes", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      qaStatus: "pending",
      scoreIssues: [],
      qualityScore: 80,
      format: "1:1",
      generationMode: "art_variation",
      ctaText: "Buy now",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      name: "Campaign",
      clientProfileId: "profile-id",
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockDownloadBuffer.mockResolvedValue(Buffer.from("png"));
    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "passed",
      checklist: {
        legibility: { status: "passed", note: "Readable" },
        ctaOffer: { status: "passed", note: "Preserved" },
        informationPreservation: { status: "passed", note: "Preserved" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "Fits" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: [],
      suggestions: [],
    });
    mockUpdateDerivationQa.mockResolvedValue({
      id: "derivation-id",
      qaStatus: "passed",
    } as Awaited<ReturnType<typeof updateDerivationQa>>);
    mockUpdateDerivationQualityGate.mockResolvedValue({
      id: "derivation-id",
      qualityVerdict: "acceptable",
    } as Awaited<ReturnType<typeof updateDerivationQualityGate>>);

    const res = await POST(
      requestFor("derivation-id", { "x-beta-session-id": VALID_SESSION_ID }),
      { params: paramsWith("derivation-id") }
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        source: "server",
        sessionId: VALID_SESSION_ID,
        campaignId: "campaign-id",
        derivationId: "derivation-id",
        properties: expect.objectContaining({
          missionKey: "review",
          stage: "review",
          operation: "qa",
        }),
      })
    );
  });

  it("returns cached QA without re-running analyzer", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      qaStatus: "passed",
      qaChecklist: { legibility: { status: "passed", note: "Readable" } },
      qaIssues: [],
      qaSuggestions: ["Keep it"],
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(
      requestFor("derivation-id", { "x-beta-session-id": VALID_SESSION_ID }),
      { params: paramsWith("derivation-id") }
    );
    const body = await res.json();
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.qa.status).toBe("passed");
    expect(mockGetCampaignById).not.toHaveBeenCalled();
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockAnalyzeCreativeQa).not.toHaveBeenCalled();
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        sessionId: VALID_SESSION_ID,
        properties: expect.objectContaining({
          missionKey: "review",
          stage: "review",
          operation: "qa_cached",
        }),
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
