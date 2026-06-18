import { describe, it, expect } from "vitest";
import {
  SAMPLE_GLOBAL_MIN,
  SAMPLE_SLICE_MIN,
  SAMPLE_ARM_MIN,
  TREND_GLOBAL_MIN_EVALUATED,
  TREND_SLICE_MIN,
  TREND_MIN_TIME_BUCKETS,
  MIN_GLOBAL_EVALUATED_ITEMS,
  MIN_SLICE_SAMPLE,
  MIN_GLOBAL_IMPACT_ITEMS,
  MIN_ARM_SAMPLE,
} from "@/server/human-quality/sampling/thresholds";

describe("sampling/thresholds canonical constants", () => {
  it("defines SAMPLE_GLOBAL_MIN as 5", () => {
    expect(SAMPLE_GLOBAL_MIN).toBe(5);
  });

  it("defines SAMPLE_SLICE_MIN and SAMPLE_ARM_MIN as 3", () => {
    expect(SAMPLE_SLICE_MIN).toBe(3);
    expect(SAMPLE_ARM_MIN).toBe(3);
  });

  it("defines TREND_* constants for Phase 136 without value drift", () => {
    expect(TREND_GLOBAL_MIN_EVALUATED).toBe(SAMPLE_GLOBAL_MIN);
    expect(TREND_SLICE_MIN).toBe(SAMPLE_SLICE_MIN);
    expect(TREND_MIN_TIME_BUCKETS).toBe(2);
  });
});

describe("sampling/thresholds backward-compat re-exports", () => {
  it("re-exports MIN_GLOBAL_EVALUATED_ITEMS equal to SAMPLE_GLOBAL_MIN", () => {
    expect(MIN_GLOBAL_EVALUATED_ITEMS).toBe(SAMPLE_GLOBAL_MIN);
  });

  it("re-exports MIN_SLICE_SAMPLE equal to SAMPLE_SLICE_MIN", () => {
    expect(MIN_SLICE_SAMPLE).toBe(SAMPLE_SLICE_MIN);
  });

  it("re-exports MIN_GLOBAL_IMPACT_ITEMS equal to SAMPLE_GLOBAL_MIN", () => {
    expect(MIN_GLOBAL_IMPACT_ITEMS).toBe(SAMPLE_GLOBAL_MIN);
  });

  it("re-exports MIN_ARM_SAMPLE equal to SAMPLE_ARM_MIN", () => {
    expect(MIN_ARM_SAMPLE).toBe(SAMPLE_ARM_MIN);
  });
});
