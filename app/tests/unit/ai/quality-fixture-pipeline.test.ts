import { describe, it, expect } from "vitest";
import { QUALITY_FIXTURES } from "@/server/ai/quality-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import { normalizeCreativeScoreResult } from "@/server/ai/creative-score";
import {
  assertDerivationApprovable,
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "@/server/ai/creative-quality-gate";
import { buildRegenerationCorrectionBrief } from "@/server/ai/regeneration-correction-brief";

describe.each(QUALITY_FIXTURES)("quality pipeline — $id", (fixture) => {
  it("normalizes QA and classifies to expected hard failures and verdict", () => {
    const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
    const scoreIssues = fixture.rawScoreModelOutput
      ? normalizeCreativeScoreResult(fixture.rawScoreModelOutput).scoreIssues
      : undefined;

    const gate = classifyCreativeQualityGate({
      contract: fixture.contract,
      checklist: qa.checklist,
      scoreIssues,
    });

    for (const code of fixture.expectedHardFailureCodes) {
      expect(gate.hardFailures.some((f) => f.code === code)).toBe(true);
    }

    const verdict = deriveQualityVerdict({
      hardFailures: gate.hardFailures,
      qualityScore: 85,
      checklist: qa.checklist,
    });

    expect(verdict).toBe(fixture.expectedVerdict);
    if (fixture.expectedVerdict === "invalid") {
      expect(verdict).not.toBe("acceptable");
      expect(gate.hardFailures.length).toBeGreaterThan(0);
    }
  });

  it("builds regeneration brief with expected snippets and contract preservation", () => {
    const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
    const scoreIssues = fixture.rawScoreModelOutput
      ? normalizeCreativeScoreResult(fixture.rawScoreModelOutput).scoreIssues
      : undefined;

    const gate = classifyCreativeQualityGate({
      contract: fixture.contract,
      checklist: qa.checklist,
      scoreIssues,
    });

    const brief = buildRegenerationCorrectionBrief({
      contract: fixture.contract,
      hardFailures: gate.hardFailures,
      scoreIssues,
      qaChecklist: qa.checklist,
    });

    for (const snippet of fixture.expectedRegenerationSnippets ?? []) {
      expect(brief.promptFeedback).toContain(snippet);
    }

    expect(brief.promptFeedback).toContain(fixture.contract.targetFormat);
    expect(brief.promptFeedback).toContain(fixture.contract.generationMode);

    if (gate.hardFailures.length > 0) {
      expect(brief.structured.sources).toContain("hard_failures");
    }
  });
});

describe("quality fixture pipeline — approval gate", () => {
  it("blocks approval when any invalid fixture verdict is applied", () => {
    for (const fixture of QUALITY_FIXTURES.filter((f) => f.expectedVerdict === "invalid")) {
      const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
      const scoreIssues = fixture.rawScoreModelOutput
        ? normalizeCreativeScoreResult(fixture.rawScoreModelOutput).scoreIssues
        : undefined;
      const gate = classifyCreativeQualityGate({
        contract: fixture.contract,
        checklist: qa.checklist,
        scoreIssues,
      });
      const verdict = deriveQualityVerdict({
        hardFailures: gate.hardFailures,
        qualityScore: 85,
        checklist: qa.checklist,
      });

      const result = assertDerivationApprovable({
        qualityVerdict: verdict,
        hardFailures: gate.hardFailures,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.qualityVerdict).toBe("invalid");
        expect(result.hardFailures.length).toBeGreaterThan(0);
      }
    }
  });
});
