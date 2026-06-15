import { describe, it, expect } from "vitest";
import {
  CORPUS_ARCHETYPE_FIXTURES,
  type CorpusArchetype,
} from "@/server/ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import {
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "@/server/ai/creative-quality-gate";
import type { CorpusArchetypeFixture } from "@/server/ai/corpus-fixtures";

/** Count of archetypes with baseline gate gaps — flip to 0 when Phase 120 hardens the gate. */
export const BASELINE_GAP_COUNT = CORPUS_ARCHETYPE_FIXTURES.length - 1;

const ARCHETYPES: CorpusArchetype[] = [
  "invented_factual_entity",
  "visual_overload",
  "generic_template_aesthetic",
  "format_campaign_drift",
  "restyling_factual_contamination",
];

const PRIMARY_AUDIT_CORPUS_IDS = ["27069645", "538246da", "d7d9d323"] as const;

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
  const runBaselineRejectionTest =
    fixture.archetype === "invented_factual_entity" ? it : it.fails;

  runBaselineRejectionTest(
    `baseline-red: ${fixture.id} — gate must reject ${fixture.archetype}`,
    () => {
      const { gate, verdict } = runCorpusGatePipeline(fixture);
      expect(verdict).toBe("invalid");
      expect(
        fixture.expectedHardFailureCodes.every((code) =>
          gate.hardFailures.some((f) => f.code === code)
        )
      ).toBe(true);
    }
  );

  it(`baseline-snapshot: ${fixture.id} current verdict`, () => {
    const { verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe(fixture.baselineVerdict);
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

  it("documents baseline gap count for Phase 123 validation", () => {
    // SEP-04 flipped invented_factual_entity; four archetypes remain red until Phase 120.
    expect(BASELINE_GAP_COUNT).toBe(4);
  });
});
