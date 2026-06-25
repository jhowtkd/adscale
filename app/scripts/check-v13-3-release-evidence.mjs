#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_SOURCE,
  isPlainObject,
  validateEvidenceSourceTag,
} from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Shipped v13.3 phase dir — archived after milestone cleanup; active path kept as fallback. */
export function resolveV133PhaseDir(root = repoRoot) {
  const candidates = [
    resolve(root, ".planning/milestones/v13.3-phases/172-operational-evidence-ui-and-release-gate"),
    resolve(root, ".planning/phases/172-operational-evidence-ui-and-release-gate"),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "172-EVIDENCE.template.json"))) {
      return dir;
    }
  }
  return candidates[0];
}

const phaseDir = resolveV133PhaseDir();
const defaultEvidencePath = resolve(phaseDir, "172-EVIDENCE.template.json");

export const BLENDED_FIELD_DENYLIST = [
  "milestonePass",
  "overallOperationalPass",
  "customerValidated",
  "overallQualityPass",
  "combinedPass",
];

export const REQUIRED_REQUIREMENT_IDS = ["ALERT-01", "ALERT-02", "ALERT-03", "ALERT-04"];

export const REQUIRED_PHASE_SURFACE_KEYS = ["168", "169", "170", "171", "172"];

const VALID_ROOT_STATUSES = [
  "ok",
  "tech_debt",
  "insufficient_sample",
  "blocked",
  "gaps_found",
  "claim_withheld",
];

const VALID_TECHNICAL_STATUSES = ["pass", "fail"];

const VALID_OPERATIONAL_STATUSES = ["ok", "insufficient_sample", "gaps_found", "pending"];

function usage() {
  return "Usage: node app/scripts/check-v13-3-release-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`V13-3-RELEASE-EVIDENCE: ${error}`);
  }
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    evidencePath: defaultEvidencePath,
    skipTests: false,
  };
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

/**
 * Honest milestone root status: technical fail blocks; technical pass + insufficient operational → tech_debt.
 */
export function resolveMilestoneStatus(technicalStatus, operationalStatus) {
  if (technicalStatus === "fail") {
    return { rootStatus: "blocked", exitCode: 1 };
  }
  if (operationalStatus === "ok") {
    return { rootStatus: "ok", exitCode: 0 };
  }
  if (operationalStatus === "gaps_found") {
    return { rootStatus: "gaps_found", exitCode: 0 };
  }
  if (operationalStatus === "insufficient_sample" || operationalStatus === "pending") {
    return { rootStatus: "tech_debt", exitCode: 0 };
  }
  return { rootStatus: "tech_debt", exitCode: 0 };
}

