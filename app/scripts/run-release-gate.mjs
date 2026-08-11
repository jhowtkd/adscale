#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const phaseDir = resolve(repoRoot, ".planning/phases/114-visual-regression-and-release-gate");
const evidencePath = resolve(phaseDir, "114-EVIDENCE.json");

function run(command, args, label) {
  console.log(`\n==> ${label}`);
  execFileSync(command, args, { cwd: appDir, stdio: "inherit", env: process.env });
}

function writeAutomatedStep(step, result) {
  mkdirSync(phaseDir, { recursive: true });
  const evidence = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : { schemaVersion: 1, capturedAt: new Date().toISOString(), automated: {} };
  evidence.automated = { ...(evidence.automated ?? {}), [step]: result };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

export function resetReleaseGateEvidence(evidence = {}, capturedAt = new Date().toISOString()) {
  const reset = {
    ...evidence,
    schemaVersion: 1,
    capturedAt,
    layoutChecks: [],
    a11yChecks: [],
    interactionChecks: [],
    automated: {
      ...(evidence.automated ?? {}),
      unit: "pending",
      lint: "pending",
      build: "pending",
      "visual-release": "pending",
    },
    requirements: {
      ...(evidence.requirements ?? {}),
      "RESP-07": { result: "pending" },
      "QA-15": { result: "pending" },
      "QA-16": { result: "pending" },
      "QA-17": {
        result: "pending",
        a11y: "pending",
        interaction: "pending",
        manualAssistiveTechnology: "pending",
        manualZoom200: "pending",
        manualDegradedStates: "pending",
        expectedA11yChecks: 65,
        completedA11yChecks: 0,
        expectedInteractionChecks: 5,
        completedInteractionChecks: 0,
      },
    },
  };
  delete reset.verifiedAt;
  return reset;
}

export function attestQa17(evidence, note, verifiedAt = new Date().toISOString()) {
  if (!note?.trim()) throw new Error("Manual QA-17 evidence is required");
  const qa17 = evidence.requirements?.["QA-17"];
  if (qa17?.a11y !== "pass" || qa17?.interaction !== "pass") {
    throw new Error("QA-17 automated evidence must pass before manual attestation");
  }
  return {
    ...evidence,
    verifiedAt,
    requirements: {
      ...evidence.requirements,
      "QA-17": {
        ...qa17,
        result: "pass",
        manualAssistiveTechnology: "pass",
        manualZoom200: "pass",
        manualDegradedStates: "pass",
        manualEvidence: note.trim(),
      },
    },
  };
}

function markQa17Pending() {
  mkdirSync(phaseDir, { recursive: true });
  const current = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : {};
  const evidence = resetReleaseGateEvidence(current);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

const steps = [
  ["node", ["scripts/check-visual-contract.mjs"], "visual-contract"],
  ["npm", ["test"], "unit"],
  ["npm", ["run", "lint"], "lint"],
  ["npm", ["run", "build"], "build"],
  ["npx", ["playwright", "test", "--config", "playwright.release.config.ts"], "visual-release"],
];

// Phase-0 convergence gates run BEFORE the release-gate evidence check
// so a freeze violation fails the release, not just CI.
const convergenceSteps = [
  ["node", ["scripts/run-convergence-gate.mjs"], "convergence-gate"],
];

function main() {
  const noteIndex = process.argv.indexOf("--manual-qa17-note");
  const manualQa17Note = noteIndex >= 0 ? process.argv[noteIndex + 1] : null;
  try {
    markQa17Pending();

    for (const [command, args, step] of convergenceSteps) {
      run(command, args, step);
    }

    for (const [command, args, step] of steps) {
      run(command, args, step);
      writeAutomatedStep(step, "pass");
    }

    execFileSync("node", ["scripts/check-release-gate.mjs", "--preflight"], { cwd: appDir, stdio: "inherit" });

    if (noteIndex >= 0) {
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      const attested = attestQa17(evidence, manualQa17Note);
      writeFileSync(evidencePath, `${JSON.stringify(attested, null, 2)}\n`);
    }

    execFileSync("node", ["scripts/check-release-gate.mjs"], { cwd: appDir, stdio: "inherit" });
    console.log("\nRelease gate passed.");
  } catch {
    console.error("\nRelease gate failed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
