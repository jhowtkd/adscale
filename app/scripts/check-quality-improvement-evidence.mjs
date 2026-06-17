#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/132-targeted-creative-quality-improvements");
const defaultEvidencePath = resolve(phaseDir, "132-EVIDENCE.json");
const creativeValidationEvidencePath = resolve(
  repoRoot,
  ".planning/phases/123-visual-validation-gate/123-EVIDENCE.json"
);
const outputLearningEvidencePath = resolve(
  repoRoot,
  ".planning/phases/128-evaluation-and-release-gate/128-EVIDENCE.json"
);

const V12_3_REGRESSION_TESTS = [
  "tests/unit/ai/gate-failure-matrix.test.ts",
  "tests/unit/ai/creative-quality-gate.test.ts",
];

const V12_4_SAFETY_TESTS = ["src/server/output-learning/safety/guards.test.ts"];

const REQUIRED_REQUIREMENT_IDS = ["QUALITY-03"];

const BLENDED_FIELD_DENYLIST = [
  "overallQualityPass",
  "combinedScore",
  "overallPass",
  "combinedPass",
  "blendedPassRate",
  "qualityImprovementPathRate",
  "safetyGuardPassRate",
  "factualFidelityRate",
];

const REGRESSION_RATE_THRESHOLD = 1.0;

function usage() {
  return "Usage: node app/scripts/check-quality-improvement-evidence.mjs [--evidence PATH] [--skip-tests] [--run-regression]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`QUALITY-IMPROVEMENT-EVIDENCE: ${error}`);
  }
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    evidencePath: defaultEvidencePath,
    skipTests: false,
    runRegression: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--evidence") {
      args.evidencePath = resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (token === "--skip-tests") {
      args.skipTests = true;
    } else if (token === "--run-regression") {
      args.runRegression = true;
    } else if (token === "--help" || token === "-h") {
      console.log(usage());
      process.exit(0);
    }
  }
  return args;
}

function runVitest(files) {
  execFileSync("npm", ["test", "--", ...files], {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
  });
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertRateAtLeast(rate, fieldName, errors, label) {
  if (rate == null) {
    return;
  }
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    errors.push(`${label}.regressionMetrics.${fieldName} must be a number or null`);
    return;
  }
  if (rate < REGRESSION_RATE_THRESHOLD) {
    errors.push(
      `${label}.regressionMetrics.${fieldName} ${rate} is below required ${REGRESSION_RATE_THRESHOLD}`
    );
  }
}

function validateRegressionMetrics(regressionMetrics, errors, label = "evidence") {
  if (!isPlainObject(regressionMetrics)) {
    errors.push(`${label}.regressionMetrics must be an object`);
    return;
  }

  assertRateAtLeast(
    regressionMetrics.factualFidelityRate,
    "factualFidelityRate",
    errors,
    label
  );
  assertRateAtLeast(
    regressionMetrics.safetyGuardPassRate,
    "safetyGuardPassRate",
    errors,
    label
  );

  if ("gateMatrixPass" in regressionMetrics && typeof regressionMetrics.gateMatrixPass !== "boolean") {
    errors.push(`${label}.regressionMetrics.gateMatrixPass must be a boolean when present`);
  }
}

function validateAcceptedAdjustments(acceptedAdjustments, errors, label = "evidence") {
  if (!Array.isArray(acceptedAdjustments)) {
    errors.push(`${label}.acceptedAdjustments must be an array`);
    return;
  }

  for (const [index, entry] of acceptedAdjustments.entries()) {
    const prefix = `${label}.acceptedAdjustments[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof entry.adjustmentId !== "string" || entry.adjustmentId.length === 0) {
      errors.push(`${prefix}.adjustmentId must be a non-empty string`);
    }
    if (typeof entry.targetModule !== "string" || entry.targetModule.length === 0) {
      errors.push(`${prefix}.targetModule must be a non-empty string`);
    }
    if (typeof entry.targetKey !== "string" || entry.targetKey.length === 0) {
      errors.push(`${prefix}.targetKey must be a non-empty string`);
    }
  }
}

function validateMetricStubs(evidence, errors, label = "evidence") {
  if (!isPlainObject(evidence.visualMetrics)) {
    errors.push(`${label}.visualMetrics must be an object (stub until 132-04 CLI)`);
  }
  if (!isPlainObject(evidence.factualMetrics)) {
    errors.push(`${label}.factualMetrics must be an object (stub until 132-04 CLI)`);
  }
}

function validateEvidenceShape(evidence, errors, label = "evidence") {
  if (!isPlainObject(evidence)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }

  if (evidence.schemaVersion !== 1) {
    errors.push(`${label}.schemaVersion must be 1`);
  }

  if (typeof evidence.rubricCalibrationVersion !== "string" || !evidence.rubricCalibrationVersion) {
    errors.push(`${label}.rubricCalibrationVersion must be a non-empty string`);
  }

  if (evidence.status !== "ok" && evidence.status !== "insufficient_sample") {
    errors.push(`${label}.status must be "ok" or "insufficient_sample"`);
  }

  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root`);
    }
  }

  validateRegressionMetrics(evidence.regressionMetrics, errors, label);
  validateAcceptedAdjustments(evidence.acceptedAdjustments, errors, label);
  validateMetricStubs(evidence, errors, label);

  if (!Array.isArray(evidence.requirements)) {
    errors.push(`${label}.requirements must be an array`);
    return;
  }

  const requirementIds = evidence.requirements.map((entry) => entry?.id).filter(Boolean);
  for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
    if (!requirementIds.includes(requiredId)) {
      errors.push(`${label}.requirements must include ${requiredId}`);
    }
  }
}

