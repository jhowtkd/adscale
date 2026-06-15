import { describe, it, expect } from "vitest";
import {
  CORPUS_ARCHETYPE_FIXTURES,
  type CorpusArchetypeFixture,
} from "@/server/ai/corpus-fixtures";
import { buildCreativeQaPrompt } from "@/server/ai/creative-qa";
import { buildCreativeScorePrompt } from "@/server/ai/creative-score";
import {
  buildObservableQaRubricSection,
  buildObservableScoreRubricSection,
  buildThumbnailHookRubricLine,
  extractObservableRubricSection,
  GENERIC_TEMPLATE_RUBRIC,
  VISUAL_OVERLOAD_RUBRIC,
} from "@/server/ai/observable-rubric";

const CORE_RUBRIC_MARKERS = [
  "OBSERVABLE DEFECT NOTES",
  "VISUAL OVERLOAD",
  "GENERIC TEMPLATE",
  "THUMBNAIL / PREVIEW SCALE",
  "CRITERION MAPPING",
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

describe.each(CORPUS_ARCHETYPE_FIXTURES)(
  "corpus archetype rubric — $archetype",
  (fixture) => {
    it("QA prompt includes observable rubric without export-softening", () => {
      const prompt = buildCreativeQaPrompt(corpusPromptInput(fixture));
      const section = extractObservableRubricSection(prompt);

      expect(section.length).toBeGreaterThan(0);
      for (const marker of CORE_RUBRIC_MARKERS) {
        expect(section).toContain(marker);
      }
      expect(prompt).not.toMatch(/Export must remain allowed/i);
    });

    it("score prompt includes observable rubric parity", () => {
      const scorePrompt = buildCreativeScorePrompt(corpusScoreInput(fixture));
      const section = extractObservableRubricSection(scorePrompt);

      expect(section.length).toBeGreaterThan(0);
      for (const marker of CORE_RUBRIC_MARKERS) {
        expect(section).toContain(marker);
      }
      expect(scorePrompt).toMatch(/SCORE VISUAL QUALITY CAPS/i);
    });
  }
);

describe("visual_overload archetype enables overload note vocabulary (RUBR-01)", () => {
  it("rubric aligns with corpus creativeRisk note themes", () => {
    const fixture = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.archetype === "visual_overload"
    )!;
    const prompt = buildCreativeQaPrompt(corpusPromptInput(fixture));
    const section = extractObservableRubricSection(prompt);
    const note =
      (
        fixture.rawQaModelOutput as {
          checklist: { creativeRisk: { note: string } };
        }
      ).checklist.creativeRisk.note;

    expect(note).toMatch(/competing information zones/i);
    expect(note).toMatch(/card grid/i);
    expect(section).toMatch(/competing|information zones/i);
    expect(section).toMatch(/card grid|dominant focal/i);
    expect(VISUAL_OVERLOAD_RUBRIC).toMatch(/competing/i);
  });
});

describe("generic_template_aesthetic archetype enables generic note vocabulary (RUBR-02)", () => {
  it("rubric tropes match corpus creativeRisk note themes", () => {
    const fixture = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.archetype === "generic_template_aesthetic"
    )!;
    const prompt = buildCreativeQaPrompt(corpusPromptInput(fixture));
    const section = extractObservableRubricSection(prompt);
    const note =
      (
        fixture.rawQaModelOutput as {
          checklist: { creativeRisk: { note: string } };
        }
      ).checklist.creativeRisk.note;

    expect(note).toMatch(/neon|premium-tech|generic/i);
    expect(section).toMatch(/neon glow|glassmorphism|premium tech/i);
    expect(GENERIC_TEMPLATE_RUBRIC).toMatch(/neon glow|glassmorphism/i);
  });
});

describe("1:1 preview dimensions (RUBR-04)", () => {
  it("thumbnail rubric cites ~270 preview dimensions for 1:1 corpus fixtures", () => {
    const oneToOneFixtures = CORPUS_ARCHETYPE_FIXTURES.filter(
      (f) => f.contract.targetFormat === "1:1"
    );
    expect(oneToOneFixtures.length).toBeGreaterThan(0);

    for (const fixture of oneToOneFixtures) {
      const prompt = buildCreativeQaPrompt(corpusPromptInput(fixture));
      const section = extractObservableRubricSection(prompt);
      expect(section).toMatch(/270/);
    }
  });
});
