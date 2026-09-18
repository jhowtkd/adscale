import { describe, expect, it } from "vitest";
import {
  checkOverheadBudgets,
  OVERHEAD_MIN_OPS,
  parseOverheadArgs,
  percentile,
  resolveOverheadBudgets,
  summarizeSamples,
} from "./measure-diagnostics-overhead";

describe("percentile", () => {
  it("computes nearest-rank without mutating the input", () => {
    const values = [5, 1, 4, 2, 3];
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 0.95)).toBe(5);
    expect(percentile(values, 0.01)).toBe(1);
    expect(values).toEqual([5, 1, 4, 2, 3]);
    expect(percentile([], 0.95)).toBe(0);
  });

  it("handles single-value and skewed samples", () => {
    expect(percentile([7], 0.95)).toBe(7);
    const skewed = [...Array(99).fill(1), 100];
    expect(percentile(skewed, 0.5)).toBe(1);
    expect(percentile(skewed, 0.95)).toBe(1);
  });
});

describe("summarizeSamples", () => {
  it("reports full dispersion", () => {
    const summary = summarizeSamples([1, 2, 3, 4]);
    expect(summary.count).toBe(4);
    expect(summary.minMs).toBe(1);
    expect(summary.maxMs).toBe(4);
    expect(summary.meanMs).toBe(2.5);
    expect(summary.p50Ms).toBe(2);
    expect(summary.p95Ms).toBe(4);
    expect(summary.stddevMs).toBeCloseTo(1.118, 3);
  });

  it("summarizes empty input as zeros", () => {
    expect(summarizeSamples([])).toEqual({
      count: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      stddevMs: 0,
    });
  });
});

describe("parseOverheadArgs", () => {
  it("rejects --ops below the 200-operation ticket minimum", () => {
    expect(OVERHEAD_MIN_OPS).toBe(200);
    expect(() => parseOverheadArgs(["--ops", "199"])).toThrow(/at least 200/);
    expect(() => parseOverheadArgs(["--ops", "nope"])).toThrow(/--ops/);
    expect(() => parseOverheadArgs(["--bogus"])).toThrow(/unknown flag/);
    expect(parseOverheadArgs(["--ops", "200"]).ops).toBe(200);
    expect(parseOverheadArgs([]).ops).toBeGreaterThanOrEqual(200);
  });
});

describe("budgets", () => {
  it("resolves env overrides with safe defaults", () => {
    expect(resolveOverheadBudgets({})).toEqual({ p95Ms: 5, rssMiB: 20 });
    expect(
      resolveOverheadBudgets({
        DIAGNOSTICS_OVERHEAD_P95_BUDGET_MS: "10",
        DIAGNOSTICS_OVERHEAD_RSS_BUDGET_MIB: "30",
      }),
    ).toEqual({ p95Ms: 10, rssMiB: 30 });
    expect(resolveOverheadBudgets({ DIAGNOSTICS_OVERHEAD_P95_BUDGET_MS: "nope" })).toEqual({
      p95Ms: 5,
      rssMiB: 20,
    });
  });

  it("fails only the exceeded budget", () => {
    expect(checkOverheadBudgets({ p95Ms: 5, rssDeltaMiB: 20 }, { p95Ms: 5, rssMiB: 20 })).toEqual([]);
    expect(checkOverheadBudgets({ p95Ms: 5.1, rssDeltaMiB: 1 }, { p95Ms: 5, rssMiB: 20 })).toEqual([
      "instrumented p95 5.1ms exceeds budget 5ms",
    ]);
    expect(checkOverheadBudgets({ p95Ms: 1, rssDeltaMiB: 21 }, { p95Ms: 5, rssMiB: 20 })).toEqual([
      "RSS growth 21MiB exceeds budget 20MiB",
    ]);
  });
});
