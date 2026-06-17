#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const phaseDir = resolve(repoRoot, ".planning/phases/128-evaluation-and-release-gate");
const evidencePath = resolve(phaseDir, "128-EVIDENCE.json");

const FOCUSED_OUTPUT_LEARNING_TESTS = [
  "tests/unit/output-learning/output-learning-eval-matrix.test.ts",
  "tests/unit/output-learning/output-learning-pipeline-eval.test.ts",
];

const V12_3_FACTUAL_REGRESSION_TESTS = [
  "tests/unit/ai/gate-failure-matrix.test.ts",
  "tests/unit/ai/creative-quality-gate.test.ts",
];

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
  ["npm", ["test", "--", ...FOCUSED_OUTPUT_LEARNING_TESTS], "output-learning-eval"],
  ["npm", ["test", "--", ...V12_3_FACTUAL_REGRESSION_TESTS], "v12_3-factual-regression"],
  ["npm", ["test"], "unit"],
  ["npm", ["run", "lint"], "lint"],
  ["npm", ["run", "build"], "build"],
];

try {
  for (const [command, args, step] of steps) {
    run(command, args, step);
    writeAutomatedStep(step, "pass");
  }

  execFileSync("node", ["scripts/check-output-learning-evidence.mjs"], {
    cwd: appDir,
    stdio: "inherit",
  });
  writeAutomatedStep("output-learning-evidence", "pass");

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const evidenceCmd = "node app/scripts/check-output-learning-evidence.mjs";
  const releaseCmd = "cd app && npm run output-learning-release-gate";
  evidence.requirements = [
    {
      id: "EVAL-01",
      result: "pass",
      automated: evidenceCmd,
      note: "fixed eval matrix + pipeline scenarios",
    },
    {
      id: "EVAL-02",
      result: "pass",
      automated: evidenceCmd,
      note: "qualityMetrics vs factualMetrics separation",
      qualityImprovementPathRate: evidence.qualityMetrics?.qualityImprovementPathRate,
      safetyGuardPassRate: evidence.factualMetrics?.safetyGuardPassRate,
    },
    {
      id: "EVAL-03",
      result: evidence.factualMetrics?.v12_3RegressionSubset?.passed ? "pass" : "fail",
      automated: "npm test -- gate-failure-matrix creative-quality-gate",
      note: "v12.3 factual hard-failure protections — no regression",
    },
    {
      id: "EVAL-04",
      result: "pass",
      automated: releaseCmd,
      note: "npm test + lint + build + output-learning evidence",
      unit: evidence.automated?.unit,
      lint: evidence.automated?.lint,
      build: evidence.automated?.build,
    },
  ];
  evidence.verifiedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log("\nOutput learning release gate passed.");
} catch (error) {
  writeAutomatedStep("output-learning-release-gate", "fail");
  console.error("\nOutput learning release gate failed.");
  process.exitCode = 1;
}
