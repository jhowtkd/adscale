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

function markQa17Pending() {
  mkdirSync(phaseDir, { recursive: true });
  const evidence = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : { schemaVersion: 1, capturedAt: new Date().toISOString() };
  evidence.automated = {
    ...(evidence.automated ?? {}),
    unit: "pending",
    lint: "pending",
    build: "pending",
    "visual-release": "pending",
  };
  evidence.requirements = {
    ...(evidence.requirements ?? {}),
    "QA-17": {
      ...(evidence.requirements?.["QA-17"] ?? {}),
      result: "pending",
      a11y: "pending",
      interaction: "pending",
      manualAssistiveTechnology: evidence.requirements?.["QA-17"]?.manualAssistiveTechnology ?? "pending",
    },
  };
  delete evidence.verifiedAt;
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

  // QA-17 is promoted only by the evidence-producing Playwright hooks and
  // the strict checker; this runner must never manufacture a pass timestamp.
  execFileSync("node", ["scripts/check-release-gate.mjs"], { cwd: appDir, stdio: "inherit" });
  console.log("\nRelease gate passed.");
} catch (error) {
  markQa17Pending();
  console.error("\nRelease gate failed.");
  process.exitCode = 1;
}
