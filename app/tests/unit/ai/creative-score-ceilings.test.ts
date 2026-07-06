import { describe, it, expect } from "vitest";
import {
  applyScoreCeilings,
  SCORE_CEILING_BY_FAILURE,
} from "@/server/ai/creative-score-ceilings";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";

function failure(code: CreativeHardFailure["code"], message = "test"): CreativeHardFailure {
  return { code, message };
}

function scoreInput(qualityScore: number) {
  return {
    qualityScore,
    scoreBreakdown: {
      ctaClarity: qualityScore,
      textLegibility: qualityScore,
      briefMatch: qualityScore,
      visualQuality: qualityScore,
      formatFit: qualityScore,
      variationLevelFit: qualityScore,
      informationPreservation: qualityScore,
    },
  };
}

describe("SCORE_CEILING_BY_FAILURE", () => {
  it("defines ceilings for remaining objective hard-failure codes only", () => {
    expect(SCORE_CEILING_BY_FAILURE.invented_factual_entity).toBe(20);
    expect(SCORE_CEILING_BY_FAILURE.unsupported_offer).toBe(20);
    expect(SCORE_CEILING_BY_FAILURE.wrong_brand).toBe(15);
    expect(SCORE_CEILING_BY_FAILURE.unauthorized_brand_or_ip).toBe(15);
    expect(SCORE_CEILING_BY_FAILURE.replaced_source_subject).toBe(15);
    expect(SCORE_CEILING_BY_FAILURE.style_reference_contamination).toBe(20);
  });

  it("has no mappings for demoted advisory codes", () => {
    expect(SCORE_CEILING_BY_FAILURE.cta_drift).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.unreadable_required_text).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.visual_overload).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.generic_template_aesthetic).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.missing_dominant_idea).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.decorative_only_variation).toBeUndefined();
    expect(SCORE_CEILING_BY_FAILURE.campaign_identity_drift).toBeUndefined();
  });
});

describe("applyScoreCeilings", () => {
  it("caps invented_factual_entity + raw 85 to ≤20", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("invented_factual_entity")]);
    expect(result.qualityScore).toBeLessThanOrEqual(20);
  });

  it("caps wrong_brand + raw 90 to ≤15", () => {
    const result = applyScoreCeilings(scoreInput(90), [failure("wrong_brand")]);
    expect(result.qualityScore).toBeLessThanOrEqual(15);
  });

  it("uses min of applicable ceilings for multiple failures", () => {
    const result = applyScoreCeilings(scoreInput(90), [
      failure("wrong_brand"),
      failure("invented_factual_entity"),
    ]);
    expect(result.qualityScore).toBeLessThanOrEqual(15);
  });

  it("leaves score unchanged when hardFailures is empty", () => {
    const result = applyScoreCeilings(scoreInput(85), []);
    expect(result.qualityScore).toBe(85);
  });

  it("caps style_reference_contamination to ceiling 20", () => {
    const result = applyScoreCeilings(scoreInput(88), [failure("style_reference_contamination")]);
    expect(result.qualityScore).toBeLessThanOrEqual(20);
  });

  it("falls back to ceiling 60 for unmapped hard failure codes", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("cropped_critical_content")]);
    expect(result.qualityScore).toBeLessThanOrEqual(60);
  });

  it("falls back to ceiling 60 for invalid_format_layout", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("invalid_format_layout")]);
    expect(result.qualityScore).toBeLessThanOrEqual(60);
  });

  it("clamps briefMatch when invented_factual_entity is active", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("invented_factual_entity")]);
    expect(result.scoreBreakdown.briefMatch).toBeLessThanOrEqual(20);
    expect(result.scoreBreakdown.informationPreservation).toBeLessThanOrEqual(20);
  });
});
