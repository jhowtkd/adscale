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

import { resolveMilestoneStatus } from "./check-v13-3-release-evidence.mjs";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const phaseDir = resolve(repoRoot, ".planning/phases/172-operational-evidence-ui-and-release-gate");
const evidencePath = resolve(phaseDir, "172-EVIDENCE.json");
const templatePath = resolve(phaseDir, "172-EVIDENCE.template.json");
const inAppCopyChecklistPath = resolve(repoRoot, "marketing/brand/in-app-copy-checklist.md");

const dryRun = process.argv.includes("--dry-run");

const PHASE_SURFACE_STEPS = [
  {
    phase: "168",
    id: "phase-168-decision-intake",
    type: "vitest",
    files: [
      "src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts",
      "tests/unit/human-quality/human-quality-service.test.ts",
    ],
  },
  {
    phase: "169",
    id: "phase-169-source-gates",
    type: "vitest",
    files: [
      "tests/unit/release/real-quality-release-evidence.test.ts",
      "tests/unit/release/operational-quality-release-evidence.test.ts",
    ],
  },
  {
    phase: "170",
    id: "phase-170-narrative-rollout",
    type: "composite",
    fileCheck: inAppCopyChecklistPath,
    files: ["tests/unit/i18n/product-narrative-copy.test.ts"],
  },
  {
    phase: "171",
    id: "phase-171-settings-persistence",
    type: "vitest",
    files: [
      "src/app/api/user/profile/route.test.ts",
      "src/app/api/workspace/settings/route.test.ts",
      "src/app/(dashboard)/settings/settings-nav.test.ts",
    ],
  },
  {
    phase: "172",
    id: "phase-172-factual-alerts",
    type: "vitest",
    files: [
      "src/components/feedback/FactualAlertsPanel.test.tsx",
      "src/app/api/admin/quality/learning/factual-alerts/route.test.ts",
      "tests/unit/human-quality/learning/factual-alerts.test.ts",
      "src/components/feedback/HumanQualityCorpusPanel.test.tsx",
      "src/components/admin/OwnerCalibrationPanel.test.tsx",
    ],
  },
];

const RELEASE_EVIDENCE_TEST = "tests/unit/release/v13-3-release-evidence.test.ts";

export { resolveMilestoneStatus };

function ensureEvidenceFile() {
  mkdirSync(phaseDir, { recursive: true });
  if (!existsSync(evidencePath) && existsSync(templatePath)) {
    copyFileSync(templatePath, evidencePath);
  }
}

function loadEvidence() {
  return JSON.parse(readFileSync(evidencePath, "utf8"));
}

