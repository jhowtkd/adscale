import { describe, it, expect } from "vitest";
import { CORPUS_ARCHETYPE_FIXTURES } from "@/server/ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import {
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "@/server/ai/creative-quality-gate";
import type { CorpusArchetypeFixture } from "@/server/ai/corpus-fixtures";

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
  it.fails(`baseline-red: ${fixture.id} — gate must reject ${fixture.archetype}`, () => {
    const { gate, verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe("invalid");
    expect(
      fixture.expectedHardFailureCodes.every((code) =>
        gate.hardFailures.some((f) => f.code === code)
      )
    ).toBe(true);
  });

  it(`baseline-snapshot: ${fixture.id} current verdict`, () => {
    const { verdict } = runCorpusGatePipeline(fixture);
    expect(verdict).toBe(fixture.baselineVerdict);
  });
});
