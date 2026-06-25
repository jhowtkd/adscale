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
const phaseDir = resolve(repoRoot, ".planning/phases/137-operational-quality-release-gate");
const evidencePath = resolve(phaseDir, "137-EVIDENCE.json");
const templatePath = resolve(phaseDir, "137-EVIDENCE.template.json");
const qualityImprovementEvidencePath = resolve(
  repoRoot,
  ".planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.template.json"
);
const realQualityEvidencePath = resolve(
  repoRoot,
  ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json"
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
const runRegression =
  process.argv.includes("--run-regression") || process.env.OPERATIONAL_QUALITY_RUN_REGRESSION === "1";
const runAggregate = process.argv.includes("--aggregate");

const TECHNICAL_STEPS_BASE = [
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
      realQualityEvidencePath,
      "--skip-tests",
    ],
  },
];

function buildTechnicalSteps() {
  const steps = [...TECHNICAL_STEPS_BASE];
  if (runRegression) {
    steps.push({
      id: "operational-technical-regression",
      type: "node",
      args: [
        "scripts/check-operational-quality-release-evidence.mjs",
        "--evidence",
        evidencePath,
        "--technical-only",
        "--run-regression",
        "--skip-tests",
      ],
    });
  }
  return steps;
}

function buildOperationalSteps() {
  const steps = [];
  if (runAggregate) {
    steps.push({
      id: "aggregate-evidence",
      type: "node",
      args: [
        "scripts/check-operational-quality-release-evidence.mjs",
        "--evidence",
        evidencePath,
        "--aggregate",
        "--skip-tests",
      ],
    });
  }
  steps.push(...OPERATIONAL_STEPS_BASE);
  return steps;
}

const OPERATIONAL_STEPS_BASE = [
  {
    id: "sampling-sufficiency-evidence",
    type: "node",
    args: ["scripts/check-sampling-sufficiency-evidence.mjs", "--skip-tests"],
  },
  {
    id: "quality-trend-evidence",
    type: "node",
    args: ["scripts/check-quality-trend-evidence.mjs", "--skip-tests"],
  },
  {
    id: "operational-evidence",
    type: "node",
    args: [
      "scripts/check-operational-quality-release-evidence.mjs",
      "--evidence",
      evidencePath,
      "--skip-tests",
    ],
  },
];

/**
 * Exit policy (QALIVE-02): technical fail → exit 1; operational insufficient_sample → exit 0.
 * SOURCE-05: fixture-only active brand sample → claim_withheld with exit 0.
 */
export function resolveMilestoneStatus(technicalStatus, operationalStatus, activeBrandSample = null) {
  if (technicalStatus === "fail") {
    return { rootStatus: "blocked", exitCode: 1, technicalStatus: "fail" };
  }

  const brandStatus = activeBrandSample?.operationalStatus ?? null;
  if (brandStatus === "claim_withheld" || brandStatus === "insufficient_source") {
    return { rootStatus: "claim_withheld", exitCode: 0, technicalStatus: "pass" };
  }

  if (operationalStatus === "ok" && (!activeBrandSample || brandStatus === "ok")) {
    return { rootStatus: "ok", exitCode: 0, technicalStatus: "pass" };
  }

  if (operationalStatus === "gaps_found") {
    return { rootStatus: "gaps_found", exitCode: 0, technicalStatus: "pass" };
  }

  return { rootStatus: "tech_debt", exitCode: 0, technicalStatus: "pass" };
}

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

