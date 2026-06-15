import { describe, it, expect } from "vitest";
import {
  FIDELITY_HARD_FAILURE_CODES,
  capturePassesFactualFidelity,
  type CreativeValidationAfterCapture,
} from "@/server/ai/creative-validation-aggregation";
import { CORPUS_ARCHETYPE_FIXTURES } from "@/server/ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import {
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "@/server/ai/creative-quality-gate";

function criterion(status: "passed" | "warning" | "failed" = "passed") {
  return { status, note: "ok" };
}

function scoreBreakdown(value = 80) {
  return {
    textLegibility: value,
    ctaClarity: value,
    briefMatch: value,
    visualQuality: value,
    formatFit: value,
    variationLevelFit: value,
    informationPreservation: value,
  };
}

function evidenceShapedCapture(
  overrides: Partial<CreativeValidationAfterCapture> & { qualityScore: number }
): CreativeValidationAfterCapture {
  return {
    key: "test:art_variation:1:1",
    source: "regenerated",
    path: "app/exports/render-creatives/validation-after/test.png",
    sha256: "abc",
    qualityScore: overrides.qualityScore,
    qualityVerdict: overrides.qualityVerdict ?? "invalid",
    hardFailures: overrides.hardFailures ?? [],
    qa: {
      checklist: overrides.qa?.checklist ?? {
        legibility: criterion(),
        ctaOffer: criterion(),
        informationPreservation: criterion(),
        briefMatch: criterion(),
        formatFit: criterion(),
        creativeRisk: criterion(),
      },
    },
    score: { scoreBreakdown: overrides.score?.scoreBreakdown ?? scoreBreakdown() },
    ...overrides,
  };
}

describe("creative validation evidence guard (QA-20)", () => {
  it("fails capturePassesFactualFidelity when invented_factual_entity is present", () => {
    const capture = evidenceShapedCapture({
      qualityScore: 90,
      hardFailures: [{ code: "invented_factual_entity", message: "Cantona" }],
    });
    expect(capturePassesFactualFidelity(capture)).toBe(false);
    expect(FIDELITY_HARD_FAILURE_CODES.has("invented_factual_entity")).toBe(true);
  });

  it.each(CORPUS_ARCHETYPE_FIXTURES)(
    "corpus archetype $id — fidelity codes in gate output are never ignored for pass verdict",
    (fixture) => {
      const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
      const gate = classifyCreativeQualityGate({
        contract: fixture.contract,
        checklist: qa.checklist,
      });
      const verdict = deriveQualityVerdict({
        hardFailures: gate.hardFailures,
        qualityScore: 85,
        checklist: qa.checklist,
      });

      const fidelityCodes = gate.hardFailures
        .map((f) => f.code)
        .filter((code) => FIDELITY_HARD_FAILURE_CODES.has(code));

      if (fidelityCodes.length > 0) {
        expect(verdict).not.toBe("acceptable");
        expect(
          capturePassesFactualFidelity(
            evidenceShapedCapture({
              qualityScore: 85,
              hardFailures: gate.hardFailures,
            })
          )
        ).toBe(false);
      }
    }
  );
});
