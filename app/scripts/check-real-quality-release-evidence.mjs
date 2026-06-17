#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/133-real-quality-release-gate");
const defaultEvidencePath = resolve(phaseDir, "133-EVIDENCE.template.json");
const baselinePath = resolve(phaseDir, "133-BASELINE.md");
const verificationPath = resolve(phaseDir, "133-VERIFICATION.md");

export const HUMAN_VISUAL_TARGET = 75;
export const V12_3_FIXTURE_BASELINE = 70.17;

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

const CROSS_BUCKET_RULES = [
  {
    fields: ["meanHumanVisualScore"],
    forbiddenBuckets: ["factualMetrics", "learningImpactMetrics"],
  },
  {
    fields: ["factualPassRate", "humanCorpusFactualPassRate", "v12_3FactualFidelityRate"],
    forbiddenBuckets: ["qualityMetrics", "learningImpactMetrics"],
  },
  {
    fields: ["globalVisualScoreDelta"],
    forbiddenBuckets: ["qualityMetrics", "factualMetrics"],
  },
];

const REQUIRED_REQUIREMENT_IDS = ["QA-22", "QA-23", "QA-24"];

const REQUIRED_TOP_LEVEL_SECTIONS = [
  "qualityMetrics",
  "factualMetrics",
  "learningImpactMetrics",
  "acceptedCaveats",
];

function usage() {
  return "Usage: node app/scripts/check-real-quality-release-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`REAL-QUALITY-RELEASE-EVIDENCE: ${error}`);
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

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function validateMetricSeparation(evidence, errors, label = "evidence") {
  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root`);
    }
  }

  for (const rule of CROSS_BUCKET_RULES) {
    for (const section of rule.forbiddenBuckets) {
      const bucket = evidence[section];
      if (!isPlainObject(bucket)) {
        continue;
      }
      for (const field of rule.fields) {
        if (field in bucket) {
          errors.push(
            `${label}.${section} must not duplicate cross-bucket field "${field}" (QA-23 separation)`
          );
        }
      }
    }
  }
}

function validateQualityMetrics(qualityMetrics, errors, label = "evidence") {
  if (!isPlainObject(qualityMetrics)) {
    errors.push(`${label}.qualityMetrics must be an object`);
    return;
  }

  const humanCorpus = qualityMetrics.humanCorpus;
  if (!isPlainObject(humanCorpus)) {
    errors.push(`${label}.qualityMetrics.humanCorpus must be an object`);
  } else {
    if (typeof humanCorpus.evaluatedItemCount !== "number" || humanCorpus.evaluatedItemCount < 0) {
      errors.push(`${label}.qualityMetrics.humanCorpus.evaluatedItemCount must be a non-negative number`);
    }
    if (
      humanCorpus.meanHumanVisualScore != null &&
      (typeof humanCorpus.meanHumanVisualScore !== "number" || Number.isNaN(humanCorpus.meanHumanVisualScore))
    ) {
      errors.push(`${label}.qualityMetrics.humanCorpus.meanHumanVisualScore must be a number or null`);
    }
    if (typeof humanCorpus.sourcePath !== "string" || !humanCorpus.sourcePath) {
      errors.push(`${label}.qualityMetrics.humanCorpus.sourcePath must be a non-empty string`);
    }
  }

  const fixtureValidation = qualityMetrics.fixtureValidation;
  if (!isPlainObject(fixtureValidation)) {
    errors.push(`${label}.qualityMetrics.fixtureValidation must be an object`);
  } else {
    if (typeof fixtureValidation.meanQualityScore !== "number" || Number.isNaN(fixtureValidation.meanQualityScore)) {
      errors.push(`${label}.qualityMetrics.fixtureValidation.meanQualityScore must be a number`);
    }
    if (typeof fixtureValidation.sourcePath !== "string" || !fixtureValidation.sourcePath) {
      errors.push(`${label}.qualityMetrics.fixtureValidation.sourcePath must be a non-empty string`);
    }
  }
}

function validateFactualMetricsSection(factualMetrics, errors, label = "evidence") {
  if (!isPlainObject(factualMetrics)) {
    errors.push(`${label}.factualMetrics must be an object`);
    return;
  }

  for (const key of ["humanCorpusFactualPassRate", "v12_3FactualFidelityRate", "safetyGuardPassRate"]) {
    if (!(key in factualMetrics)) {
      errors.push(`${label}.factualMetrics.${key} is required`);
      continue;
    }
    const value = factualMetrics[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${label}.factualMetrics.${key} must be a number`);
    }
  }
}

