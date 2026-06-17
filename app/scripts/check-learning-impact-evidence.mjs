#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/131-learning-impact-measurement");
const defaultEvidencePath = resolve(phaseDir, "131-EVIDENCE.template.json");

const IMPACT_UNIT_TESTS = [
  "tests/unit/human-quality/impact/enrich.test.ts",
  "tests/unit/human-quality/impact/aggregate.test.ts",
  "tests/unit/human-quality/impact/report.test.ts",
];

const REQUIRED_REQUIREMENT_IDS = ["IMPACT-01", "IMPACT-02", "IMPACT-03", "IMPACT-04"];
const BLENDED_FIELD_DENYLIST = [
  "overallImpactScore",
  "qualityImprovementPathRate",
  "safetyGuardPassRate",
  "overallPass",
  "combinedPass",
  "blendedPassRate",
];

function usage() {
  return "Usage: node app/scripts/check-learning-impact-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`LEARNING-IMPACT-EVIDENCE: ${error}`);
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

function validateLearningImpactMetrics(metrics, errors, prefix = "learningImpactMetrics") {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of [
    "learnedCount",
    "nonLearnedCount",
    "unlabeledCount",
    "slices",
    "globalVisualScoreDelta",
  ]) {
    if (!(key in metrics)) {
      errors.push(`${prefix}.${key} is required`);
    }
  }

  if (!Array.isArray(metrics.slices)) {
    errors.push(`${prefix}.slices must be an array`);
  }
}

function validateIntentMetrics(metrics, errors, prefix = "intentMetrics") {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const arm of ["learned", "nonLearned"]) {
    if (!isPlainObject(metrics[arm])) {
      errors.push(`${prefix}.${arm} must be an object`);
      continue;
    }
    if (!("rejectRate" in metrics[arm])) {
      errors.push(`${prefix}.${arm}.rejectRate is required`);
    }
    if (!("regenerateRate" in metrics[arm])) {
      errors.push(`${prefix}.${arm}.regenerateRate is required`);
    }
  }
}

function validateVisualMovementMetrics(metrics, errors, prefix = "visualMovementMetrics") {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of [
    "learnedMeanVisualScore",
    "nonLearnedMeanVisualScore",
    "deltaLearnedMinusNonLearned",
  ]) {
    if (!(key in metrics)) {
      errors.push(`${prefix}.${key} is required`);
    }
  }
}

function validateFactualMetrics(metrics, errors, prefix = "factualMetrics") {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of ["learnedFactualPassRate", "nonLearnedFactualPassRate"]) {
    if (!(key in metrics)) {
      errors.push(`${prefix}.${key} is required`);
    }
  }
}

function validateHonestyGates(evidence, errors, label = "evidence") {
  if (evidence.status !== "insufficient_sample") {
    return;
  }

  if (evidence.visualMovementMetrics?.deltaLearnedMinusNonLearned != null) {
    errors.push(
      `${label}.visualMovementMetrics.deltaLearnedMinusNonLearned must be null when status is insufficient_sample`
    );
  }

  if (evidence.learningImpactMetrics?.globalVisualScoreDelta != null) {
    errors.push(
      `${label}.learningImpactMetrics.globalVisualScoreDelta must be null when status is insufficient_sample`
    );
  }

  if (evidence.improvementClaimed === true) {
    errors.push(`${label}.improvementClaimed must not be true when status is insufficient_sample`);
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

  if (typeof evidence.learningImpactVersion !== "string" || !evidence.learningImpactVersion) {
    errors.push(`${label}.learningImpactVersion must be a non-empty string`);
  }

  if (evidence.status !== "ok" && evidence.status !== "insufficient_sample") {
    errors.push(`${label}.status must be "ok" or "insufficient_sample"`);
  }

  if (typeof evidence.evaluatedItemCount !== "number" || evidence.evaluatedItemCount < 0) {
    errors.push(`${label}.evaluatedItemCount must be a non-negative number`);
  }

  if (!Array.isArray(evidence.insufficientReasons)) {
    errors.push(`${label}.insufficientReasons must be an array`);
  }

  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}"`);
    }
  }

  validateLearningImpactMetrics(evidence.learningImpactMetrics, errors, `${label}.learningImpactMetrics`);
  validateIntentMetrics(evidence.intentMetrics, errors, `${label}.intentMetrics`);
  validateVisualMovementMetrics(
    evidence.visualMovementMetrics,
    errors,
    `${label}.visualMovementMetrics`
  );
  validateFactualMetrics(evidence.factualMetrics, errors, `${label}.factualMetrics`);

  if (!Array.isArray(evidence.rows)) {
    errors.push(`${label}.rows must be an array`);
  }

  if (!Array.isArray(evidence.requirements)) {
    errors.push(`${label}.requirements must be an array`);
  } else {
    const requirementIds = evidence.requirements.map((entry) => entry?.id).filter(Boolean);
    for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
      if (!requirementIds.includes(requiredId)) {
        errors.push(`${label}.requirements must include ${requiredId}`);
      }
    }
  }

  if (evidence.status === "ok") {
    if (evidence.learningImpactMetrics?.globalVisualScoreDelta == null) {
      errors.push(
        `${label}.learningImpactMetrics.globalVisualScoreDelta required when status is ok`
      );
    }
    if (evidence.visualMovementMetrics?.deltaLearnedMinusNonLearned == null) {
      errors.push(
        `${label}.visualMovementMetrics.deltaLearnedMinusNonLearned required when status is ok`
      );
    }
  }

  validateHonestyGates(evidence, errors, label);
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

  if (isPlainObject(evidence._schemaExamples?.insufficient_sample)) {
    validateEvidenceShape(
      evidence._schemaExamples.insufficient_sample,
      errors,
      "_schemaExamples.insufficient_sample"
    );
  }

  if (!skipTests) {
    try {
      runVitest(IMPACT_UNIT_TESTS);
    } catch {
      errors.push("impact unit test suite failed");
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Learning impact evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
}

main();
