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
const phaseDir = resolve(repoRoot, ".planning/phases/194-operational-release-gate");
const evidencePath = resolve(phaseDir, "194-EVIDENCE.json");
const templatePath = resolve(phaseDir, "194-EVIDENCE.template.json");
const runbookPath = resolve(repoRoot, "docs/staging/guided-journeys-v13-7-runbook.md");

const dryRun = process.argv.includes("--dry-run");

const AUTOMATED_STEPS = [
  {
    id: "telemetry-repository",
    files: ["src/server/repositories/guided-flow-telemetry.test.ts"],
  },
  {
    id: "telemetry-contract",
    files: ["src/server/assistant/guided-flow-telemetry.test.ts"],
  },
  {
    id: "guided-flow-funnel",
    files: [
      "src/server/assistant/guided-flow-funnel.test.ts",
      "src/app/api/feedback/analytics/guided-flow-funnel/route.test.ts",
    ],
  },
  {
    id: "staging-evidence",
    files: ["src/server/repositories/guided-flow-staging-evidence.test.ts"],
  },
  {
    id: "quality-feedback",
    files: ["src/server/repositories/guided-flow-feedback.test.ts"],
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
    files: ["tests/unit/release/v13-7-release-evidence.test.ts"],
  },
];

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
    console.error(`Missing runbook: ${runbookPath}`);
    process.exit(1);
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
    note: "v13.7 guided operational phases 190-193",
  };

  if (evidence.stagingEvidence?.status === "pending") {
    evidence.stagingEvidence.warning =
      "Staging human evidence still pending — see docs/staging/guided-journeys-v13-7-runbook.md";
  }

  evidence.status = failed ? "blocked" : "passed_with_tech_debt";
  saveEvidence(evidence);

  if (failed) {
    process.exit(1);
  }

  console.log("v13.7 release gate automated checks passed (staging evidence may still be pending).");
}

main();
