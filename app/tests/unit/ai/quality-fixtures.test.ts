import { describe, it, expect } from "vitest";
import {
  QUALITY_FIXTURES,
  type QualityFailureMode,
} from "@/server/ai/quality-fixtures";

const FAILURE_MODES: QualityFailureMode[] = [
  "wrong_cta",
  "cropped_text_logo",
  "style_reference_contamination",
  "poor_format_adaptation",
  "weak_preservation",
  "low_legibility",
];

describe("QUALITY_FIXTURES catalog integrity", () => {
  it("exports exactly six fixtures with unique ids", () => {
    expect(QUALITY_FIXTURES).toHaveLength(6);
    const ids = QUALITY_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(6);
  });

  it("covers every failure mode exactly once", () => {
    const modes = QUALITY_FIXTURES.map((f) => f.failureMode);
    for (const mode of FAILURE_MODES) {
      expect(modes.filter((m) => m === mode)).toHaveLength(1);
    }
  });

  it("requires contract, raw QA output, gate expectations on every fixture", () => {
    for (const fixture of QUALITY_FIXTURES) {
      expect(fixture.id).toBeTruthy();
      expect(fixture.label).toBeTruthy();
      expect(fixture.contract.generationMode).toBeTruthy();
      expect(fixture.contract.targetFormat).toBeTruthy();
      expect(fixture.rawQaModelOutput).toBeTruthy();
      expect(fixture.expectedVerdict).toBeTruthy();
      expect(typeof fixture.rawQaModelOutput).toBe("object");
    }
  });

  it("uses fictional Acme Demo data only — no private paths", () => {
    const serialized = JSON.stringify(QUALITY_FIXTURES);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/Desktop/i);
    expect(serialized).toContain("Acme Corp");
    expect(serialized).toContain("Widget Pro");
  });

  it("invalid verdict fixtures declare hard failures and regeneration snippets", () => {
    for (const fixture of QUALITY_FIXTURES) {
      if (fixture.expectedVerdict === "invalid") {
        expect(fixture.expectedHardFailureCodes.length).toBeGreaterThan(0);
        expect(fixture.expectedRegenerationSnippets?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("restyling fixture includes styleFidelity in raw QA output only", () => {
    const restyling = QUALITY_FIXTURES.find(
      (f) => f.failureMode === "style_reference_contamination"
    );
    expect(restyling).toBeDefined();
    const raw = restyling!.rawQaModelOutput as {
      checklist?: Record<string, unknown>;
    };
    expect(raw.checklist?.styleFidelity).toBeDefined();

    for (const fixture of QUALITY_FIXTURES.filter(
      (f) => f.failureMode !== "style_reference_contamination"
    )) {
      const checklist = (fixture.rawQaModelOutput as { checklist?: Record<string, unknown> })
        .checklist;
      expect(checklist?.styleFidelity).toBeUndefined();
    }
  });
});
