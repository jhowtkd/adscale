import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";

vi.mock("@/server/ai/creative-qa", () => ({
  analyzeCreativeQa: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationQualityGate: vi.fn(),
  updateDerivationQa: vi.fn(),
}));

import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import {
  getDerivationById,
  updateDerivationQualityGate,
  updateDerivationQa,
} from "@/server/repositories/derivation";
import { runCompletedDerivationQualityGate } from "@/server/ai/creative-quality-gate";

const mockAnalyzeCreativeQa = vi.mocked(analyzeCreativeQa);
const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationQualityGate = vi.mocked(updateDerivationQualityGate);
const mockUpdateDerivationQa = vi.mocked(updateDerivationQa);

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
    mockUpdateDerivationQualityGate.mockResolvedValue({} as never);
    mockUpdateDerivationQa.mockResolvedValue({} as never);
  });

  it("persists invalid verdict when ctaOffer checklist fails under explicit CTA contract", async () => {
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
      suggestions: ["Restore exact CTA"],
    });
    mockGetDerivationById.mockResolvedValue({
      qualityScore: 92,
      scoreIssues: [],
    } as never);

    await runCompletedDerivationQualityGate(baseInput);

    expect(mockUpdateDerivationQa).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({ qaStatus: "failed" })
    );
    expect(mockUpdateDerivationQualityGate).toHaveBeenCalledWith(
      "deriv-1",
      "ws-1",
      expect.objectContaining({
        qualityVerdict: "invalid",
        hardFailures: expect.arrayContaining([
          expect.objectContaining({ code: "cta_drift" }),
        ]),
        qualityGatedAt: expect.any(Date),
      })
    );
  });

  it("on analyzeCreativeQa error persists improvable fallback with qualityGatedAt", async () => {
    mockAnalyzeCreativeQa.mockRejectedValue(new Error("vision down"));

    await runCompletedDerivationQualityGate(baseInput);

    expect(mockUpdateDerivationQa).not.toHaveBeenCalled();
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
