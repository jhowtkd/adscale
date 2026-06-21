import { describe, expect, it } from "vitest";
import { buildCorpusQualityPromptSection } from "@/server/human-quality/learning/corpus-quality-prompt";

describe("buildCorpusQualityPromptSection", () => {
  it("returns empty array when no rules", () => {
    expect(buildCorpusQualityPromptSection([])).toEqual([]);
  });

  it("formats rules with corpus-quality header and tagged lines", () => {
    const section = buildCorpusQualityPromptSection([
      {
        id: "rule-1",
        category: "illegible_cta",
        rationale: "CTA legível em thumbnail; contraste alto",
      },
    ]);

    expect(section).toEqual([
      "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
      "[corpus-quality:rule-1] illegible_cta: CTA legível em thumbnail; contraste alto",
      "Do not weaken factual text, CTA spelling, or export compliance.",
    ]);
  });

  it("caps at 10 rules", () => {
    const rules = Array.from({ length: 12 }, (_, index) => ({
      id: `rule-${index}`,
      category: "visual_overload",
      rationale: `directive ${index}`,
    }));

    const section = buildCorpusQualityPromptSection(rules);

    expect(section).toHaveLength(12);
    expect(section[0]).toContain("CORPUS QUALITY CONSTRAINTS");
    expect(section.filter((line) => line.startsWith("[corpus-quality:"))).toHaveLength(10);
    expect(section.at(-1)).toBe(
      "Do not weaken factual text, CTA spelling, or export compliance."
    );
  });
});
