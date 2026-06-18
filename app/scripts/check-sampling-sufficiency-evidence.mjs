#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_SOURCE,
  isPlainObject,
  validateEvidenceSourceTag,
  validateSampleGuidanceEntry,
} from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/135-sampling-sufficiency-and-evidence-honesty");
const defaultEvidencePath = resolve(phaseDir, "135-EVIDENCE.template.json");

const SAMPLING_UNIT_TESTS = ["tests/unit/human-quality/sampling/evidence-honesty.test.ts"];

export const REQUIRED_REQUIREMENT_IDS = ["SAMPLE-01", "SAMPLE-02", "SAMPLE-03", "SAMPLE-04"];

const GATE_KEYS = ["calibration", "impact", "qualityImprovement", "technicalRegression"];

function usage() {
  return "Usage: node app/scripts/check-sampling-sufficiency-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`SAMPLING-SUFFICIENCY-EVIDENCE: ${error}`);
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

function validateGate(gate, gateKey, errors, label) {
  const prefix = `${label}.gates.${gateKey}`;
  if (!isPlainObject(gate)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  if (
    gate.status !== "ok" &&
    gate.status !== "insufficient_sample" &&
    gate.status !== "insufficient_corpus"
  ) {
    errors.push(`${prefix}.status must be ok, insufficient_sample, or insufficient_corpus`);
  }

  const expectedSource =
    gateKey === "technicalRegression"
      ? EVIDENCE_SOURCE.TECHNICAL_REGRESSION
      : gateKey === "qualityImprovement" && isPlainObject(gate.fixtureMetrics)
        ? null
        : EVIDENCE_SOURCE.LIVE_HUMAN;

  if (expectedSource) {
    validateEvidenceSourceTag(gate, expectedSource, prefix, errors);
  }

  if (
    gate.status === "insufficient_sample" ||
    gate.status === "insufficient_corpus"
  ) {
    if (!Array.isArray(gate.sampleGuidance) || gate.sampleGuidance.length === 0) {
      errors.push(`${prefix}.sampleGuidance must be a non-empty array when status is insufficient`);
    } else {
      for (const [index, entry] of gate.sampleGuidance.entries()) {
        validateSampleGuidanceEntry(entry, `${prefix}.sampleGuidance[${index}]`, errors);
      }
    }
  }

  if (gateKey === "qualityImprovement" && isPlainObject(gate.fixtureMetrics)) {
    validateEvidenceSourceTag(
      gate.fixtureMetrics,
      EVIDENCE_SOURCE.FIXTURE,
      `${prefix}.fixtureMetrics`,
      errors
    );
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

  if (!isPlainObject(evidence.gates)) {
    errors.push(`${label}.gates must be an object`);
    return;
  }

  for (const gateKey of GATE_KEYS) {
    if (!(gateKey in evidence.gates)) {
      errors.push(`${label}.gates.${gateKey} is required`);
      continue;
    }
    validateGate(evidence.gates[gateKey], gateKey, errors, label);
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
      runVitest(SAMPLING_UNIT_TESTS);
    } catch {
      errors.push("sampling evidence honesty unit test suite failed");
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Sampling sufficiency evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
