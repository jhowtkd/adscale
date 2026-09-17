import { describe, expect, it } from "vitest";
import {
  buildBlindPackage,
  PACKAGE_MANDATORY_CASES,
  shuffleBlindAssignments,
  type BlindPackageSpec,
} from "./build-quality-recovery-blind-package";

function spec(): BlindPackageSpec {
  const protocols = [
    "single",
    "single",
    "variations",
    "variations",
    "format_adaptation",
    "format_adaptation",
    "restyle",
    "restyle",
    "carousel",
    "carousel",
  ] as const;
  return {
    schemaVersion: 1,
    seed: "exp-1",
    journeys: protocols.map((protocol, index) => ({
      id: `j${index + 1}`,
      protocol,
      brand: "Brand",
      segment: "Seg",
      mandatoryCase: PACKAGE_MANDATORY_CASES[index % PACKAGE_MANDATORY_CASES.length]!,
      plannedOutputs: 3,
    })),
  };
}

describe("quality-recovery blind package (ICE-05A)", () => {
  it("shuffles assignments deterministically per seed and covers every source", () => {
    const first = shuffleBlindAssignments("exp-1", "j1");
    expect(shuffleBlindAssignments("exp-1", "j1")).toEqual(first);
    expect(new Set(Object.values(first))).toEqual(
      new Set(["production_snapshot", "direct_generation", "creative_work_v1"]),
    );
    expect(Object.keys(first).sort()).toEqual(["A", "B", "C"]);
  });

  it("emits a pending scaffold with null human fields and unrevealed assignments", () => {
    const pkg = buildBlindPackage(spec());
    expect(pkg.status).toBe("pending_human_review");
    expect(pkg.randomization).toEqual({ seed: "exp-1", algorithm: "mulberry32-xfnv1a" });
    expect(pkg.journeys).toHaveLength(10);
    for (const journey of pkg.journeys) {
      expect(journey.reviewerId).toBeNull();
      expect(journey.objectiveVerdict).toBeNull();
      expect(journey.blindComparison.assignmentsRevealed).toBe(false);
      expect(journey.blindComparison.preferenceVsProduction).toBeNull();
      expect(journey.blindComparison.preferenceVsDirect).toBeNull();
      expect(journey.blindComparison.preferenceProvenance).toEqual({
        vsProduction: null,
        vsDirect: null,
      });
    }
    expect(pkg.budgetApproval).toEqual({ approvedBy: null, approvedAt: null, reference: null });
  });

  it("enforces the gate's structural minimums instead of emitting a doomed package", () => {
    const unbalanced = spec();
    unbalanced.journeys[0] = { ...unbalanced.journeys[0]!, protocol: "single" };
    unbalanced.journeys[1] = { ...unbalanced.journeys[1]!, protocol: "single" };
    unbalanced.journeys[2] = { ...unbalanced.journeys[2]!, protocol: "single" };
    expect(() => buildBlindPackage(unbalanced)).toThrow(/exactly 2 journeys/);
    const noCases = spec();
    noCases.journeys = noCases.journeys.map((journey) => ({ ...journey, mandatoryCase: null }));
    expect(() => buildBlindPackage(noCases)).toThrow(/mandatory cases missing/);
  });
});