function saveEvidence(evidence) {
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function writeAutomatedStep(step, result) {
  const evidence = loadEvidence();
  evidence.automated = { ...(evidence.automated ?? {}), [step]: result };
  saveEvidence(evidence);
}

function formatCommand(step) {
  if (step.type === "vitest" || step.type === "composite") {
    return `npm test -- --run ${step.files.join(" ")}`;
  }
  if (step.type === "node") {
    return `node ${step.args.join(" ")}`;
  }
  return step.id;
}

function runVitest(files) {
  execFileSync("npm", ["test", "--", "--run", ...files], {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
  });
}

function runStep(step) {
  console.log(`\n==> ${step.id}`);
  if (dryRun) {
    if (step.type === "composite" && step.fileCheck) {
      console.log(`[dry-run] test -f ${step.fileCheck}`);
    }
    console.log(`[dry-run] ${formatCommand(step)}`);
    return;
  }

  if (step.type === "composite") {
    if (step.fileCheck && !existsSync(step.fileCheck)) {
      throw new Error(`required file missing: ${step.fileCheck}`);
    }
    runVitest(step.files);
    return;
  }

  if (step.type === "vitest") {
    runVitest(step.files);
    return;
  }

  if (step.type === "node") {
    execFileSync("node", step.args, {
      cwd: appDir,
      stdio: "inherit",
      env: process.env,
    });
  }
}

function recordPhaseSurface(phase, status) {
  const evidence = loadEvidence();
  if (isPlainObject(evidence.phaseSurfaces?.[phase])) {
    evidence.phaseSurfaces[phase].status = status;
  }
  saveEvidence(evidence);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function recordTechnicalRegression(passed) {
  const evidence = loadEvidence();
  evidence.technicalRegression = {
    ...(evidence.technicalRegression ?? {}),
    status: passed ? "pass" : "fail",
    evidenceSource: "technical_regression",
    gateMatrixPass: passed,
    sourcePath: "app/scripts/run-v13-3-release-gate.mjs",
  };
  saveEvidence(evidence);
}

function updateRequirementResults(technicalPassed) {
  const evidence = loadEvidence();
  const releaseCmd = "cd app && npm run v13-3-release-gate";

  for (const row of evidence.requirements ?? []) {
    if (!isPlainObject(row)) {
      continue;
    }
    if (row.id === "ALERT-04") {
      row.result = technicalPassed ? "pass" : "fail";
      row.automated = releaseCmd;
    }
    if (row.id === "ALERT-01" && technicalPassed) {
      row.result = "pass";
    }
    if ((row.id === "ALERT-02" || row.id === "ALERT-03") && technicalPassed) {
      row.result = "pass";
    }
  }

  saveEvidence(evidence);
}

function finalizeEvidence(technicalPassed) {
  const evidence = loadEvidence();
  const operationalStatus = evidence.operationalEvidence?.status ?? "insufficient_sample";
  const resolved = resolveMilestoneStatus(
    technicalPassed ? "pass" : "fail",
    operationalStatus
  );

  evidence.status = resolved.rootStatus;
  evidence.capturedAt = evidence.capturedAt ?? new Date().toISOString();
  evidence.verifiedAt = new Date().toISOString();

  saveEvidence(evidence);

  const checkArgs = [
    resolve(appDir, "scripts/check-v13-3-release-evidence.mjs"),
    "--evidence",
    evidencePath,
    "--skip-tests",
  ];
  execFileSync("node", checkArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  return { resolved, operationalStatus };
}

function main() {
  ensureEvidenceFile();

  if (dryRun) {
    console.log("v13.3 release gate (dry-run)");
    runStep({ id: "release-evidence-test", type: "vitest", files: [RELEASE_EVIDENCE_TEST] });
    for (const step of PHASE_SURFACE_STEPS) {
      runStep(step);
    }
    runStep({
      id: "evidence-check",
      type: "node",
      args: ["scripts/check-v13-3-release-evidence.mjs", "--evidence", evidencePath, "--skip-tests"],
    });
    console.log("\n[dry-run] All steps listed; no commands executed.");
    return;
  }

  let technicalFailedStep = null;

  try {
    try {
      runStep({ id: "release-evidence-test", type: "vitest", files: [RELEASE_EVIDENCE_TEST] });
      writeAutomatedStep("technical:release-evidence-test", "pass");
    } catch {
      writeAutomatedStep("technical:release-evidence-test", "fail");
      recordTechnicalRegression(false);
      updateRequirementResults(false);
      finalizeEvidence(false);
      console.error("\nv13.3 release gate failed at release-evidence-test.");
      process.exitCode = 1;
      return;
    }

    for (const step of PHASE_SURFACE_STEPS) {
      try {
        runStep(step);
        writeAutomatedStep(`technical:${step.id}`, "pass");
        recordPhaseSurface(step.phase, "pass");
      } catch (error) {
        writeAutomatedStep(`technical:${step.id}`, "fail");
        recordPhaseSurface(step.phase, "fail");
        technicalFailedStep = step.id;
        throw error;
      }
    }

    recordTechnicalRegression(true);
    updateRequirementResults(true);
    const { resolved, operationalStatus } = finalizeEvidence(true);

    console.log(
      `\nv13.3 release gate passed (technical: pass, operational: ${operationalStatus}, root: ${resolved.rootStatus}).`
    );
    process.exitCode = resolved.exitCode;
  } catch {
    if (technicalFailedStep) {
      recordTechnicalRegression(false);
      updateRequirementResults(false);
      finalizeEvidence(false);
      console.error(`\nv13.3 release gate failed at step: ${technicalFailedStep}.`);
    } else {
      console.error("\nv13.3 release gate failed.");
    }
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
