import { describe, it, expect } from "vitest";
import {
  CORPUS_ARCHETYPE_FIXTURES,
  type CorpusArchetype,
} from "@/server/ai/corpus-fixtures";
import { CORPUS_MANIFEST_INDEX } from "@/server/ai/creative-corpus";

const ARCHETYPES: CorpusArchetype[] = [
  "invented_factual_entity",
  "visual_overload",
  "generic_template_aesthetic",
  "format_campaign_drift",
  "restyling_factual_contamination",
];

const MANIFEST_PREFIXES = new Set(
  CORPUS_MANIFEST_INDEX.map((entry) => entry.idPrefix)
);

describe("CORPUS_ARCHETYPE_FIXTURES catalog integrity", () => {
  it("exports exactly five fixtures with unique ids", () => {
    expect(CORPUS_ARCHETYPE_FIXTURES).toHaveLength(5);
    const ids = CORPUS_ARCHETYPE_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("covers every audit archetype exactly once", () => {
    const archetypes = CORPUS_ARCHETYPE_FIXTURES.map((f) => f.archetype);
    for (const archetype of ARCHETYPES) {
      expect(archetypes.filter((a) => a === archetype)).toHaveLength(1);
    }
  });

  it("links each fixture to at least one manifest id prefix", () => {
    for (const fixture of CORPUS_ARCHETYPE_FIXTURES) {
      expect(fixture.corpusRefIds.length).toBeGreaterThan(0);
      for (const refId of fixture.corpusRefIds) {
        expect(refId).toHaveLength(8);
        expect(MANIFEST_PREFIXES.has(refId)).toBe(true);
      }
    }
  });

  it("requires corpus metadata and contract on every fixture", () => {
    for (const fixture of CORPUS_ARCHETYPE_FIXTURES) {
      expect(fixture.canonicalSlug).toBeTruthy();
      expect(fixture.renderTier).toMatch(/^(preview|final)$/);
      expect(fixture.contract.generationMode).toBeTruthy();
      expect(fixture.contract.targetFormat).toBeTruthy();
      expect(fixture.rawQaModelOutput).toBeTruthy();
      expect(fixture.expectedVerdict).toBeTruthy();
      expect(fixture.baselineVerdict).toBeTruthy();
    }
  });

  it("uses fictional-safe contracts — no private paths or raw audit copy", () => {
    const serialized = JSON.stringify(CORPUS_ARCHETYPE_FIXTURES);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/Desktop/i);
    expect(serialized).not.toContain("Teste_debuf");
  });

  it("targets invalid verdict for all archetypes with documented baseline gap", () => {
    for (const fixture of CORPUS_ARCHETYPE_FIXTURES) {
      expect(fixture.expectedVerdict).toBe("invalid");
      expect(fixture.expectedHardFailureCodes.length).toBeGreaterThan(0);
      expect(["acceptable", "improvable", "invalid"]).toContain(fixture.baselineVerdict);
    }
  });

  it("represents both preview and final render tiers across fixtures", () => {
    const tiers = new Set(CORPUS_ARCHETYPE_FIXTURES.map((f) => f.renderTier));
    expect(tiers.has("preview")).toBe(true);
    expect(tiers.has("final")).toBe(true);
  });

  it("includes styleFidelity in restyling contamination QA output only", () => {
    const restyling = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.archetype === "restyling_factual_contamination"
    );
    expect(restyling).toBeDefined();
    const checklist = (
      restyling!.rawQaModelOutput as { checklist?: Record<string, unknown> }
    ).checklist;
    expect(checklist?.styleFidelity).toBeDefined();

    for (const fixture of CORPUS_ARCHETYPE_FIXTURES.filter(
      (f) => f.archetype !== "restyling_factual_contamination"
    )) {
      const otherChecklist = (
        fixture.rawQaModelOutput as { checklist?: Record<string, unknown> }
      ).checklist;
      expect(otherChecklist?.styleFidelity).toBeUndefined();
    }
  });
});