function runRegressionScripts(errors) {
  const creativeScript = resolve(repoRoot, "app/scripts/check-creative-validation-evidence.mjs");
  const outputLearningScript = resolve(repoRoot, "app/scripts/check-output-learning-evidence.mjs");

  try {
    execFileSync("node", [creativeScript, "--stage", "final"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    errors.push(
      "v12.3 factual regression failed (check-creative-validation-evidence.mjs --stage final)"
    );
    return null;
  }

  try {
    execFileSync("node", [outputLearningScript, "--skip-tests"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    errors.push("v12.4 safety regression failed (check-output-learning-evidence.mjs --skip-tests)");
    return null;
  }

  let factualFidelityRate = null;
  let safetyGuardPassRate = null;

  if (existsSync(creativeValidationEvidencePath)) {
    try {
      const creativeEvidence = JSON.parse(readFileSync(creativeValidationEvidencePath, "utf8"));
      factualFidelityRate = creativeEvidence.aggregate?.factualFidelityRate ?? null;
    } catch {
      errors.push("unable to read factualFidelityRate from creative validation evidence");
    }
  } else {
    errors.push(`creative validation evidence missing: ${creativeValidationEvidencePath}`);
  }

  if (existsSync(outputLearningEvidencePath)) {
    try {
      const outputLearningEvidence = JSON.parse(readFileSync(outputLearningEvidencePath, "utf8"));
      safetyGuardPassRate = outputLearningEvidence.factualMetrics?.safetyGuardPassRate ?? null;
    } catch {
      errors.push("unable to read safetyGuardPassRate from output learning evidence");
    }
  } else {
    errors.push(`output learning evidence missing: ${outputLearningEvidencePath}`);
  }

  return { factualFidelityRate, safetyGuardPassRate };
}

function mergeRegressionRates(evidence, liveRates, errors) {
  if (!liveRates) {
    return;
  }

  const regressionMetrics = isPlainObject(evidence.regressionMetrics)
    ? evidence.regressionMetrics
    : {};

  const merged = {
    ...regressionMetrics,
    factualFidelityRate: liveRates.factualFidelityRate,
    safetyGuardPassRate: liveRates.safetyGuardPassRate,
  };

  if (typeof merged.gateMatrixPass !== "boolean") {
    merged.gateMatrixPass = true;
  }

  validateRegressionMetrics(merged, errors, "live-regression");

  if (isPlainObject(evidence.regressionMetrics)) {
    if (
      evidence.regressionMetrics.factualFidelityRate != null &&
      liveRates.factualFidelityRate != null &&
      evidence.regressionMetrics.factualFidelityRate !== liveRates.factualFidelityRate
    ) {
      errors.push(
        `regressionMetrics.factualFidelityRate (${evidence.regressionMetrics.factualFidelityRate}) does not match live v12.3 result (${liveRates.factualFidelityRate})`
      );
    }
    if (
      evidence.regressionMetrics.safetyGuardPassRate != null &&
      liveRates.safetyGuardPassRate != null &&
      evidence.regressionMetrics.safetyGuardPassRate !== liveRates.safetyGuardPassRate
    ) {
      errors.push(
        `regressionMetrics.safetyGuardPassRate (${evidence.regressionMetrics.safetyGuardPassRate}) does not match live v12.4 result (${liveRates.safetyGuardPassRate})`
      );
    }
  }
}

function main() {
  const { evidencePath, skipTests, runRegression } = parseArgs(process.argv.slice(2));
  const errors = [];
  let gateMatrixPass = skipTests ? null : false;

  if (!existsSync(evidencePath)) {
    fail([`evidence file not found: ${evidencePath}`]);
    return;
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    fail([`invalid JSON: ${evidencePath}`]);
    return;
  }

  validateEvidenceShape(evidence, errors);

  if (!skipTests) {
    try {
      runVitest(V12_3_REGRESSION_TESTS);
      runVitest(V12_4_SAFETY_TESTS);
      gateMatrixPass = true;
    } catch {
      errors.push(
        "v12.3/v12.4 regression vitest subset failed (gate-failure-matrix, creative-quality-gate, guards.test.ts)"
      );
      gateMatrixPass = false;
    }

    if (
      isPlainObject(evidence.regressionMetrics) &&
      evidence.regressionMetrics.gateMatrixPass === false
    ) {
      errors.push("regressionMetrics.gateMatrixPass is false while gate matrix tests are required");
    }
  }

  if (runRegression) {
    const liveRates = runRegressionScripts(errors);
    mergeRegressionRates(evidence, liveRates, errors);
  }

  if (
    !skipTests &&
    gateMatrixPass === true &&
    isPlainObject(evidence.regressionMetrics) &&
    evidence.regressionMetrics.gateMatrixPass === false
  ) {
    errors.push("regressionMetrics.gateMatrixPass must be true when gate matrix tests pass");
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Quality improvement evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
  if (runRegression) {
    console.log("Regression guard: v12.3 factual + v12.4 safety scripts re-ran successfully.");
  }
}

main();
