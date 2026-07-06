import fs from "node:fs";
import { pathToFileURL } from "node:url";

export type BlindDecision = {
  preferred: "baseline" | "recalibrated";
  objectiveRegression: boolean;
};

export function evaluateBlindGate(decisions: BlindDecision[]) {
  if (decisions.length !== 12) {
    throw new Error("Blind gate requires exactly 12 decisions");
  }

  const preferenceRate =
    decisions.filter((item) => item.preferred === "recalibrated").length / 12;

  return {
    passed: preferenceRate >= 0.6 && decisions.every((item) => !item.objectiveRegression),
    preferenceRate,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    throw new Error("Usage: check-image-harness-blind-gate.ts <evidence.json>");
  }

  const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as { pairs: BlindDecision[] };
  const result = evaluateBlindGate(evidence.pairs);
  console.log(
    `${result.passed ? "PASS" : "FAIL"} preference=${(result.preferenceRate * 100).toFixed(1)}%`
  );
  if (!result.passed) {
    process.exitCode = 1;
  }
}
