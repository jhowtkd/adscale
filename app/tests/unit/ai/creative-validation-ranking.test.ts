import { describe, expect, it } from "vitest";
import { compareCreativeCaptures } from "../../../scripts/creative-validation-ranking";

const capture = (
  hardFailures: string[],
  fidelity: number,
  finish: number,
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme" = "balanced"
) => ({
  contract: {
    generationMode: "art_variation" as const,
    creativeLevel,
  },
  hardFailures: hardFailures.map((code) => ({ code, message: code })),
  score: { scoreBreakdown: { variationLevelFit: fidelity, visualQuality: finish } },
});

describe("compareCreativeCaptures", () => {
  it("prefers objective integrity before any score", () => {
    expect(compareCreativeCaptures(capture([], 70, 70), capture(["wrong_brand"], 100, 100))).toBeGreaterThan(
      0
    );
  });

  it("prefers fidelity before finish", () => {
    expect(compareCreativeCaptures(capture([], 90, 60), capture([], 70, 100))).toBeGreaterThan(0);
  });

  it("prefers inside-range fidelity before finish when scores tie on integrity", () => {
    expect(
      compareCreativeCaptures(capture([], 61, 60, "balanced"), capture([], 59, 100, "balanced"))
    ).toBeGreaterThan(0);
  });

  it("uses finish after integrity and fidelity", () => {
    expect(compareCreativeCaptures(capture([], 90, 85), capture([], 90, 70))).toBeGreaterThan(0);
  });
});