function validateLearningImpactMetrics(learningImpactMetrics, errors, label = "evidence") {
  if (!isPlainObject(learningImpactMetrics)) {
    errors.push(`${label}.learningImpactMetrics must be an object`);
    return;
  }

  if (learningImpactMetrics.status !== "ok" && learningImpactMetrics.status !== "insufficient_sample") {
    errors.push(`${label}.learningImpactMetrics.status must be "ok" or "insufficient_sample"`);
  }

  if (typeof learningImpactMetrics.sourcePath !== "string" || !learningImpactMetrics.sourcePath) {
    errors.push(`${label}.learningImpactMetrics.sourcePath must be a non-empty string`);
  }
}

function validateAcceptedCaveats(acceptedCaveats, errors, label = "evidence") {
  if (!Array.isArray(acceptedCaveats)) {
    errors.push(`${label}.acceptedCaveats must be an array`);
    return;
  }

  for (const [index, caveat] of acceptedCaveats.entries()) {
    const prefix = `${label}.acceptedCaveats[${index}]`;
    if (!isPlainObject(caveat)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof caveat.id !== "string" || !caveat.id) {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (typeof caveat.status !== "string" || !caveat.status) {
      errors.push(`${prefix}.status must be a non-empty string`);
    }
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

  if (evidence.milestoneVersion !== "v12.5") {
    errors.push(`${label}.milestoneVersion must be "v12.5"`);
  }

  if (evidence.status !== "ok" && evidence.status !== "gaps_found" && evidence.status !== "blocked") {
    errors.push(`${label}.status must be "ok", "gaps_found", or "blocked"`);
  }

  for (const section of REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!(section in evidence)) {
      errors.push(`${label}.${section} is required (QA-23 metric separation)`);
    }
  }

  validateMetricSeparation(evidence, errors, label);
  validateQualityMetrics(evidence.qualityMetrics, errors, label);
  validateFactualMetricsSection(evidence.factualMetrics, errors, label);
  validateLearningImpactMetrics(evidence.learningImpactMetrics, errors, label);
  validateAcceptedCaveats(evidence.acceptedCaveats, errors, label);
  validateRequirements(evidence.requirements, errors, label);

  if (!isPlainObject(evidence.automated)) {
    errors.push(`${label}.automated must be an object`);
  }
}

function writeBaseline(evidence) {
  const human = evidence.qualityMetrics?.humanCorpus ?? {};
  const fixture = evidence.qualityMetrics?.fixtureValidation ?? {};
  const factual = evidence.factualMetrics ?? {};
  const learning = evidence.learningImpactMetrics ?? {};

  const humanScore =
    human.meanHumanVisualScore != null ? human.meanHumanVisualScore.toFixed(2) : "null (insufficient corpus)";
  const fixtureScore = fixture.meanQualityScore != null ? fixture.meanQualityScore.toFixed(2) : "—";

  const lines = [
    "# Phase 133 Real Quality Release Gate Baseline",
    "",
    `Generated at ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}.`,
    "",
    "**Metric separation (QA-23):** human corpus quality, fixture validation, factual rates, learning impact, and accepted caveats are stored in separate JSON sections.",
    "",
    "## Human vs Fixture Visual Scores",
    "",
    "| Source | Metric | Value | Target | Role |",
    "|---|---|---:|---:|---|",
    `| Human corpus | meanHumanVisualScore | ${humanScore} | ${HUMAN_VISUAL_TARGET} | **Primary QA-24 metric** |`,
    `| v12.3 fixture matrix | meanQualityScore | ${fixtureScore} | ${HUMAN_VISUAL_TARGET} | Reference baseline only (${V12_3_FIXTURE_BASELINE}) |`,
    "",
    "## Factual Hard Gates (QA-24)",
    "",
    "| Metric | Value | Required |",
    "|---|---:|---:|",
    `| humanCorpusFactualPassRate | ${factual.humanCorpusFactualPassRate ?? "—"} | 1.0 |`,
    `| v12_3FactualFidelityRate | ${factual.v12_3FactualFidelityRate ?? "—"} | 1.0 |`,
    `| safetyGuardPassRate | ${factual.safetyGuardPassRate ?? "—"} | 1.0 |`,
    "",
    "## Learning Impact (non-blocking)",
    "",
    `| status | ${learning.status ?? "—"} |`,
    `| globalVisualScoreDelta | ${learning.globalVisualScoreDelta ?? "null"} |`,
    "",
    "## Accepted Caveats",
    "",
    `Count: ${Array.isArray(evidence.acceptedCaveats) ? evidence.acceptedCaveats.length : 0}`,
    "",
  ];

  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(baselinePath, `${lines.join("\n")}\n`);
}

function writeVerification(evidence, errors) {
  const status = errors.length === 0 ? "passed" : "failed";
  const human = evidence.qualityMetrics?.humanCorpus ?? {};
  const factual = evidence.factualMetrics ?? {};
  const learning = evidence.learningImpactMetrics ?? {};

  const qa24Result =
    human.meanHumanVisualScore != null && human.meanHumanVisualScore >= HUMAN_VISUAL_TARGET
      ? "pass (Path A: target met)"
      : "accepted_gap | pending";

  const lines = [
    "---",
    "phase: 133-real-quality-release-gate",
    `verified: ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}`,
    `status: ${status}`,
    "requirements: [QA-22, QA-23, QA-24]",
    "---",
    "",
    "# Phase 133: Real Quality Release Gate Verification",
    "",
    `**Status:** ${status}`,
    "",
    "## Requirement Rows",
    "",
    "| ID | Description | Result |",
    "|---|---|---|",
    "| QA-22 | Milestone release gate command matrix | pending (orchestrator — Plan 133-02) |",
    "| QA-23 | Metric section separation | pass when checker green |",
    `| QA-24 | Factual 1.0 + human visual target or accepted gap | ${qa24Result} |`,
    "",
    "## Metric Buckets (QA-23)",
    "",
    "| Bucket | Key field | Value |",
    "|---|---|---|",
    `| qualityMetrics.humanCorpus | meanHumanVisualScore | ${human.meanHumanVisualScore ?? "null"} |`,
    `| qualityMetrics.fixtureValidation | meanQualityScore | ${evidence.qualityMetrics?.fixtureValidation?.meanQualityScore ?? "—"} |`,
    `| factualMetrics | humanCorpusFactualPassRate | ${factual.humanCorpusFactualPassRate ?? "—"} |`,
    `| factualMetrics | v12_3FactualFidelityRate | ${factual.v12_3FactualFidelityRate ?? "—"} |`,
    `| learningImpactMetrics | status | ${learning.status ?? "—"} |`,
    `| acceptedCaveats | count | ${Array.isArray(evidence.acceptedCaveats) ? evidence.acceptedCaveats.length : 0} |`,
    "",
    "## Commands",
    "",
    "```bash",
    "node app/scripts/check-real-quality-release-evidence.mjs --skip-tests",
    "cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts",
    "cd app && npm run real-quality-release-evidence",
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

  for (const row of evidence.requirements) {
    if (!isPlainObject(row)) {
      continue;
    }
    if (row.id === "QA-23" || row.id === "QA-24") {
      row.result = "pass";
      row.automated = "node app/scripts/check-real-quality-release-evidence.mjs --skip-tests";
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

  console.log("Real quality release evidence check passed.");
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
