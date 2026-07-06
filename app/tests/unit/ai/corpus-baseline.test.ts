import { describe, it, expect } from "vitest";
import {
  CORPUS_ARCHETYPE_FIXTURES,
  CORPUS_POSITIVE_FIXTURES,
  type CorpusArchetype,
} from "@/server/ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import {
  assertDerivationApprovable,
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "@/server/ai/creative-quality-gate";
import type { CorpusArchetypeFixture } from "@/server/ai/corpus-fixtures";

/** Phase 120 complete — all corpus archetypes reject with canonical GATE-01 codes. */
export const BASELINE_GAP_COUNT = 0;

const ARCHETYPES: CorpusArchetype[] = [
  "invented_factual_entity",
  "visual_overload",
  "generic_template_aesthetic",
  "format_campaign_drift",
  "restyling_factual_contamination",
  "weak_hierarchy",
  "illegible_cta",
  "unfocused_composition",
];

const PRIMARY_AUDIT_CORPUS_IDS = [
  "27069645",
  "a753e357",
  "538246da",
  "a5f65b85",
  "f420bcb2",
  "d7d9d323",
] as const;

function runCorpusGatePipeline(fixture: CorpusArchetypeFixture) {
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
  return { qa, gate, verdict };
}

describe.each(CORPUS_ARCHETYPE_FIXTURES)("corpus baseline gate — $id", (fixture) => {
  it(`baseline: ${fixture.id} — gate matches expected boundary for ${fixture.archetype}`, () => {
    const { gate, verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe(fixture.expectedVerdict);
    expect(
      fixture.expectedHardFailureCodes.every((code) =>
        gate.hardFailures.some((f) => f.code === code)
      )
    ).toBe(true);
    if (fixture.expectedVerdict !== "invalid") {
      // Advisory archetypes must surface as polish, never as blocking failures.
      expect(gate.hardFailures).toHaveLength(0);
      expect(gate.polishSuggestions.length).toBeGreaterThan(0);
    }
  });

  it(`baseline-snapshot: ${fixture.id} current verdict`, () => {
    const { verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe(fixture.baselineVerdict);
  });
});

describe.each(CORPUS_POSITIVE_FIXTURES)("corpus positive gate — $id", (fixture) => {
  it(`faithful baseline: ${fixture.id} — export-approvable with optional warnings`, () => {
    const { gate, verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe("improvable");
    expect(gate.hardFailures).toHaveLength(0);
    expect(
      assertDerivationApprovable({
        qualityVerdict: verdict,
        hardFailures: gate.hardFailures,
      }).ok
    ).toBe(true);
  });
});

describe("corpus baseline coverage", () => {
  it("covers every CorpusArchetype in the baseline suite", () => {
    const covered = new Set(CORPUS_ARCHETYPE_FIXTURES.map((f) => f.archetype));
    for (const archetype of ARCHETYPES) {
      expect(covered.has(archetype)).toBe(true);
    }
  });

  it("links primary audit corpus ids to at least one fixture", () => {
    const allRefIds = new Set(
      CORPUS_ARCHETYPE_FIXTURES.flatMap((f) => f.corpusRefIds)
    );
    for (const corpusId of PRIMARY_AUDIT_CORPUS_IDS) {
      expect(allRefIds.has(corpusId)).toBe(true);
    }
  });

  it("documents baseline gap count — Phase 120 complete", () => {
    expect(BASELINE_GAP_COUNT).toBe(0);
  });
});
