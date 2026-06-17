#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const phaseDir = resolve(repoRoot, ".planning/phases/133-real-quality-release-gate");
const evidencePath = resolve(phaseDir, "133-EVIDENCE.json");
const templatePath = resolve(phaseDir, "133-EVIDENCE.template.json");
const qualityImprovementEvidencePath = resolve(
  repoRoot,
  ".planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.template.json"
);

const FOCUSED_CORPUS_EVAL_TESTS = [
  "tests/unit/human-quality/human-quality-corpus.test.ts",
  "tests/unit/human-quality/human-quality-service.test.ts",
  "tests/unit/human-quality/calibration/compare.test.ts",
  "tests/unit/human-quality/improvement/reevaluate.test.ts",
  "tests/unit/human-quality/impact/report.test.ts",
];

const CALIBRATION_UNIT_TESTS = [
  "tests/unit/human-quality/calibration/compare.test.ts",
  "tests/unit/human-quality/calibration/aggregate.test.ts",
  "tests/unit/human-quality/calibration/adjustments.test.ts",
  "tests/unit/human-quality/calibration/failure-bridge.test.ts",
  "tests/unit/human-quality/calibration-adjustments-repository.test.ts",
];

const IMPACT_UNIT_TESTS = [
  "tests/unit/human-quality/impact/enrich.test.ts",
  "tests/unit/human-quality/impact/aggregate.test.ts",
  "tests/unit/human-quality/impact/report.test.ts",
];

const QUALITY_IMPROVEMENT_TESTS = [
  "tests/unit/human-quality/improvement/reevaluate.test.ts",
  "tests/unit/human-quality/improvement/apply.test.ts",
  "tests/unit/human-quality/improvement/accept.test.ts",
  "tests/unit/ai/corpus-fixtures.test.ts",
];

const V12_3_FACTUAL_REGRESSION_TESTS = [
  "tests/unit/ai/gate-failure-matrix.test.ts",
  "tests/unit/ai/creative-quality-gate.test.ts",
];

const OUTPUT_LEARNING_EVAL_TESTS = [
  "tests/unit/output-learning/output-learning-eval-matrix.test.ts",
  "tests/unit/output-learning/output-learning-pipeline-eval.test.ts",
  "tests/unit/output-learning/output-learning-aggregate.test.ts",
  "tests/unit/output-learning/output-decision-recorder.test.ts",
  "tests/unit/output-learning/output-decision-event.test.ts",
  "src/server/output-learning/safety/guards.test.ts",
  "src/server/output-learning/recommendation/service.test.ts",
];

const dryRun = process.argv.includes("--dry-run");

function ensureEvidenceFile() {
  mkdirSync(phaseDir, { recursive: true });
  if (!existsSync(evidencePath) && existsSync(templatePath)) {
    copyFileSync(templatePath, evidencePath);
  }
}

function writeAutomatedStep(step, result) {
  mkdirSync(phaseDir, { recursive: true });
  const evidence = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : { schemaVersion: 1, capturedAt: new Date().toISOString(), automated: {} };
  evidence.automated = { ...(evidence.automated ?? {}), [step]: result };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function formatCommand(step) {
  if (step.type === "vitest") {
    return `npm test -- ${step.files.join(" ")}`;
  }
  if (step.type === "npm") {
    return `npm ${step.args.join(" ")}`;
  }
  return `node ${step.args.join(" ")}`;
}

function runStep(step) {
  console.log(`\n==> ${step.id}`);
  if (dryRun) {
    console.log(`[dry-run] ${formatCommand(step)}`);
    return;
  }

  if (step.type === "vitest") {
    execFileSync("npm", ["test", "--", ...step.files], {
      cwd: appDir,
      stdio: "inherit",
      env: process.env,
    });
    return;
  }

  if (step.type === "npm") {
    execFileSync("npm", step.args, {
      cwd: appDir,
      stdio: "inherit",
      env: process.env,
    });
    return;
  }

  execFileSync("node", step.args, {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
  });
}

const steps = [
  { id: "corpus-eval", type: "vitest", files: FOCUSED_CORPUS_EVAL_TESTS },
  { id: "score-calibration", type: "vitest", files: CALIBRATION_UNIT_TESTS },
  { id: "learning-impact", type: "vitest", files: IMPACT_UNIT_TESTS },
  { id: "quality-improvement", type: "vitest", files: QUALITY_IMPROVEMENT_TESTS },
  {
    id: "score-calibration-evidence",
    type: "node",
    args: ["scripts/check-score-calibration-evidence.mjs", "--skip-tests"],
  },
  {
    id: "learning-impact-evidence",
    type: "node",
    args: ["scripts/check-learning-impact-evidence.mjs", "--skip-tests"],
  },
  {
    id: "quality-improvement-evidence",
    type: "node",
    args: [
      "scripts/check-quality-improvement-evidence.mjs",
      "--evidence",
      qualityImprovementEvidencePath,
      "--skip-tests",
    ],
  },
  { id: "v12_3-factual", type: "vitest", files: V12_3_FACTUAL_REGRESSION_TESTS },
  { id: "v12_4-output-learning", type: "vitest", files: OUTPUT_LEARNING_EVAL_TESTS },
  {
    id: "output-learning-evidence",
    type: "node",
    args: ["scripts/check-output-learning-evidence.mjs", "--skip-tests"],
  },
  { id: "unit", type: "npm", args: ["test"] },
  { id: "lint", type: "npm", args: ["run", "lint"] },
  { id: "build", type: "npm", args: ["run", "build"] },
  {
    id: "real-quality-evidence",
    type: "node",
    args: [
      "scripts/check-real-quality-release-evidence.mjs",
      "--evidence",
      evidencePath,
      "--skip-tests",
    ],
  },
];

function finalizeEvidence() {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const releaseCmd = "cd app && npm run real-quality-release-gate";

  for (const row of evidence.requirements ?? []) {
    if (row.id === "QA-22") {
      row.result = "pass";
      row.automated = releaseCmd;
    }
  }

  evidence.verifiedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function main() {
  ensureEvidenceFile();

  if (dryRun) {
    console.log("Real quality release gate (dry-run)");
    for (const step of steps) {
      runStep(step);
    }
    console.log("\n[dry-run] All steps listed; no commands executed.");
    return;
  }

  let failedStep = null;

  try {
    for (const step of steps) {
      try {
        runStep(step);
        writeAutomatedStep(step.id, "pass");
      } catch {
        writeAutomatedStep(step.id, "fail");
        failedStep = step.id;
        throw new Error(`step failed: ${step.id}`);
      }
    }

    finalizeEvidence();
    console.log("\nReal quality release gate passed.");
  } catch {
    console.error(
      `\nReal quality release gate failed${failedStep ? ` at step: ${failedStep}` : ""}.`
    );
    process.exitCode = 1;
  }
}

main();
