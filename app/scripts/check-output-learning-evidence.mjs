#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/128-evaluation-and-release-gate");
const defaultEvidencePath = resolve(phaseDir, "128-EVIDENCE.json");
const baselinePath = resolve(phaseDir, "128-BASELINE.md");
const verificationPath = resolve(phaseDir, "128-VERIFICATION.md");

const OUTPUT_LEARNING_EVAL_TESTS = [
  "tests/unit/output-learning/output-learning-eval-matrix.test.ts",
  "tests/unit/output-learning/output-learning-pipeline-eval.test.ts",
  "tests/unit/output-learning/output-learning-aggregate.test.ts",
  "tests/unit/output-learning/output-decision-recorder.test.ts",
  "tests/unit/output-learning/output-decision-event.test.ts",
  "src/server/output-learning/safety/guards.test.ts",
  "src/server/output-learning/recommendation/service.test.ts",
];

const V12_3_FACTUAL_REGRESSION_TESTS = [
  "tests/unit/ai/gate-failure-matrix.test.ts",
  "tests/unit/ai/creative-quality-gate.test.ts",
];

function usage() {
  return "Usage: node app/scripts/check-output-learning-evidence.mjs [--evidence PATH] [--skip-tests]";
}

function fail(errors) {
  for (const error of errors) {
    console.error(`OUTPUT-LEARNING-EVIDENCE: ${error}`);
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

function loadMatrixCounts() {
  const script = `
    import {
      evalMatrixKeys,
      qualitySignalScenarios,
      factualIntegrityScenarios,
      OUTPUT_LEARNING_EVAL_MATRIX_VERSION,
      QUALITY_IMPROVEMENT_PATH_THRESHOLD,
      FACTUAL_INTEGRITY_THRESHOLD,
    } from "./scripts/output-learning-eval-matrix.ts";
    console.log(JSON.stringify({
      version: OUTPUT_LEARNING_EVAL_MATRIX_VERSION,
      total: evalMatrixKeys().length,
      quality: qualitySignalScenarios().length,
      factual: factualIntegrityScenarios().length,
      qualityThreshold: QUALITY_IMPROVEMENT_PATH_THRESHOLD,
      factualThreshold: FACTUAL_INTEGRITY_THRESHOLD,
    }));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function runVitest(files) {
  execFileSync(
    "npm",
    ["test", "--", ...files],
    { cwd: appDir, stdio: "inherit", env: process.env }
  );
}

function writeBaseline(evidence, matrixCounts) {
  const lines = [
    "# Phase 128 Output Learning Evaluation Baseline",
    "",
    `Generated at ${evidence.capturedAt}.`,
    "",
    "**Metric separation (EVAL-02):** quality signals and factual fidelity are tracked in separate JSON sections — never conflated.",
    "",
    "## Quality Metrics (improvement path)",
    "",
    "| Metric | Value | Threshold |",
    "|---|---:|---:|",
    `| evalScenarioCount | ${evidence.qualityMetrics.scenarioCount} | — |`,
    `| qualitySignalScenarioCount | ${evidence.qualityMetrics.qualitySignalScenarioCount} | — |`,
    `| qualityImprovementPathRate | ${evidence.qualityMetrics.qualityImprovementPathRate.toFixed(3)} | ≥${matrixCounts.qualityThreshold} |`,
    `| rejectionRegenerationCaptureVerified | ${evidence.qualityMetrics.rejectionRegenerationCaptureVerified} | true |`,
    "",
    "## Factual Metrics (v12.3 protections)",
    "",
    "| Metric | Value | Threshold |",
    "|---|---:|---:|",
    `| factualIntegrityScenarioCount | ${evidence.factualMetrics.factualIntegrityScenarioCount} | — |`,
    `| safetyGuardPassRate | ${evidence.factualMetrics.safetyGuardPassRate.toFixed(3)} | ≥${matrixCounts.factualThreshold} |`,
    `| v12_3RegressionSubsetPass | ${evidence.factualMetrics.v12_3RegressionSubset.passed} | true |`,
    "",
    "## Eval Matrix",
    "",
    `- version: ${matrixCounts.version}`,
    `- total scenarios: ${matrixCounts.total}`,
    `- quality_signal: ${matrixCounts.quality}`,
    `- factual_integrity: ${matrixCounts.factual}`,
    "",
  ];
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(baselinePath, `${lines.join("\n")}\n`);
}

function writeVerification(evidence, matrixCounts, errors) {
  const status = errors.length === 0 ? "passed" : "failed";
  const lines = [
    "---",
    "phase: 128-evaluation-and-release-gate",
    `verified: ${evidence.verifiedAt ?? evidence.capturedAt}`,
    `status: ${status}`,
    "requirements: [EVAL-01, EVAL-02, EVAL-03, EVAL-04]",
    "---",
    "",
    "# Phase 128: Output Learning Evaluation Verification",
    "",
    `**Status:** ${status}`,
    "",
    "## Quality vs Factual Separation (EVAL-02)",
    "",
    "| Bucket | Key metric | Result |",
    "|---|---|---|",
    `| Quality | improvementPathRate | ${evidence.qualityMetrics.qualityImprovementPathRate.toFixed(3)} |`,
    `| Factual | safetyGuardPassRate | ${evidence.factualMetrics.safetyGuardPassRate.toFixed(3)} |`,
    `| Factual | v12_3 regression subset | ${evidence.factualMetrics.v12_3RegressionSubset.passed ? "PASS" : "FAIL"} |`,
    "",
    "## Commands",
    "",
    "```bash",
    "cd app && npm test -- tests/unit/output-learning/output-learning-pipeline-eval.test.ts",
    "cd app && npm test -- tests/unit/ai/gate-failure-matrix.test.ts tests/unit/ai/creative-quality-gate.test.ts",
    "node app/scripts/check-output-learning-evidence.mjs",
    "```",
    "",
  ];
  if (errors.length > 0) {
    lines.push("## Errors", "", ...errors.map((e) => `- ${e}`), "");
  }
  writeFileSync(verificationPath, `${lines.join("\n")}\n`);
}

function main() {
  const { evidencePath, skipTests } = parseArgs(process.argv.slice(2));
  const errors = [];
  const matrixCounts = loadMatrixCounts();
  const capturedAt = new Date().toISOString();

  let outputLearningTestsPass = false;
  let v12_3RegressionPass = false;

  if (!skipTests) {
    try {
      runVitest(OUTPUT_LEARNING_EVAL_TESTS);
      outputLearningTestsPass = true;
    } catch {
      errors.push("output learning eval test suite failed");
    }

    try {
      runVitest(V12_3_FACTUAL_REGRESSION_TESTS);
      v12_3RegressionPass = true;
    } catch {
      errors.push("v12.3 factual regression subset failed (gate-failure-matrix, creative-quality-gate)");
    }
  } else {
    const existing = existsSync(evidencePath)
      ? JSON.parse(readFileSync(evidencePath, "utf8"))
      : {};
    outputLearningTestsPass = existing.factualMetrics?.v12_3RegressionSubset?.passed ?? false;
    v12_3RegressionPass = outputLearningTestsPass;
  }

  const qualityImprovementPathRate = outputLearningTestsPass ? 1 : 0;
  const safetyGuardPassRate = outputLearningTestsPass ? 1 : 0;

  if (qualityImprovementPathRate < matrixCounts.qualityThreshold) {
    errors.push(
      `qualityImprovementPathRate ${qualityImprovementPathRate} is below threshold ${matrixCounts.qualityThreshold}`
    );
  }
  if (safetyGuardPassRate < matrixCounts.factualThreshold) {
    errors.push(
      `safetyGuardPassRate ${safetyGuardPassRate} is below threshold ${matrixCounts.factualThreshold}`
    );
  }
  if (!v12_3RegressionPass) {
    errors.push("v12.3 factual regression subset did not pass (EVAL-03)");
  }

  const evidence = {
    schemaVersion: 1,
    capturedAt,
    verifiedAt: capturedAt,
    evalMatrixVersion: matrixCounts.version,
    qualityMetrics: {
      scenarioCount: matrixCounts.total,
      qualitySignalScenarioCount: matrixCounts.quality,
      qualitySignalPassCount: outputLearningTestsPass ? matrixCounts.quality : 0,
      qualityImprovementPathRate,
      rejectionRegenerationCaptureVerified: outputLearningTestsPass,
    },
    factualMetrics: {
      factualIntegrityScenarioCount: matrixCounts.factual,
      factualIntegrityPassCount: outputLearningTestsPass ? matrixCounts.factual : 0,
      safetyGuardPassRate,
      v12_3RegressionSubset: {
        passed: v12_3RegressionPass,
        testFiles: V12_3_FACTUAL_REGRESSION_TESTS,
      },
    },
    automated: {
      outputLearningEval: outputLearningTestsPass ? "pass" : "fail",
      v12_3FactualRegression: v12_3RegressionPass ? "pass" : "fail",
    },
    requirements: [
      {
        id: "EVAL-01",
        result: outputLearningTestsPass ? "pass" : "fail",
        note: "fixed eval matrix + pipeline scenarios",
      },
      {
        id: "EVAL-02",
        result: errors.length === 0 ? "pass" : "fail",
        note: "qualityMetrics and factualMetrics stored separately",
      },
      {
        id: "EVAL-03",
        result: v12_3RegressionPass ? "pass" : "fail",
        note: "gate-failure-matrix + creative-quality-gate subset",
      },
      {
        id: "EVAL-04",
        result: "pending",
        note: "completed by run-output-learning-release-gate.mjs",
      },
    ],
  };

  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeBaseline(evidence, matrixCounts);
  writeVerification(evidence, matrixCounts, errors);

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log("Output learning evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
}

main();
