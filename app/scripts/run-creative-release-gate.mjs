#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const phaseDir = resolve(repoRoot, ".planning/phases/123-visual-validation-gate");
const evidencePath = resolve(phaseDir, "123-EVIDENCE.json");

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

const steps = [
  ["npm", ["test"], "unit"],
  ["npm", ["run", "lint"], "lint"],
  ["npm", ["run", "build"], "build"],
];

try {
  for (const [command, args, step] of steps) {
    run(command, args, step);
    writeAutomatedStep(step, "pass");
  }

  execFileSync(
    "node",
    ["scripts/check-creative-validation-evidence.mjs", "--stage", "final"],
    { cwd: appDir, stdio: "inherit" }
  );
  writeAutomatedStep("creative-release-gate", "pass");

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const finalCmd = "node app/scripts/check-creative-validation-evidence.mjs --stage final";
  const releaseCmd = "cd app && node scripts/run-creative-release-gate.mjs";
  evidence.requirements = [
    {
      id: "QA-18",
      result: "pass",
      automated: finalCmd,
      note: "paired before/after matrix keys",
    },
    {
      id: "QA-19",
      result: "pass",
      automated: finalCmd,
      note: "aggregate thresholds enforced in CI",
    },
    {
      id: "QA-20",
      result: "pass",
      automated: finalCmd,
      note: "zero fidelity hard failures on after set",
    },
    {
      id: "QA-21",
      result: "pass",
      automated: releaseCmd,
      note: "npm test + lint + build + final evidence check",
      unit: evidence.automated?.unit,
      lint: evidence.automated?.lint,
      build: evidence.automated?.build,
    },
  ];
  evidence.verifiedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log("\nCreative release gate passed.");
} catch (error) {
  writeAutomatedStep("creative-release-gate", "fail");
  console.error("\nCreative release gate failed.");
  process.exitCode = 1;
}
