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
  it("defines SCR-02 ceilings for key failure codes", () => {
    expect(SCORE_CEILING_BY_FAILURE.invented_factual_entity).toBe(20);
    expect(SCORE_CEILING_BY_FAILURE.unsupported_offer).toBe(20);
    expect(SCORE_CEILING_BY_FAILURE.campaign_identity_drift).toBe(15);
    expect(SCORE_CEILING_BY_FAILURE.cta_drift).toBe(50);
    expect(SCORE_CEILING_BY_FAILURE.visual_overload).toBe(55);
    expect(SCORE_CEILING_BY_FAILURE.decorative_only_variation).toBe(60);
    expect(SCORE_CEILING_BY_FAILURE.style_reference_contamination).toBe(20);
    expect(SCORE_CEILING_BY_FAILURE.generic_template_aesthetic).toBe(55);
  });
});

describe("applyScoreCeilings", () => {
  it("caps invented_factual_entity + raw 85 to ≤20", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("invented_factual_entity")]);
    expect(result.qualityScore).toBeLessThanOrEqual(20);
  });

  it("caps campaign_identity_drift + raw 90 to ≤15", () => {
    const result = applyScoreCeilings(scoreInput(90), [failure("campaign_identity_drift")]);
    expect(result.qualityScore).toBeLessThanOrEqual(15);
  });

  it("caps cta_drift + raw 80 to ≤50", () => {
    const result = applyScoreCeilings(scoreInput(80), [failure("cta_drift")]);
    expect(result.qualityScore).toBeLessThanOrEqual(50);
  });

  it("caps visual_overload + raw 75 to ≤55", () => {
    const result = applyScoreCeilings(scoreInput(75), [failure("visual_overload")]);
    expect(result.qualityScore).toBeLessThanOrEqual(55);
  });

  it("caps decorative_only_variation + raw 70 to ≤60", () => {
    const result = applyScoreCeilings(scoreInput(70), [failure("decorative_only_variation")]);
    expect(result.qualityScore).toBeLessThanOrEqual(60);
  });

  it("uses min of applicable ceilings for multiple failures", () => {
    const result = applyScoreCeilings(scoreInput(90), [
      failure("cta_drift"),
      failure("invented_factual_entity"),
    ]);
    expect(result.qualityScore).toBeLessThanOrEqual(20);
  });

  it("leaves score unchanged when hardFailures is empty", () => {
    const result = applyScoreCeilings(scoreInput(85), []);
    expect(result.qualityScore).toBe(85);
  });

  it("caps style_reference_contamination to ceiling 20", () => {
    const result = applyScoreCeilings(scoreInput(88), [failure("style_reference_contamination")]);
    expect(result.qualityScore).toBeLessThanOrEqual(20);
  });

  it("caps generic_template_aesthetic to ceiling 55", () => {
    const result = applyScoreCeilings(scoreInput(80), [failure("generic_template_aesthetic")]);
    expect(result.qualityScore).toBeLessThanOrEqual(55);
  });

  it("falls back to ceiling 60 for unmapped hard failure codes", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("cropped_critical_content")]);
    expect(result.qualityScore).toBeLessThanOrEqual(60);
  });

  it("clamps briefMatch when invented_factual_entity is active", () => {
    const result = applyScoreCeilings(scoreInput(85), [failure("invented_factual_entity")]);
    expect(result.scoreBreakdown.briefMatch).toBeLessThanOrEqual(20);
    expect(result.scoreBreakdown.informationPreservation).toBeLessThanOrEqual(20);
  });
});
