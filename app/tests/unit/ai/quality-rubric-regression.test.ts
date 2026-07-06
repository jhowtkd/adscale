import { describe, it, expect } from "vitest";
import {
  CORPUS_ARCHETYPE_FIXTURES,
  type CorpusArchetypeFixture,
} from "@/server/ai/corpus-fixtures";
import { buildCreativeQaPrompt } from "@/server/ai/creative-qa";
import { buildCreativeScorePrompt } from "@/server/ai/creative-score";
import {
  ART_DIRECTION_RUBRIC,
  buildObservableQaRubricSection,
  buildObservableScoreRubricSection,
  extractObservableRubricSection,
} from "@/server/ai/observable-rubric";

const CORE_RUBRIC_MARKERS = [
  "OBSERVABLE DEFECT NOTES",
  "ART DIRECTION (ranking guidance)",
] as const;

function corpusPromptInput(fixture: CorpusArchetypeFixture) {
  const { contract } = fixture;
  return {
    locale: "pt-BR" as const,
    campaign: {
      name: fixture.canonicalSlug,
      client: contract.client ?? "Unknown",
      product: contract.product ?? "Unknown",
      offer: contract.offer ?? "Unknown",
      objective: "Conversions",
      audience: "Target buyers",
    },
    derivation: {
      ctaText:
        contract.ctaSemantics.kind === "explicit"
          ? contract.ctaSemantics.text
          : null,
      format: contract.targetFormat,
      generationMode: contract.generationMode,
    },
    contract,
  };
}

function corpusScoreInput(fixture: CorpusArchetypeFixture) {
  const base = corpusPromptInput(fixture);
  return {
    imageBuffer: Buffer.from("fake"),
    mimeType: "image/png",
    ...base,
    derivation: {
      ...base.derivation,
      feedback: null,
      creativeLevel: "balanced" as const,
    },
  };
}

describe("art-direction rubric is contextual and advisory", () => {
  it("frames aesthetics as ranking guidance, not validity rules", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/ART DIRECTION \(ranking guidance\)/);
    expect(rubric).toMatch(/composition, typography, rhythm, contrast/i);
    expect(rubric).toMatch(/optional techniques, not validity rules/i);
    expect(ART_DIRECTION_RUBRIC).toMatch(/cite visible evidence/i);
  });

  it("does not apply a universal thumbnail threshold or fail/cap commands", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/do not apply a universal 25% thumbnail threshold/i);
    expect(rubric).not.toMatch(/fail (?:legibility|creativeRisk|briefMatch)/i);
    expect(rubric).not.toMatch(/Mark failed/i);
    expect(rubric).not.toMatch(/SCORE VISUAL QUALITY CAPS/i);
  });

  it("keeps observable defect note requirements with exemplars", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });

    expect(rubric).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(rubric).toMatch(/polished|professional/i);
    expect(rubric).toMatch(/BAD:/i);
    expect(rubric).toMatch(/GOOD:/i);
    expect(rubric).toMatch(/without citing what is wrong/i);
  });
});

describe("extractObservableRubricSection", () => {
  it("round-trips on synthetic prompt containing rubric blocks", () => {
    const rubric = buildObservableQaRubricSection({ targetFormat: "1:1" });
    const prompt = `Evaluate this creative.\n\n${rubric}\n\nLocale: pt-BR`;

    const extracted = extractObservableRubricSection(prompt);

    expect(extracted.length).toBeGreaterThan(0);
    expect(extracted).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(extracted).toMatch(/ART DIRECTION \(ranking guidance\)/);
    expect(extracted).not.toMatch(/Locale:/);
  });
});

describe("buildObservableScoreRubricSection", () => {
  it("no longer emits SCORE VISUAL QUALITY CAPS", () => {
    const scoreRubric = buildObservableScoreRubricSection({ targetFormat: "1:1" });

    expect(scoreRubric).not.toMatch(/SCORE VISUAL QUALITY CAPS/i);
    expect(scoreRubric).not.toMatch(/below 50/i);
    expect(scoreRubric).toMatch(/ART DIRECTION \(ranking guidance\)/);
  });
});

describe.each(CORPUS_ARCHETYPE_FIXTURES)(
  "corpus archetype rubric — $archetype",
  (fixture) => {
    it("QA prompt includes advisory rubric without export-softening", () => {
      const prompt = buildCreativeQaPrompt(corpusPromptInput(fixture));
      const section = extractObservableRubricSection(prompt);

      expect(section.length).toBeGreaterThan(0);
      for (const marker of CORE_RUBRIC_MARKERS) {
        expect(section).toContain(marker);
      }
      expect(prompt).not.toMatch(/Export must remain allowed/i);
    });

    it("score prompt includes advisory rubric parity without caps", () => {
      const scorePrompt = buildCreativeScorePrompt(corpusScoreInput(fixture));
      const section = extractObservableRubricSection(scorePrompt);

      expect(section.length).toBeGreaterThan(0);
      for (const marker of CORE_RUBRIC_MARKERS) {
        expect(section).toContain(marker);
      }
      expect(scorePrompt).not.toMatch(/SCORE VISUAL QUALITY CAPS/i);
    });
  }
);
