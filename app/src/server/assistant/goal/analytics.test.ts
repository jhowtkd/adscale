import { describe, expect, it } from "vitest";
import { computeGraduationReport, GOAL_EVENT_KEYS } from "./analytics";

describe("GOAL_EVENT_KEYS", () => {
  it("contains the bounded set of pilot event keys", () => {
    expect(GOAL_EVENT_KEYS).toContain("goal_started");
    expect(GOAL_EVENT_KEYS).toContain("goal_completed");
    expect(GOAL_EVENT_KEYS).toContain("goal_abandoned");
    expect(GOAL_EVENT_KEYS).toHaveLength(12);
  });
});

describe("computeGraduationReport", () => {
  it("passes only with 20+ objectives across 3+ clients at 60%+ completion and zero critical failures", () => {
    const report = computeGraduationReport({
      startedObjectives: 25,
      completedObjectives: 16,
      distinctClients: 4,
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: {},
    });

    expect(report.completionRate).toBeCloseTo(0.64, 2);
    expect(report.graduation.passed).toBe(true);
    expect(report.graduation.enoughObjectives).toBe(true);
    expect(report.graduation.enoughClients).toBe(true);
    expect(report.graduation.enoughCompletion).toBe(true);
    expect(report.graduation.noCriticalFailures).toBe(true);
  });

  it("fails when fewer than 20 objectives", () => {
    const report = computeGraduationReport({
      startedObjectives: 15,
      completedObjectives: 12,
      distinctClients: 3,
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: {},
    });

    expect(report.graduation.passed).toBe(false);
    expect(report.graduation.enoughObjectives).toBe(false);
  });

  it("fails when fewer than 3 distinct clients", () => {
    const report = computeGraduationReport({
      startedObjectives: 25,
      completedObjectives: 20,
      distinctClients: 2,
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: {},
    });

    expect(report.graduation.passed).toBe(false);
    expect(report.graduation.enoughClients).toBe(false);
  });

  it("fails when completion rate is below 60%", () => {
    const report = computeGraduationReport({
      startedObjectives: 25,
      completedObjectives: 10,
      distinctClients: 4,
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: {},
    });

    expect(report.graduation.passed).toBe(false);
    expect(report.graduation.enoughCompletion).toBe(false);
  });

  it("fails when any critical credit or scope failure occurred", () => {
    const report = computeGraduationReport({
      startedObjectives: 25,
      completedObjectives: 20,
      distinctClients: 4,
      criticalCreditFailures: 1,
      criticalScopeFailures: 0,
      stageDropoff: {},
    });

    expect(report.graduation.passed).toBe(false);
    expect(report.graduation.noCriticalFailures).toBe(false);
  });

  it("reports stage dropoff counts", () => {
    const report = computeGraduationReport({
      startedObjectives: 25,
      completedObjectives: 20,
      distinctClients: 4,
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: { choosing_base: 3, reviewing_package: 2 },
    });

    expect(report.stageDropoff.choosing_base).toBe(3);
    expect(report.stageDropoff.reviewing_package).toBe(2);
  });
});
