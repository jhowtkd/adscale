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
  validateInsufficientSampleGuidance,
  validateSampleGuidanceArray,
} from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(
  repoRoot,
  ".planning/phases/142-cenbrap-calibration-and-release-evidence"
);
const defaultEvidencePath = resolve(phaseDir, "142-EVIDENCE.template.json");

export const REQUIRED_REQUIREMENT_IDS = ["CALIB-03", "CALIB-04"];

export const BLENDED_FIELD_DENYLIST = [
  "overallPass",
  "combinedPass",
  "blendedAgreementRate",
  "qualityScore",
  "factualPassRate",
];

const OLHAR_RELEASE_UNIT_TESTS = [
  "src/server/olhar-calibration/olhar-release-evidence.test.ts",
  "src/server/olhar-calibration/cenbrap-calibration.test.ts",
];

const VALID_ROOT_STATUSES = [
  "ok",
  "insufficient_sample",
  "human_needed",
  "template",
  "tech_debt",
];

const INSUFFICIENT_STATUSES = [
  "insufficient_sample",
  "human_needed",
  "template",
  "tech_debt",
];

function usage() {
  return "Usage: node app/scripts/check-olhar-release-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`OLHAR-RELEASE-EVIDENCE: ${error}`);
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

function validateArtDirectionMetrics(metrics, prefix, errors) {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  validateEvidenceSourceTag(metrics, EVIDENCE_SOURCE.LIVE_HUMAN, prefix, errors);

  for (const key of [
    "evaluatedCampaignCount",
    "evaluatedDerivationCount",
    "humanDecisionCount",
    "overrideApprovedCount",
    "missingDualVerdictCount",
    "missingHumanDecisionCount",
  ]) {
    if (typeof metrics[key] !== "number" || metrics[key] < 0) {
      errors.push(`${prefix}.${key} must be a non-negative number`);
    }
  }

  if (!("agreementRate" in metrics)) {
    errors.push(`${prefix}.agreementRate is required (number or null)`);
  } else if (
    metrics.agreementRate != null &&
    (typeof metrics.agreementRate !== "number" ||
      metrics.agreementRate < 0 ||
      metrics.agreementRate > 1)
  ) {
    errors.push(`${prefix}.agreementRate must be null or a number between 0 and 1`);
  }

  if (
    !isPlainObject(metrics.mismatchReasonCounts) &&
    metrics.mismatchReasonCounts != null
  ) {
    errors.push(`${prefix}.mismatchReasonCounts must be an object`);
  }

  for (const exportField of [
    "approvedInvalidPreventedCount",
    "semOpiniaoDetectionCount",
    "exportBlockSeparationCount",
  ]) {
    if (exportField in metrics) {
      errors.push(
        `${prefix} must not include factual/export field "${exportField}" — use factualExportMetrics`
      );
    }
  }
}

function validateFactualExportMetrics(metrics, prefix, errors) {
  if (!isPlainObject(metrics)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  validateEvidenceSourceTag(metrics, EVIDENCE_SOURCE.LIVE_HUMAN, prefix, errors);

  for (const key of [
    "approvedInvalidPreventedCount",
    "semOpiniaoDetectionCount",
    "exportBlockSeparationCount",
  ]) {
    if (typeof metrics[key] !== "number" || metrics[key] < 0) {
      errors.push(`${prefix}.${key} must be a non-negative number`);
    }
  }

  for (const artField of [
    "agreementRate",
    "humanDecisionCount",
    "mismatchReasonCounts",
    "overrideApprovedCount",
  ]) {
    if (artField in metrics) {
      errors.push(
        `${prefix} must not include art-direction field "${artField}" — use artDirectionMetrics`
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

  if (evidence.milestone !== "v12.7") {
    errors.push(`${label}.milestone must be "v12.7"`);
  }

  if (!VALID_ROOT_STATUSES.includes(evidence.status)) {
    errors.push(
      `${label}.status must be one of: ${VALID_ROOT_STATUSES.join(", ")}`
    );
  }

  if (
    typeof evidence.calibrationSourcePath !== "string" ||
    evidence.calibrationSourcePath.length === 0
  ) {
    errors.push(`${label}.calibrationSourcePath must be a non-empty string`);
  }

  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}"`);
    }
  }

  validateArtDirectionMetrics(
    evidence.artDirectionMetrics,
    `${label}.artDirectionMetrics`,
    errors
  );
  validateFactualExportMetrics(
    evidence.factualExportMetrics,
    `${label}.factualExportMetrics`,
    errors
  );

  if (!Array.isArray(evidence.sampleGuidance)) {
    errors.push(`${label}.sampleGuidance must be an array`);
  }

  if (evidence.qualityImprovementClaimed === true) {
    errors.push(`${label}.qualityImprovementClaimed must not be true`);
  }

  const sampleBlocked = Array.isArray(evidence.sampleGuidance)
    ? evidence.sampleGuidance.some(
        (entry) => isPlainObject(entry) && entry.additionalNeeded > 0
      )
    : false;

  if (sampleBlocked && evidence.artDirectionMetrics?.agreementRate != null) {
    errors.push(
      `${label}.artDirectionMetrics.agreementRate must be null when sampleGuidance has additionalNeeded > 0`
    );
  }

  if (sampleBlocked && evidence.qualityImprovementClaimed === true) {
    errors.push(
      `${label}.qualityImprovementClaimed must not be true when sample guidance blocks claims`
    );
  }

  if (INSUFFICIENT_STATUSES.includes(evidence.status)) {
    validateInsufficientSampleGuidance(evidence, errors, label, {
      insufficientStatuses: INSUFFICIENT_STATUSES.filter(
        (status) => status !== "human_needed"
      ),
    });

    if (
      evidence.status === "insufficient_sample" ||
      evidence.status === "template" ||
      evidence.status === "tech_debt"
    ) {
      if (
        Array.isArray(evidence.sampleGuidance) &&
        evidence.sampleGuidance.length === 0
      ) {
        errors.push(
          `${label}.sampleGuidance must be non-empty when status is ${evidence.status}`
        );
      } else if (Array.isArray(evidence.sampleGuidance)) {
        validateSampleGuidanceArray(
          evidence.sampleGuidance,
          `${label}.sampleGuidance`,
          errors
        );
      }
    }
  }

  rejectClaimsWhenGuidanceBlocked(evidence, errors, label, {
    improvementField: "qualityImprovementClaimed",
    movementPaths: ["artDirectionMetrics.agreementRate"],
  });

  if (!Array.isArray(evidence.requirements)) {
    errors.push(`${label}.requirements must be an array`);
  } else {
    const requirementIds = evidence.requirements
      .map((entry) => entry?.id)
      .filter(Boolean);
    for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
      if (!requirementIds.includes(requiredId)) {
        errors.push(`${label}.requirements must include ${requiredId}`);
      }
    }
  }

  if (evidence.status === "human_needed") {
    const hasHumanNeeded = evidence.requirements?.some(
      (entry) => entry?.result === "human_needed"
    );
    if (!hasHumanNeeded) {
      errors.push(
        `${label}.requirements must include human_needed result when status is human_needed`
      );
    }
  }

  if (evidence.status === "ok" && evidence.artDirectionMetrics?.agreementRate == null) {
    errors.push(
      `${label}.artDirectionMetrics.agreementRate required when status is ok`
    );
  }

  if (!isPlainObject(evidence.technicalVerification)) {
    errors.push(`${label}.technicalVerification must be an object`);
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
      runVitest(OLHAR_RELEASE_UNIT_TESTS);
    } catch {
      errors.push("olhar release evidence unit test suite failed");
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Olhar release evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Status: ${evidence.status}`);
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