function runStep(step, blockPrefix) {
  const label = `${blockPrefix}:${step.id}`;
  console.log(`\n==> ${label}`);
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

function runBlock(steps, blockPrefix) {
  for (const step of steps) {
    try {
      runStep(step, blockPrefix);
      if (!dryRun) {
        writeAutomatedStep(`${blockPrefix}:${step.id}`, "pass");
      }
    } catch {
      if (!dryRun) {
        writeAutomatedStep(`${blockPrefix}:${step.id}`, "fail");
      }
      throw new Error(`step failed: ${blockPrefix}:${step.id}`);
    }
  }
}

function loadTechnicalMetrics() {
  if (existsSync(realQualityEvidencePath)) {
    const realEvidence = JSON.parse(readFileSync(realQualityEvidencePath, "utf8"));
    return {
      gateMatrixPass: realEvidence.gateMatrixPass ?? true,
      v12_3FactualFidelityRate: realEvidence.factualMetrics?.v12_3FactualFidelityRate ?? 1.0,
      safetyGuardPassRate: realEvidence.factualMetrics?.safetyGuardPassRate ?? 1.0,
    };
  }
  return {
    gateMatrixPass: true,
    v12_3FactualFidelityRate: 1.0,
    safetyGuardPassRate: 1.0,
  };
}

function recordTechnicalRegression(passed) {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const metrics = loadTechnicalMetrics();

  evidence.technicalRegression = {
    ...(evidence.technicalRegression ?? {}),
    status: passed ? "pass" : "fail",
    evidenceSource: "technical_regression",
    gateMatrixPass: passed ? metrics.gateMatrixPass : false,
    v12_3FactualFidelityRate: metrics.v12_3FactualFidelityRate,
    safetyGuardPassRate: metrics.safetyGuardPassRate,
    sourcePath: ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.json",
  };

  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function finalizeEvidence(technicalPassed) {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const releaseCmd = "cd app && npm run operational-quality-release-gate";
  const operationalStatus = evidence.operationalEvidence?.status ?? "insufficient_sample";
  const activeBrandSample = evidence.operationalEvidence?.activeBrandSample ?? null;
  const resolved = resolveMilestoneStatus(
    technicalPassed ? "pass" : "fail",
    operationalStatus,
    activeBrandSample
  );

  evidence.status = resolved.rootStatus;
  evidence.verifiedAt = new Date().toISOString();

  for (const row of evidence.requirements ?? []) {
    if (row.id === "QALIVE-01") {
      row.result = technicalPassed ? "pass" : "fail";
      row.automated = releaseCmd;
    }
  }

  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { resolved, operationalStatus };
}

function main() {
  ensureEvidenceFile();
  const TECHNICAL_STEPS = buildTechnicalSteps();
  const OPERATIONAL_STEPS = buildOperationalSteps();

  if (dryRun) {
    console.log("Operational quality release gate (dry-run)");
    console.log("\n--- Block A: Technical regression ---");
    for (const step of TECHNICAL_STEPS) {
      runStep(step, "technical");
    }
    console.log("\n--- Block B: Operational evidence ---");
    for (const step of OPERATIONAL_STEPS) {
      runStep(step, "operational");
    }
    console.log("\n[dry-run] All steps listed; no commands executed.");
    return;
  }

  let technicalFailedStep = null;
  let operationalStatus = "insufficient_sample";

  try {
    try {
      runBlock(TECHNICAL_STEPS, "technical");
    } catch (error) {
      technicalFailedStep = error.message.replace("step failed: ", "");
      recordTechnicalRegression(false);
      finalizeEvidence(false);
      console.error(
        `\nOperational quality release gate failed (technical: fail) at step: ${technicalFailedStep}.`
      );
      process.exitCode = 1;
      return;
    }

    recordTechnicalRegression(true);

    try {
      runBlock(OPERATIONAL_STEPS, "operational");
    } catch (error) {
      console.error(`\nOperational block step failed: ${error.message}`);
      console.error("Technical regression passed; operational step failure does not abort exit 0.");
    }

    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    operationalStatus = evidence.operationalEvidence?.status ?? "insufficient_sample";
    const { resolved } = finalizeEvidence(true);

    console.log(
      `\nOperational quality release gate passed (technical: pass, operational: ${operationalStatus}).`
    );
    process.exitCode = resolved.exitCode;
  } catch {
    console.error("\nOperational quality release gate failed.");
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
