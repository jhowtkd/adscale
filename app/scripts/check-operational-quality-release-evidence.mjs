#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BLENDED_FIELD_DENYLIST } from "./check-real-quality-release-evidence.mjs";
import {
  EVIDENCE_SOURCE,
  isPlainObject,
  rejectClaimsWhenGuidanceBlocked,
  validateEvidenceSourceTag,
} from "./lib/evidence-honesty.mjs";

export { BLENDED_FIELD_DENYLIST };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/137-operational-quality-release-gate");
const defaultEvidencePath = resolve(phaseDir, "137-EVIDENCE.template.json");
const baselinePath = resolve(phaseDir, "137-BASELINE.md");
const verificationPath = resolve(phaseDir, "137-VERIFICATION.md");

export const OPERATIONAL_BLENDED_FIELD_DENYLIST = ["milestonePass", "overallOperationalPass"];

const REQUIRED_REQUIREMENT_IDS = ["QALIVE-01", "QALIVE-02", "QALIVE-03", "QALIVE-04"];

const REQUIRED_TOP_LEVEL_SECTIONS = [
  "technicalRegression",
  "operationalEvidence",
  "qualityMetrics",
  "factualMetrics",
  "learningImpactMetrics",
  "trendMetrics",
  "acceptedCaveats",
];

const VALID_ROOT_STATUSES = ["ok", "gaps_found", "tech_debt", "blocked"];

function usage() {
  return "Usage: node app/scripts/check-operational-quality-release-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`OPERATIONAL-QUALITY-RELEASE-EVIDENCE: ${error}`);
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

export function validateRootBlendedFields(evidence, errors, label = "evidence") {
  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root`);
    }
  }
  for (const field of OPERATIONAL_BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended operational pass field "${field}" at root (QALIVE-02)`);
    }
  }
}

export function assertQalive02(evidence, errors) {
  const technical = evidence.technicalRegression;
  const operational = evidence.operationalEvidence;

  if (!isPlainObject(technical)) {
    errors.push("QALIVE-02: technicalRegression must be a top-level object");
    return;
  }

  if (!isPlainObject(operational)) {
    errors.push("QALIVE-02: operationalEvidence must be a top-level object");
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

  for (const field of OPERATIONAL_BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`QALIVE-02: evidence must not include blended field "${field}" at root`);
    }
  }

  if (technical.status !== "pass" && technical.status !== "fail") {
    errors.push('QALIVE-02: technicalRegression.status must be "pass" or "fail"');
  }

  if (
    operational.status !== "ok" &&
    operational.status !== "insufficient_sample" &&
    operational.status !== "gaps_found"
  ) {
    errors.push(
      'QALIVE-02: operationalEvidence.status must be "ok", "insufficient_sample", or "gaps_found"'
    );
  }

  if (technical.status === "fail") {
    errors.push(
      "QALIVE-02: technicalRegression.status is fail — technical regression block must pass independently"
    );
  }
}

export function assertQalive03(evidence, errors) {
  const qiGate = evidence.operationalEvidence?.gates?.qualityImprovement;
  const fixtureMetrics = isPlainObject(qiGate?.fixtureMetrics) ? qiGate.fixtureMetrics : null;

  if (evidence.qualityImprovementClaimed === true) {
    const factualRate = evidence.factualMetrics?.humanCorpusFactualPassRate;
    if (factualRate !== 1.0) {
      errors.push(
        "QALIVE-03: humanCorpusFactualPassRate must be 1.0 when qualityImprovementClaimed is true"
      );
    }

    if (qiGate?.status !== "ok") {
      errors.push("QALIVE-03: qualityImprovementClaimed must be false when gate status is not ok");
    }

    if (fixtureMetrics?.evidenceSource === EVIDENCE_SOURCE.FIXTURE && qiGate?.status !== "ok") {
      errors.push(
        "QALIVE-03: fixtureMetrics alone cannot satisfy qualityImprovementClaimed — live_human gate must be ok"
      );
    }

    rejectClaimsWhenGuidanceBlocked(
      {
        ...qiGate,
        improvementClaimed: true,
      },
      errors,
      "operationalEvidence.gates.qualityImprovement",
      {
        improvementField: "improvementClaimed",
        movementPaths: ["targetedFailureDelta", "deltaRateByReason"],
      }
    );
  }

  if (
    evidence.status === "ok" &&
    evidence.operationalEvidence?.status === "insufficient_sample" &&
    evidence.qualityImprovementClaimed !== false
  ) {
    errors.push(
      "QALIVE-03: root status ok requires qualityImprovementClaimed: false when operational sample insufficient"
    );
  }
}

function validateRequirements(requirements, errors, label = "evidence") {
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
}

