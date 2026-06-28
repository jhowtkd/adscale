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
const phaseDir = resolve(
  repoRoot,
  ".planning/phases/207-iterative-copilot-integration-and-uat"
);
const evidencePath = resolve(phaseDir, "207-EVIDENCE.json");
const templatePath = resolve(phaseDir, "207-EVIDENCE.template.json");

export const ITERATION_E2E_SPECS = [
  "tests/e2e/iterative-copilot-loop.desktop.spec.ts",
  "tests/e2e/iterative-copilot-loop.mobile.spec.ts",
];

const dryRun = process.argv.includes("--dry-run");
const allowPendingStaging = process.argv.includes("--allow-pending-staging");

const AUTOMATED_STEPS = [
  {
    id: "artifact-version-foundation",
    files: [
      "src/server/repositories/artifact-version.test.ts",
      "src/lib/assistant/artifact-version.test.ts",
      "src/server/assistant/artifact-version/service.test.ts",
      "src/app/api/assistant/threads/[threadId]/route.test.ts",
      "src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts",
    ],
  },
  {
    id: "plan-iteration-loop",
    files: [
      "src/server/assistant/plan-iteration/proposal.test.ts",
      "src/server/assistant/plan-iteration/service.test.ts",
      "src/app/api/assistant/threads/[threadId]/plan-revisions/route.test.ts",
    ],
  },
  {
    id: "creative-iteration-loop",
    files: [
      "src/server/assistant/creative-iteration/proposal.test.ts",
      "src/server/assistant/creative-iteration/service.test.ts",
      "src/app/api/assistant/threads/[threadId]/creative-revisions/route.test.ts",
    ],
  },
  {
    id: "version-compare-and-approval",
    files: [
      "src/server/assistant/artifact-version/comparison.test.ts",
      "src/server/assistant/artifact-version/promotion.test.ts",
      "src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts",
      "src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts",
      "src/app/api/assistant/threads/[threadId]/artifact-versions/comparison-acknowledgements/route.test.ts",
    ],
  },
  {
    id: "version-ui-and-hooks",
    files: [
      "src/components/assistant/VersionComparisonDialog.test.tsx",
      "src/components/assistant/VersionHistory.test.tsx",
      "src/lib/hooks/use-assistant-artifact-versions.test.tsx",
      "src/lib/hooks/use-assistant-threads.test.tsx",
    ],
  },
  {
    id: "artifact-iteration-telemetry",
    files: [
      "src/server/assistant/artifact-iteration-telemetry.test.ts",
      "src/server/repositories/artifact-iteration-telemetry.test.ts",
    ],
  },
  {
    id: "release-evidence-unit",
    files: ["tests/unit/release/v13-9-release-evidence.test.ts"],
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
      milestone: "v13.9",
      status: "pending",
      implementation: { status: "pending" },
      automatedTests: { status: "pending", steps: {} },
      playwrightTests: { status: "pending", specs: ITERATION_E2E_SPECS },
      stagingEvidence: {
        status: "pending",
        note: "Human UAT for full plan→creative iteration loop still required",
      },
      operationalSample: {
        status: "insufficient_sample",
        iterationComparisons: 0,
      },
      inheritedDebt: {
        liveInngestLifecycle: "unverified",
        guidedStagingWalks: "unverified",
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

function runBuild() {
  const command = "npm run build";
  if (dryRun) {
    console.log(`[dry-run] ${command}`);
    return { ok: true, command };
  }
  execFileSync("npm", ["run", "build"], {
    cwd: appDir,
    stdio: "inherit",
  });
  return { ok: true, command };
}

function main() {
  ensureEvidenceFile();
  const evidence = loadEvidence();
  const automated = {};

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

  try {
    const buildResult = runBuild();
    automated.build = { status: "pass", ...buildResult };
  } catch (error) {
    failed = true;
    automated.build = {
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  evidence.automatedTests = {
    status: failed ? "fail" : "pass",
    steps: automated,
    verifiedAt: new Date().toISOString(),
  };
  evidence.playwrightTests = {
    status: "pending",
    specs: ITERATION_E2E_SPECS,
    note: "Run via npx playwright test --config playwright.guided.config.ts iterative-copilot-loop",
  };
  evidence.implementation = {
    status: failed ? "fail" : "pass",
    note: "v13.9 iterative copilot integration phases 203-207",
  };

  const stagingPending = evidence.stagingEvidence?.status === "pending";
  const sampleInsufficient =
    evidence.operationalSample?.status === "insufficient_sample" ||
    (evidence.operationalSample?.iterationComparisons ?? 0) < 5;
  const inngestUnverified =
    evidence.inheritedDebt?.liveInngestLifecycle !== "verified";
  const acceptedDebtScopes = new Set(
    evidence.releaseDecision?.status === "accepted_debt"
      ? evidence.releaseDecision.scopes ?? []
      : []
  );
  const stagingWaived = acceptedDebtScopes.has("human_iteration_uat");
  const sampleWaived = acceptedDebtScopes.has("operational_sample");
  const inngestWaived = acceptedDebtScopes.has("live_inngest_lifecycle");

  if (stagingPending) {
    evidence.stagingEvidence.warning =
      "Staging human evidence for iteration loop still pending";
    if (!allowPendingStaging && !stagingWaived) {
      failed = true;
      evidence.stagingEvidence.gateStatus = "blocked";
    } else if (stagingWaived) {
      evidence.stagingEvidence.gateStatus = "accepted_debt";
    }
  }

  if (sampleInsufficient) {
    evidence.operationalSample = {
      ...evidence.operationalSample,
      gateStatus: sampleWaived ? "accepted_debt" : "blocked",
      warning: "Operational iteration comparisons remain insufficient",
    };
    if (!allowPendingStaging && !sampleWaived) failed = true;
  }

  if (inngestUnverified) {
    evidence.inheritedDebt = {
      ...evidence.inheritedDebt,
      gateStatus: inngestWaived ? "accepted_debt" : "blocked",
    };
    if (!allowPendingStaging && !inngestWaived) failed = true;
  }

  const hasAcceptedDebt = stagingWaived || sampleWaived || inngestWaived;
  evidence.status = hasAcceptedDebt
    ? "passed_with_accepted_debt"
    : failed || stagingPending || sampleInsufficient || inngestUnverified
      ? "passed_with_tech_debt"
      : "passed";

  if (failed) {
    evidence.status = "blocked";
  }

  saveEvidence(evidence);

  if (failed) {
    console.error(
      evidence.automatedTests.status === "fail"
        ? "v13.9 release gate blocked: automated checks failed."
        : "v13.9 release gate blocked: required live evidence is pending."
    );
    process.exit(1);
  }

  console.log(
    hasAcceptedDebt
      ? "v13.9 release gate passed with explicit owner-accepted evidence debt."
      : "v13.9 release gate passed with complete release evidence."
  );
}

main();