export function validateRootBlendedFields(evidence, errors, label = "evidence") {
  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root (T-172-07)`);
    }
  }
}

export function validateRequirements(requirements, errors, label = "evidence") {
  if (!Array.isArray(requirements)) {
    errors.push(`${label}.requirements must be an array`);
    return;
  }

  const requirementIds = requirements.map((entry) => entry?.id).filter(Boolean);
  for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
    if (!requirementIds.includes(requiredId)) {
      errors.push(`${label}.requirements must include ${requiredId}`);
    }
  }

  for (const [index, row] of requirements.entries()) {
    if (!isPlainObject(row)) {
      errors.push(`${label}.requirements[${index}] must be an object`);
      continue;
    }
    if (typeof row.id !== "string" || !row.id) {
      errors.push(`${label}.requirements[${index}].id must be a non-empty string`);
    }
    if (typeof row.automated !== "string" || !row.automated) {
      errors.push(
        `${label}.requirements[${index}].automated must be a non-empty string (T-172-09)`
      );
    }
    if (typeof row.result !== "string" || !row.result) {
      errors.push(`${label}.requirements[${index}].result must be a non-empty string`);
    }
  }
}

export function validatePhaseSurfaces(phaseSurfaces, errors, label = "evidence") {
  if (!isPlainObject(phaseSurfaces)) {
    errors.push(`${label}.phaseSurfaces must be an object`);
    return;
  }

  for (const phaseKey of REQUIRED_PHASE_SURFACE_KEYS) {
    if (!(phaseKey in phaseSurfaces)) {
      errors.push(`${label}.phaseSurfaces must include key "${phaseKey}"`);
      continue;
    }
    const surface = phaseSurfaces[phaseKey];
    if (!isPlainObject(surface)) {
      errors.push(`${label}.phaseSurfaces.${phaseKey} must be an object`);
      continue;
    }
    if (typeof surface.label !== "string" || !surface.label) {
      errors.push(`${label}.phaseSurfaces.${phaseKey}.label must be a non-empty string`);
    }
    if (typeof surface.status !== "string" || !surface.status) {
      errors.push(`${label}.phaseSurfaces.${phaseKey}.status must be a non-empty string`);
    }
    if (typeof surface.automated !== "string" || !surface.automated) {
      errors.push(`${label}.phaseSurfaces.${phaseKey}.automated must be a non-empty string`);
    }
  }
}

export function assertDualStatusSeparation(evidence, errors) {
  const technical = evidence.technicalRegression;
  const operational = evidence.operationalEvidence;

  if (!isPlainObject(technical)) {
    errors.push("ALERT-04: technicalRegression must be a top-level object");
    return;
  }

  if (!isPlainObject(operational)) {
    errors.push("ALERT-04: operationalEvidence must be a top-level object");
    return;
  }

  validateEvidenceSourceTag(
    technical,
    EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
    "technicalRegression",
    errors
  );
  validateEvidenceSourceTag(
    operational,
    EVIDENCE_SOURCE.LIVE_HUMAN,
    "operationalEvidence",
    errors
  );

  if (!VALID_TECHNICAL_STATUSES.includes(technical.status)) {
    errors.push('technicalRegression.status must be "pass" or "fail"');
  }

  if (!VALID_OPERATIONAL_STATUSES.includes(operational.status)) {
    errors.push(
      'operationalEvidence.status must be one of: ok, insufficient_sample, gaps_found, pending'
    );
  }

  if (technical.status === "pass" && operational.status === "insufficient_sample") {
    if (evidence.status === "ok") {
      errors.push(
        "T-172-07: root status must not be ok when operationalEvidence.status is insufficient_sample"
      );
    }
  }

  if (technical.status === "fail" && evidence.status !== "blocked") {
    errors.push('root status must be "blocked" when technicalRegression.status is fail');
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

  if (evidence.milestoneVersion !== "v13.3") {
    errors.push(`${label}.milestoneVersion must be "v13.3"`);
  }

  if (!VALID_ROOT_STATUSES.includes(evidence.status)) {
    errors.push(`${label}.status must be one of: ${VALID_ROOT_STATUSES.join(", ")}`);
  }

  for (const field of ["capturedAt", "verifiedAt"]) {
    if (typeof evidence[field] !== "string" || !evidence[field]) {
      errors.push(`${label}.${field} must be a non-empty ISO timestamp string`);
    }
  }

  if (!isPlainObject(evidence.technicalRegression)) {
    errors.push(`${label}.technicalRegression is required`);
  } else if (typeof evidence.technicalRegression.gateMatrixPass !== "boolean") {
    errors.push(`${label}.technicalRegression.gateMatrixPass must be a boolean`);
  }

  if (!isPlainObject(evidence.operationalEvidence)) {
    errors.push(`${label}.operationalEvidence is required`);
  } else if (!isPlainObject(evidence.operationalEvidence.gates)) {
    errors.push(`${label}.operationalEvidence.gates is required`);
  }

  validateRootBlendedFields(evidence, errors, label);
  validatePhaseSurfaces(evidence.phaseSurfaces, errors, label);
  validateRequirements(evidence.requirements, errors, label);

  if (!isPlainObject(evidence.automated)) {
    errors.push(`${label}.automated must be an object`);
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
  assertDualStatusSeparation(evidence, errors);

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("v13.3 release evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
  if (skipTests) {
    console.log("Tests skipped (--skip-tests).");
  }
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