export function validateEvidenceShape(evidence, errors, label = "evidence") {
  if (!isPlainObject(evidence)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }

  if (evidence.schemaVersion !== 1) {
    errors.push(`${label}.schemaVersion must be 1`);
  }

  if (evidence.milestoneVersion !== "v12.6") {
    errors.push(`${label}.milestoneVersion must be "v12.6"`);
  }

  if (!VALID_ROOT_STATUSES.includes(evidence.status)) {
    errors.push(`${label}.status must be one of: ${VALID_ROOT_STATUSES.join(", ")}`);
  }

  if (typeof evidence.qualityImprovementClaimed !== "boolean") {
    errors.push(`${label}.qualityImprovementClaimed must be a boolean`);
  }

  for (const section of REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!(section in evidence)) {
      errors.push(`${label}.${section} is required`);
    }
  }

  validateRootBlendedFields(evidence, errors, label);
  validateRequirements(evidence.requirements, errors, label);

  if (!isPlainObject(evidence.automated)) {
    errors.push(`${label}.automated must be an object`);
  }

  if (!Array.isArray(evidence.acceptedCaveats)) {
    errors.push(`${label}.acceptedCaveats must be an array`);
  }
}

function writeBaseline(evidence) {
  const technical = evidence.technicalRegression ?? {};
  const operational = evidence.operationalEvidence ?? {};

  const lines = [
    "# Phase 137 Operational Quality Release Gate Baseline",
    "",
    `Generated at ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}.`,
    "",
    "**Dual-status separation (QALIVE-02):** technical regression and operational live evidence are independent top-level sections.",
    "",
    "## Technical vs Operational Status",
    "",
    "| Block | status | evidenceSource | Role |",
    "|---|---|---|---|",
    `| technicalRegression | ${technical.status ?? "—"} | ${technical.evidenceSource ?? "—"} | v12.3/v12.4 regression — independent pass/fail |`,
    `| operationalEvidence | ${operational.status ?? "—"} | ${operational.evidenceSource ?? "—"} | Live human corpus gates — may be insufficient_sample |`,
    "",
    "## Technical Regression Metrics",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| gateMatrixPass | ${technical.gateMatrixPass ?? "—"} |`,
    `| v12_3FactualFidelityRate | ${technical.v12_3FactualFidelityRate ?? "—"} |`,
    `| safetyGuardPassRate | ${technical.safetyGuardPassRate ?? "—"} |`,
    "",
    "## Operational Evidence",
    "",
    `| evaluatedItemCount | ${operational.evaluatedItemCount ?? 0} |`,
    `| qualityImprovementClaimed | ${evidence.qualityImprovementClaimed ?? false} |`,
    `| nextOperatorAction | ${operational.sampleCoverage?.nextOperatorAction ?? "—"} |`,
    "",
  ];

  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(baselinePath, `${lines.join("\n")}\n`);
}

function writeVerification(evidence, errors) {
  const status = errors.length === 0 ? "passed" : "failed";
  const technical = evidence.technicalRegression ?? {};
  const operational = evidence.operationalEvidence ?? {};

  const lines = [
    "---",
    "phase: 137-operational-quality-release-gate",
    `verified: ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}`,
    `status: ${status}`,
    "requirements: [QALIVE-01, QALIVE-02, QALIVE-03, QALIVE-04]",
    "---",
    "",
    "# Phase 137: Operational Quality Release Gate Verification",
    "",
    `**Status:** ${status}`,
    "",
    "## Requirement Rows",
    "",
    "| ID | Description | Result |",
    "|---|---|---|",
    "| QALIVE-01 | Release gate reruns live evidence CLIs | pending (orchestrator — Plan 137-02) |",
    "| QALIVE-02 | Technical regression independent of operational status | pass when checker green |",
    "| QALIVE-03 | Quality improvement claims blocked when sample insufficient | pass when checker green |",
    "| QALIVE-04 | Milestone audit with commands and operator action | pending (Plan 137-04) |",
    "",
    "## Dual Status (QALIVE-02)",
    "",
    "| Section | status | evaluatedItemCount |",
    "|---|---|---:|",
    `| technicalRegression | ${technical.status ?? "—"} | — |`,
    `| operationalEvidence | ${operational.status ?? "—"} | ${operational.evaluatedItemCount ?? 0} |`,
    "",
    "## Commands",
    "",
    "```bash",
    "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests",
    "cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts",
    "cd app && npm run operational-quality-release-evidence",
    "```",
    "",
  ];

  if (errors.length > 0) {
    lines.push("## Errors", "", ...errors.map((error) => `- ${error}`), "");
  }

  writeFileSync(verificationPath, `${lines.join("\n")}\n`);
}

function updateRequirementRows(evidence) {
  if (!Array.isArray(evidence.requirements)) {
    return;
  }

  const checkerCmd = "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests";
  for (const row of evidence.requirements) {
    if (!isPlainObject(row)) {
      continue;
    }
    if (row.id === "QALIVE-02" || row.id === "QALIVE-03") {
      row.result = "pass";
      row.automated = checkerCmd;
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
  assertQalive02(evidence, errors);
  assertQalive03(evidence, errors);

  if (errors.length > 0) {
    writeVerification(evidence, errors);
    fail(errors);
    return;
  }

  updateRequirementRows(evidence);
  writeBaseline(evidence);
  writeVerification(evidence, errors);

  if (evidencePath !== defaultEvidencePath) {
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  console.log("Operational quality release evidence check passed.");
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
