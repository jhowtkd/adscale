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
const phaseDir = resolve(repoRoot, ".planning/phases/200-real-staging-evidence-and-release-gate");
const evidencePath = resolve(phaseDir, "200-EVIDENCE.json");
const templatePath = resolve(phaseDir, "200-EVIDENCE.template.json");
const runbookPath = resolve(repoRoot, "docs/staging/guided-journeys-v13-8-runbook.md");

const dryRun = process.argv.includes("--dry-run");
const allowPendingStaging = process.argv.includes("--allow-pending-staging");

const AUTOMATED_STEPS = [
  {
    id: "journey-transition-engine",
    files: ["src/server/assistant/guided-conversation/transition.test.ts"],
  },
  {
    id: "guided-flow-commands-api",
    files: [
      "src/app/api/assistant/threads/[threadId]/guided-flow/commands/route.test.ts",
    ],
  },
  {
    id: "guided-flow-repository",
    files: ["src/server/repositories/guided-flow.test.ts"],
  },
  {
    id: "from-zero-path",
    files: ["src/server/assistant/guided-paths/from-zero.test.ts"],
  },
  {
    id: "existing-creative-path",
    files: ["src/server/assistant/guided-paths/existing-creative.test.ts"],
  },
  {
    id: "diagnosis-panel",
    files: ["src/components/assistant/CreativeDiagnosisPanel.test.tsx"],
  },
  {
    id: "guided-flow-routes",
    files: [
      "src/app/api/assistant/threads/[threadId]/guided-flow/route.test.ts",
      "src/app/api/assistant/threads/[threadId]/guided-flow/select-creative/route.test.ts",
      "src/app/api/assistant/threads/[threadId]/guided-flow/from-zero/route.test.ts",
    ],
  },
  {
    id: "release-evidence-unit",
    files: ["tests/unit/release/v13-8-release-evidence.test.ts"],
  },
];

function ensureEvidenceFile() {
  mkdirSync(phaseDir, { recursive: true });
  if (!existsSync(evidencePath) && existsSync(templatePath)) {
    copyFileSync(templatePath, evidencePath);
  }
}

function loadEvidence() {
  if (!existsSync(evidencePath)) {
    return {
      milestone: "v13.8",
      status: "pending",
      implementation: { status: "pending" },
      automatedTests: { status: "pending", steps: {} },
      stagingEvidence: {
        status: "pending",
        note: "Human staging walks for both adaptive journeys still required",
      },
      operationalSample: {
        status: "insufficient_sample",
        guidedStarts: 0,
      },
      inheritedDebt: {
        liveInngestLifecycle: "unverified",
      },
    };
  }
  return JSON.parse(readFileSync(evidencePath, "utf8"));
}

function saveEvidence(evidence) {
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function runVitest(files) {
  const command = `npm test -- --run ${files.join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] ${command}`);
    return { ok: true, command };
  }
  execFileSync("npm", ["test", "--", "--run", ...files], {
    cwd: appDir,
    stdio: "inherit",
  });
  return { ok: true, command };
}

function main() {
  ensureEvidenceFile();
  const evidence = loadEvidence();
  const automated = {};

  if (!existsSync(runbookPath)) {
    console.warn(`Runbook not found (non-blocking for automated only): ${runbookPath}`);
  }

  let failed = false;
  for (const step of AUTOMATED_STEPS) {
    try {
      const result = runVitest(step.files);
      automated[step.id] = { status: "pass", ...result };
    } catch (error) {
      failed = true;
      automated[step.id] = {
        status: "fail",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  evidence.automatedTests = {
    status: failed ? "fail" : "pass",
    steps: automated,
    verifiedAt: new Date().toISOString(),
  };
  evidence.implementation = {
    status: failed ? "fail" : "pass",
    note: "v13.8 adaptive guided conversation phases 195-199",
  };

  const stagingPending = evidence.stagingEvidence?.status === "pending";
  const sampleInsufficient =
    evidence.operationalSample?.status === "insufficient_sample" ||
    (evidence.operationalSample?.guidedStarts ?? 0) < 5;

  if (stagingPending) {
    evidence.stagingEvidence.warning =
      "Staging human evidence still pending — see docs/staging/guided-journeys-v13-8-runbook.md";
    if (!allowPendingStaging) {
      failed = true;
      evidence.stagingEvidence.gateStatus = "blocked";
    }
  }

  if (sampleInsufficient) {
    evidence.operationalSample = {
      ...evidence.operationalSample,
      gateStatus: "blocked",
      warning: "Operational guided starts remain insufficient",
    };
  }

  evidence.status =
    failed || stagingPending || sampleInsufficient
      ? "passed_with_tech_debt"
      : "passed";

  if (failed) {
    evidence.status = "blocked";
  }

  saveEvidence(evidence);

  if (failed) {
    console.error(
      evidence.automatedTests.status === "fail"
        ? "v13.8 release gate blocked: automated checks failed."
        : "v13.8 release gate blocked: required staging evidence is pending."
    );
    process.exit(1);
  }

  console.log(
    "v13.8 release gate automated checks passed (staging/sample debt may remain explicit)."
  );
}

main();
