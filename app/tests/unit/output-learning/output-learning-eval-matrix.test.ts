import { describe, expect, it } from "vitest";
import {
  evalMatrixKeys,
  evalScenarioByKey,
  factualIntegrityScenarios,
  OUTPUT_LEARNING_EVAL_MATRIX,
  OUTPUT_LEARNING_EVAL_MATRIX_VERSION,
  qualitySignalScenarios,
  QUALITY_IMPROVEMENT_PATH_THRESHOLD,
  FACTUAL_INTEGRITY_THRESHOLD,
} from "../../../scripts/output-learning-eval-matrix";

describe("OUTPUT_LEARNING_EVAL_MATRIX (EVAL-01)", () => {
  it("exports stable matrix version", () => {
    expect(OUTPUT_LEARNING_EVAL_MATRIX_VERSION).toBe(1);
  });

  it("defines unique scenario keys", () => {
    const keys = evalMatrixKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(8);
  });

  it("keys match pipeline:safety: prefix pattern", () => {
    for (const key of evalMatrixKeys()) {
      expect(key).toMatch(/^(pipeline|safety):[\w-]+$/);
      expect(evalScenarioByKey(key)).toBeDefined();
    }
  });

  it("covers quality_signal and factual_integrity categories (EVAL-02)", () => {
    const categories = new Set(OUTPUT_LEARNING_EVAL_MATRIX.map((row) => row.category));
    expect(categories.has("quality_signal")).toBe(true);
    expect(categories.has("factual_integrity")).toBe(true);
    expect(qualitySignalScenarios().length).toBeGreaterThanOrEqual(5);
    expect(factualIntegrityScenarios().length).toBeGreaterThanOrEqual(3);
  });

  it("quality scenarios declare improvement-path signals", () => {
    for (const row of qualitySignalScenarios()) {
      expect(row.qualitySignal).toBeTruthy();
      expect(row.factualExpectation).toBeUndefined();
    }
  });

  it("factual scenarios declare integrity expectations", () => {
    for (const row of factualIntegrityScenarios()) {
      expect(row.factualExpectation).toBeTruthy();
      expect(row.qualitySignal).toBeUndefined();
    }
  });

  it("thresholds require full pass on both metric buckets", () => {
    expect(QUALITY_IMPROVEMENT_PATH_THRESHOLD).toBe(1);
    expect(FACTUAL_INTEGRITY_THRESHOLD).toBe(1);
  });
});
