import fs from "node:fs";
import { pathToFileURL } from "node:url";

export type BlindDecision = {
  preferred: "baseline" | "recalibrated" | null;
  objectiveRegression: boolean | null;
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

type FidelityGroup = {
  mode: string;
  options: Array<{
    label: string;
    creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  }>;
  reviewerConservativeOption: string | null;
  reviewerExtremeOption: string | null;
};

type FidelityEvidence = {
  status: "pending_human_review" | "completed";
  groups: FidelityGroup[];
};

export function evaluateFidelityMatrix(evidence: FidelityEvidence) {
  if (evidence.groups.length !== 3) throw new Error("Fidelity matrix requires exactly 3 modes");
  const results = evidence.groups.map((group) => {
    const conservative = group.options.find((option) => option.creativeLevel === "conservative");
    const extreme = group.options.find((option) => option.creativeLevel === "extreme");
    if (!conservative || !extreme) throw new Error(`Missing endpoint for ${group.mode}`);
    return {
      mode: group.mode,
      passed:
        group.reviewerConservativeOption === conservative.label &&
        group.reviewerExtremeOption === extreme.label,
    };
  });
  return { passed: results.every((result) => result.passed), results };
}

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

export function evaluateBlindGate(decisions: Array<Pick<BlindDecision, "preferred" | "objectiveRegression">>) {
  if (decisions.length !== 12) {
    throw new Error("Blind gate requires exactly 12 decisions");
  }

  if (decisions.some((item) => item.preferred == null || item.objectiveRegression == null)) {
    throw new Error("Blind gate requires preferred and objectiveRegression on every pair");
  }

  const preferenceRate =
    decisions.filter((item) => item.preferred === "recalibrated").length / 12;

  return {
    passed:
      preferenceRate >= 0.6 &&
      decisions.every((item) => item.objectiveRegression === false),
    preferenceRate,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fidelity = process.argv.includes("--fidelity");
  const file = process.argv.find((arg, index) => index > 1 && arg !== "--fidelity");
  if (!file) {
    throw new Error("Usage: check-image-harness-blind-gate.ts [--fidelity] <evidence.json>");
  }

  if (fidelity) {
    const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as FidelityEvidence;
    if (evidence.status === "pending_human_review") {
      console.log("PENDING human fidelity-matrix decisions (3 modes scaffolded)");
      process.exitCode = 2;
    } else {
      const result = evaluateFidelityMatrix(evidence);
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.results.map((item) => `${item.mode}=${item.passed ? "pass" : "fail"}`).join(" ")}`);
      if (!result.passed) process.exitCode = 1;
    }
    process.exit();
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
