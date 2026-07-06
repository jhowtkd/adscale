import fs from "node:fs";
import { pathToFileURL } from "node:url";

export type BlindDecision = {
  preferred: "baseline" | "recalibrated";
  objectiveRegression: boolean;
};

export type BlindGatePair = BlindDecision & {
  id: string;
  mode: "art_variation" | "format_adaptation" | "restyling";
  format: string;
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
};

export type BlindGateEvidence = {
  status: "pending_human_review" | "completed";
  pairs: BlindGatePair[];
};

export function validateBlindGateEvidenceShape(evidence: BlindGateEvidence): void {
  if (evidence.pairs.length !== 12) {
    throw new Error("Blind gate requires exactly 12 pairs");
  }
  for (const pair of evidence.pairs) {
    if (!pair.id || !pair.mode || !pair.format || !pair.creativeLevel) {
      throw new Error(`Blind gate pair ${pair.id || "(missing id)"} is missing metadata`);
    }
  }
}

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

  const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as BlindGateEvidence;
  validateBlindGateEvidenceShape(evidence);
  if (evidence.status === "pending_human_review") {
    console.log("PENDING human blind-gate decisions (12 pairs scaffolded)");
    process.exitCode = 2;
  } else {
    const result = evaluateBlindGate(evidence.pairs);
    console.log(
      `${result.passed ? "PASS" : "FAIL"} preference=${(result.preferenceRate * 100).toFixed(1)}%`
    );
    if (!result.passed) {
      process.exitCode = 1;
    }
  }
}
