import { describe, expect, it } from "vitest";
import {
  evaluateBlindGate,
  validateBlindGateEvidenceShape,
  type BlindGateEvidence,
} from "../../../scripts/check-image-harness-blind-gate";

describe("evaluateBlindGate", () => {
  it("passes 12 decisions at 60% preference with no integrity regressions", () => {
    const decisions = Array.from({ length: 12 }, (_, index) => ({
      preferred: index < 8 ? ("recalibrated" as const) : ("baseline" as const),
      objectiveRegression: false,
    }));

    expect(evaluateBlindGate(decisions)).toEqual({ passed: true, preferenceRate: 8 / 12 });
  });

  it("fails any objective regression", () => {
    const decisions = Array.from({ length: 12 }, () => ({
      preferred: "recalibrated" as const,
      objectiveRegression: false,
    }));
    decisions[0].objectiveRegression = true;

    expect(evaluateBlindGate(decisions).passed).toBe(false);
  });

  it("validates the 12-pair evidence scaffold shape", () => {
    const evidence: BlindGateEvidence = {
      status: "pending_human_review",
      pairs: Array.from({ length: 12 }, (_, index) => ({
        id: `pair-${String(index + 1).padStart(2, "0")}`,
        mode: "art_variation",
        format: "1:1",
        creativeLevel: "balanced",
        preferred: "recalibrated",
        objectiveRegression: false,
      })),
    };

    expect(() => validateBlindGateEvidenceShape(evidence)).not.toThrow();
  });
});
