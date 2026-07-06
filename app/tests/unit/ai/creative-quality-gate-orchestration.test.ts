import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";

vi.mock("@/server/ai/creative-qa", () => ({
  analyzeCreativeQa: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationDualVerdict: vi.fn(),
  updateDerivationQualityGate: vi.fn(),
  updateDerivationQa: vi.fn(),
  updateDerivationScore: vi.fn(),
}));

import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import {
  getDerivationById,
  updateDerivationDualVerdict,
  updateDerivationQualityGate,
  updateDerivationQa,
  updateDerivationScore,
} from "@/server/repositories/derivation";
import { runCompletedDerivationQualityGate } from "@/server/ai/creative-quality-gate";

const mockAnalyzeCreativeQa = vi.mocked(analyzeCreativeQa);
const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationDualVerdict = vi.mocked(updateDerivationDualVerdict);
const mockUpdateDerivationQualityGate = vi.mocked(updateDerivationQualityGate);
const mockUpdateDerivationQa = vi.mocked(updateDerivationQa);
const mockUpdateDerivationScore = vi.mocked(updateDerivationScore);

const contract: CreativeContract = {
  generationMode: "art_variation",
  targetFormat: "4:5",
  ctaSemantics: { kind: "explicit", text: "Shop Now" },
  baseAssetId: "base-1",
  styleAssetId: null,
  client: "Acme Corp",
  product: "Widget",
  offer: "20% off",
  constraints: null,
};

const baseInput = {
  derivationId: "deriv-1",
  workspaceId: "ws-1",
  imageBuffer: Buffer.from("image"),
  mimeType: "image/png",
  locale: "en",
  campaign: {
    name: "Summer",
    client: "Acme Corp",
    product: "Widget",
    offer: "20% off",
    objective: "Sales",
    audience: "Parents",
    tone: null,
    creativeDiagnosis: null,
  },
  derivation: {
    ctaText: "Shop Now",
    format: "4:5",
    generationMode: "art_variation",
  },
  contract,
};

function passedChecklist() {
  return {
    legibility: { status: "passed" as const, note: "OK" },
    ctaOffer: { status: "passed" as const, note: "OK" },
    informationPreservation: { status: "passed" as const, note: "OK" },
    briefMatch: { status: "passed" as const, note: "OK" },
    formatFit: { status: "passed" as const, note: "OK" },
    creativeRisk: { status: "passed" as const, note: "OK" },
  };
}

describe("runCompletedDerivationQualityGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDerivationDualVerdict.mockResolvedValue({} as never);
    mockUpdateDerivationQualityGate.mockResolvedValue({} as never);
    mockUpdateDerivationQa.mockResolvedValue({} as never);
    mockUpdateDerivationScore.mockResolvedValue({} as never);
  });

  it("keeps ctaOffer replacement advisory under explicit CTA contract", async () => {
    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "failed",
      checklist: {
        ...passedChecklist(),
        ctaOffer: {
          status: "failed",
          note: "CTA was replaced with a different call to action.",
        },
      },
      issues: ["CTA mismatch"],
      suggestions: ["Consider restoring the campaign CTA"],
    });
    mockGetDerivationById.mockResolvedValue({
      qualityScore: 92,
      scoreIssues: [],
      scoreStatus: "analyzed",
      scoreBreakdown: {
        ctaClarity: 90,
        textLegibility: 88,
        briefMatch: 90,
        visualQuality: 92,
        formatFit: 90,
        variationLevelFit: 88,
        informationPreservation: 85,
      },
    } as never);

    await runCompletedDerivationQualityGate(baseInput);

    // No hard failures → no score rewrite and no invalid verdict.
    expect(mockUpdateDerivationScore).not.toHaveBeenCalled();
    expect(mockUpdateDerivationQa).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({ qaStatus: "failed" })
    );
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        qualityVerdict: "improvable",
        hardFailures: [],
        polishSuggestions: expect.arrayContaining([
          "CTA was replaced with a different call to action.",
        ]),
        qualityGatedAt: expect.any(Date),
      })
    );
    expect(mockUpdateDerivationDualVerdict).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        exportStatus: expect.objectContaining({ value: "ok" }),
      })
    );
  });

  it("persists invalid verdict when ctaOffer checklist reports an unsupported offer", async () => {
    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "failed",
      checklist: {
        ...passedChecklist(),
        ctaOffer: {
          status: "failed",
          note: "Offer text includes an unsupported claim not in contract.",
        },
      },
      issues: ["Unsupported offer"],
      suggestions: ["Remove the invented discount"],
    });
    mockGetDerivationById.mockResolvedValue({
      qualityScore: 92,
      scoreIssues: [],
      scoreStatus: "analyzed",
      scoreBreakdown: {
        ctaClarity: 90,
        textLegibility: 88,
        briefMatch: 90,
        visualQuality: 92,
        formatFit: 90,
        variationLevelFit: 88,
        informationPreservation: 85,
      },
    } as never);

    await runCompletedDerivationQualityGate(baseInput);

    expect(mockUpdateDerivationScore).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        qualityScore: 20,
        regenerationSuggestion: expect.stringMatching(
          /Hard failures:[\s\S]*unsupported_offer: Offer text includes an unsupported claim/
        ),
      })
    );
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        qualityVerdict: "invalid",
        hardFailures: expect.arrayContaining([
          expect.objectContaining({ code: "unsupported_offer" }),
        ]),
        qualityGatedAt: expect.any(Date),
      })
    );
    expect(mockUpdateDerivationDualVerdict).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        exportStatus: expect.objectContaining({ value: "bloqueado" }),
      })
    );
  });

  it("persists exportStatus ok when QA passes without hard failures", async () => {
    mockAnalyzeCreativeQa.mockResolvedValue({
      status: "ready",
      checklist: passedChecklist(),
      issues: [],
      suggestions: [],
    });
    mockGetDerivationById.mockResolvedValue({
      qualityScore: 92,
      scoreIssues: [],
      scoreStatus: "analyzed",
      scoreBreakdown: null,
    } as never);

    await runCompletedDerivationQualityGate(baseInput);

    expect(mockUpdateDerivationDualVerdict).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        exportStatus: expect.objectContaining({ value: "ok" }),
      })
    );
  });

  it("on analyzeCreativeQa error persists improvable fallback with qualityGatedAt", async () => {
    mockAnalyzeCreativeQa.mockRejectedValue(new Error("vision down"));

    await runCompletedDerivationQualityGate(baseInput);

    expect(mockUpdateDerivationQa).not.toHaveBeenCalled();
    expect(mockUpdateDerivationDualVerdict).not.toHaveBeenCalled();
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        qualityVerdict: "improvable",
        hardFailures: [],
        polishSuggestions: [],
        qualityGatedAt: expect.any(Date),
      })
    );
  });
});
