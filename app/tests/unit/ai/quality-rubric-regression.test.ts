import { describe, it, expect } from "vitest";
import {
  buildObservableQaRubricSection,
  buildObservableScoreRubricSection,
  buildThumbnailHookRubricLine,
  extractObservableRubricSection,
  GENERIC_TEMPLATE_RUBRIC,
  VISUAL_OVERLOAD_RUBRIC,
} from "@/server/ai/observable-rubric";

describe("observable rubric module — visual overload (RUBR-01)", () => {
  it("includes dominant focal, zone count, and competing CTA rules", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/VISUAL OVERLOAD/i);
    expect(rubric).toMatch(/dominant focal/i);
    expect(rubric).toMatch(/more than three|three information zones/i);
    expect(rubric).toMatch(/competing.*CTA/i);
    expect(VISUAL_OVERLOAD_RUBRIC).toMatch(/creativeRisk|briefMatch/i);
  });
});

describe("observable rubric module — generic template (RUBR-02)", () => {
  it("lists trope vocabulary and requires campaign/brand justification", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/GENERIC TEMPLATE/i);
    expect(rubric).toMatch(/neon glow|glassmorphism|holographic/i);
    expect(rubric).toMatch(/justified.*campaign|brand/i);
    expect(GENERIC_TEMPLATE_RUBRIC).toMatch(/premium tech/i);
  });
});

describe("observable rubric module — observable defect notes (RUBR-03)", () => {
  it("forbids polished-only approval and includes good/bad exemplars", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(rubric).toMatch(/polished|professional/i);
    expect(rubric).toMatch(/BAD:/i);
    expect(rubric).toMatch(/GOOD:/i);
    expect(rubric).toMatch(/without citing what is wrong/i);
  });
});

describe("observable rubric module — thumbnail preview scale (RUBR-04)", () => {
  it("cites format-derived preview dimensions for 1:1", () => {
    const line = buildThumbnailHookRubricLine("1:1");
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(line).toMatch(/270/);
    expect(line).toMatch(/preview|thumbnail/i);
    expect(rubric).toMatch(/270/);
    expect(rubric).toMatch(/THUMBNAIL|PREVIEW SCALE/i);
  });
});

describe("extractObservableRubricSection", () => {
  it("round-trips on synthetic prompt containing rubric blocks", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });
    const prompt = `Evaluate this creative.\n\n${rubric}\n\nLocale: pt-BR`;

    const extracted = extractObservableRubricSection(prompt);

    expect(extracted.length).toBeGreaterThan(0);
    expect(extracted).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(extracted).toMatch(/THUMBNAIL \/ PREVIEW SCALE/i);
    expect(extracted).not.toMatch(/Locale:/);
  });
});

describe("buildObservableScoreRubricSection", () => {
  it("includes visualQuality scoring caps beyond QA rubric", () => {
    const scoreRubric = buildObservableScoreRubricSection({ targetFormat: "1:1" });

    expect(scoreRubric).toMatch(/SCORE VISUAL QUALITY CAPS/i);
    expect(scoreRubric).toMatch(/visualQuality.*below 50/i);
    expect(scoreRubric).toMatch(/above 70.*thumbnail/i);
    expect(scoreRubric).toMatch(/scoreIssues must cite visible elements/i);
  });
});
