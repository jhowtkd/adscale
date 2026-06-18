#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_SOURCE,
  isPlainObject,
  rejectClaimsWhenGuidanceBlocked,
  validateEvidenceSourceTag,
  validateSampleGuidanceArray,
} from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/136-quality-trend-dashboard");
const defaultEvidencePath = resolve(phaseDir, "136-EVIDENCE.template.json");

const TREND_UNIT_TESTS = [
  "tests/unit/human-quality/trend/report.test.ts",
  "tests/unit/human-quality/trend/aggregate.test.ts",
];

export const REQUIRED_REQUIREMENT_IDS = ["TREND-01", "TREND-02", "TREND-03", "TREND-04"];

const ALERT_FLAG_FIELDS = [
  "insufficientCoverage",
  "staleEvidence",
  "regressionDetected",
];

const BLENDED_WARNING_DENYLIST = [
  "combinedAlert",
  "blendedWarning",
  "overallTrendWarning",
  "allAlerts",
];

const MOVEMENT_FIELDS = [
  "regressionDetected",
  "meanScoreDelta",
  "trendDirectionClaimed",
  "movementClaimed",
];

function usage() {
  return "Usage: node app/scripts/check-quality-trend-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`QUALITY-TREND-EVIDENCE: ${error}`);
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

function validateAlertFlags(alertFlags, prefix, errors) {
  if (!isPlainObject(alertFlags)) {
    errors.push(`${prefix}.alertFlags must be an object`);
    return;
  }

  for (const field of ALERT_FLAG_FIELDS) {
    if (typeof alertFlags[field] !== "boolean") {
      errors.push(`${prefix}.alertFlags.${field} must be a boolean`);
    }
  }

  for (const denied of BLENDED_WARNING_DENYLIST) {
    if (denied in alertFlags) {
      errors.push(`${prefix}.alertFlags must not use blended field "${denied}"`);
    }
  }

  if (typeof alertFlags.warning === "string") {
    errors.push(`${prefix}.alertFlags must not use blended warning string field`);
  }
}

function validateReportBuckets(report, prefix, errors) {
  if (!isPlainObject(report)) {
    errors.push(`${prefix}.report must be an object`);
    return;
  }

  validateEvidenceSourceTag(report, EVIDENCE_SOURCE.LIVE_HUMAN, `${prefix}.report`, errors);

  if ("fixtureMetrics" in report) {
    errors.push(`${prefix}.report must not include fixtureMetrics in trend series`);
  }

  if (!Array.isArray(report.buckets)) {
    errors.push(`${prefix}.report.buckets must be an array`);
    return;
  }

  for (const [index, bucket] of report.buckets.entries()) {
    if (!isPlainObject(bucket)) {
      errors.push(`${prefix}.report.buckets[${index}] must be an object`);
      continue;
    }

    if (bucket.learningImpactStatus === "insufficient_sample") {
      for (const field of MOVEMENT_FIELDS) {
        if (field in bucket && bucket[field] === true) {
          errors.push(
            `${prefix}.report.buckets[${index}].${field} must not be true when learningImpactStatus is insufficient_sample`
          );
        }
      }
    }

    if (isPlainObject(bucket.fixtureMetrics)) {
      errors.push(
        `${prefix}.report.buckets[${index}] must not include fixtureMetrics`
      );
    }
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

  validateEvidenceSourceTag(evidence, EVIDENCE_SOURCE.LIVE_HUMAN, label, errors);

  if (!Array.isArray(evidence.requirements)) {
    errors.push(`${label}.requirements must be an array`);
  } else {
    const requirementIds = evidence.requirements.map((entry) => entry?.id ?? entry).filter(Boolean);
    for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
      if (!requirementIds.includes(requiredId)) {
        errors.push(`${label}.requirements must include ${requiredId}`);
      }
    }
  }

  validateAlertFlags(evidence.alertFlags, label, errors);
  validateReportBuckets(evidence.report ?? evidence, label, errors);

  if (Array.isArray(evidence.sampleGuidance)) {
    validateSampleGuidanceArray(evidence.sampleGuidance, `${label}.sampleGuidance`, errors);
    rejectClaimsWhenGuidanceBlocked(
      evidence,
      evidence.sampleGuidance,
      MOVEMENT_FIELDS,
      label,
      errors
    );
  } else if (isPlainObject(evidence.report) && Array.isArray(evidence.report.sampleGuidance)) {
    validateSampleGuidanceArray(
      evidence.report.sampleGuidance,
      `${label}.report.sampleGuidance`,
      errors
    );
    rejectClaimsWhenGuidanceBlocked(
      evidence,
      evidence.report.sampleGuidance,
      MOVEMENT_FIELDS,
      label,
      errors
    );
  }

  if (
    isPlainObject(evidence.report) &&
    Array.isArray(evidence.report.buckets) &&
    evidence.report.buckets.some(
      (bucket) =>
        isPlainObject(bucket) && bucket.learningImpactStatus === "insufficient_sample"
    )
  ) {
    for (const field of MOVEMENT_FIELDS) {
      if (evidence[field] === true || evidence.report?.[field] === true) {
        errors.push(
          `${label} must not claim movement (${field}) when any bucket has learningImpactStatus insufficient_sample`
        );
      }
    }

    if (evidence.alertFlags?.regressionDetected === true) {
      errors.push(
        `${label}.alertFlags.regressionDetected must not be true when any bucket has learningImpactStatus insufficient_sample`
      );
    }
  }
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

  if (!skipTests) {
    try {
      runVitest(TREND_UNIT_TESTS);
    } catch {
      errors.push("quality trend unit test suite failed");
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Quality trend evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
