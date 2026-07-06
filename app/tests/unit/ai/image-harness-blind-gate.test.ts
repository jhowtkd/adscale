import { describe, expect, it } from "vitest";
import { evaluateBlindGate } from "../../../scripts/check-image-harness-blind-gate";

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
});
