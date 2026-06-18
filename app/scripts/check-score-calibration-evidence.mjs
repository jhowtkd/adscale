#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_SOURCE,
  rejectClaimsWhenGuidanceBlocked,
  validateEvidenceSourceTag,
  validateInsufficientSampleGuidance,
} from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/130-score-calibration-and-rubric-alignment");
const defaultEvidencePath = resolve(phaseDir, "130-EVIDENCE.template.json");

const CALIBRATION_UNIT_TESTS = [
  "tests/unit/human-quality/calibration/compare.test.ts",
  "tests/unit/human-quality/calibration/aggregate.test.ts",
  "tests/unit/human-quality/calibration/adjustments.test.ts",
  "tests/unit/human-quality/calibration/failure-bridge.test.ts",
  "tests/unit/human-quality/calibration-adjustments-repository.test.ts",
];

const REQUIRED_REQUIREMENT_IDS = ["CALIB-01", "CALIB-02", "CALIB-03", "CALIB-04"];
const BLENDED_FIELD_DENYLIST = [
  "overallPass",
  "combinedPass",
  "blendedPassRate",
  "qualityImprovementPathRate",
  "safetyGuardPassRate",
];

function usage() {
  return "Usage: node app/scripts/check-score-calibration-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`SCORE-CALIBRATION-EVIDENCE: ${error}`);
  }
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = { evidencePath: defaultEvidencePath, skipTests: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--evidence") {
      args.evidencePath = resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (token === "--skip-tests") {
      args.skipTests = true;
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

function validateVisualMetrics(visualMetrics, errors, prefix = "visualMetrics") {
  if (!isPlainObject(visualMetrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of [
    "meanAbsError",
    "meanSignedDelta",
    "overScoreCount",
    "underScoreCount",
    "divergenceByFailureReason",
    "divergenceByMode",
    "divergenceByFormat",
    "comparisons",
  ]) {
    if (!(key in visualMetrics)) {
      errors.push(`${prefix}.${key} is required`);
    }
  }

  if (!Array.isArray(visualMetrics.comparisons)) {
    errors.push(`${prefix}.comparisons must be an array`);
  }

  validateEvidenceSourceTag(visualMetrics, EVIDENCE_SOURCE.LIVE_HUMAN, prefix, errors);
}

function validateFactualMetrics(factualMetrics, errors, prefix = "factualMetrics") {
  if (!isPlainObject(factualMetrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of ["factualPassRate", "factualFailCount", "highVisualButFactualFail"]) {
    if (!(key in factualMetrics)) {
      errors.push(`${prefix}.${key} is required`);
    }
  }

  if (!Array.isArray(factualMetrics.highVisualButFactualFail)) {
    errors.push(`${prefix}.highVisualButFactualFail must be an array`);
  }

  validateEvidenceSourceTag(factualMetrics, EVIDENCE_SOURCE.LIVE_HUMAN, prefix, errors);
}

function validateSamplingHonesty(evidence, errors, label = "evidence") {
  if (evidence.status === "insufficient_corpus") {
    validateInsufficientSampleGuidance(evidence, errors, label, {
      insufficientStatuses: ["insufficient_corpus"],
    });
    rejectClaimsWhenGuidanceBlocked(evidence, errors, label, {
      movementPaths: ["visualMetrics.meanAbsError", "visualMetrics.meanSignedDelta"],
    });
  }
}

export function validateEvidenceShape(evidence, errors, label = "evidence") {
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

  if (evidence.status !== "ok" && evidence.status !== "insufficient_corpus") {
    errors.push(`${label}.status must be "ok" or "insufficient_corpus"`);
  }

  if (typeof evidence.evaluatedItemCount !== "number" || evidence.evaluatedItemCount < 0) {
    errors.push(`${label}.evaluatedItemCount must be a non-negative number`);
  }

  if (evidence.status === "ok" && evidence.evaluatedItemCount < 5) {
    errors.push(`${label} with status ok requires evaluatedItemCount >= 5`);
  }

  if (evidence.status === "insufficient_corpus" && evidence.evaluatedItemCount >= 5) {
    errors.push(`${label} with status insufficient_corpus requires evaluatedItemCount < 5`);
  }

  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}"`);
    }
  }

  validateVisualMetrics(evidence.visualMetrics, errors, `${label}.visualMetrics`);
  validateFactualMetrics(evidence.factualMetrics, errors, `${label}.factualMetrics`);

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

  if (evidence.status === "ok") {
    if (evidence.visualMetrics?.meanAbsError == null) {
      errors.push(`${label}.visualMetrics.meanAbsError required when status is ok`);
    }
    if (evidence.visualMetrics?.meanSignedDelta == null) {
      errors.push(`${label}.visualMetrics.meanSignedDelta required when status is ok`);
    }
  }

  if (evidence.status === "insufficient_corpus") {
    if (evidence.visualMetrics?.meanAbsError != null) {
      errors.push(`${label}.visualMetrics.meanAbsError must be null when status is insufficient_corpus`);
    }
    if (evidence.visualMetrics?.meanSignedDelta != null) {
      errors.push(`${label}.visualMetrics.meanSignedDelta must be null when status is insufficient_corpus`);
    }
  }

  validateSamplingHonesty(evidence, errors, label);
}

function main() {
  const { evidencePath, skipTests } = parseArgs(process.argv.slice(2));
  const errors = [];

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

  if (isPlainObject(evidence._schemaExamples?.insufficient_corpus)) {
    validateEvidenceShape(
      evidence._schemaExamples.insufficient_corpus,
      errors,
      "_schemaExamples.insufficient_corpus"
    );
  }

  if (!skipTests) {
    try {
      runVitest(CALIBRATION_UNIT_TESTS);
    } catch {
      errors.push("calibration unit test suite failed");
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Score calibration evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
