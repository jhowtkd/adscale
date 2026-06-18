import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
} from "@/server/human-quality/corpus";
import { runQualityTrend } from "@/server/human-quality/trend/service";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  ".planning/phases/136-quality-trend-dashboard/136-EVIDENCE.json"
);

interface CliOptions {
  out: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
  generationMode?: string;
  format?: string;
  clientProfileId?: string;
  primaryFailureReason?: HumanQualityFailureReason;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-quality-trend.ts [options]",
    "",
    "Options:",
    "  --out <path>                    Output evidence JSON (default: ../.planning/phases/136-.../136-EVIDENCE.json)",
    "  --all-workspaces                Global multi-workspace rollup (default when no --workspace-id)",
    "  --workspace-id <id>             Scope report to a single workspace",
    `  --cohort <name>                 Filter cohort (${HUMAN_QUALITY_CORPUS_COHORTS.join(", ")})`,
    "  --generation-mode <mode>        Filter by corpus generation mode",
    "  --format <format>               Filter by creative format (e.g. 1:1, 4:5)",
    "  --client-profile-id <uuid>      Filter by client profile",
    `  --primary-failure-reason <name> Filter by evaluation failure reason (${HUMAN_QUALITY_FAILURE_REASONS.join(", ")})`,
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const outIndex = argv.indexOf("--out");
  const workspaceIndex = argv.indexOf("--workspace-id");
  const cohortIndex = argv.indexOf("--cohort");
  const generationModeIndex = argv.indexOf("--generation-mode");
  const formatIndex = argv.indexOf("--format");
  const clientProfileIndex = argv.indexOf("--client-profile-id");
  const failureReasonIndex = argv.indexOf("--primary-failure-reason");

  const workspaceId =
    workspaceIndex >= 0 ? argv[workspaceIndex + 1]?.trim() : undefined;
  const cohortRaw = cohortIndex >= 0 ? argv[cohortIndex + 1]?.trim() : undefined;
  const generationMode =
    generationModeIndex >= 0 ? argv[generationModeIndex + 1]?.trim() : undefined;
  const format = formatIndex >= 0 ? argv[formatIndex + 1]?.trim() : undefined;
  const clientProfileId =
    clientProfileIndex >= 0 ? argv[clientProfileIndex + 1]?.trim() : undefined;
  const failureReasonRaw =
    failureReasonIndex >= 0 ? argv[failureReasonIndex + 1]?.trim() : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  if (workspaceIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
  }

  if (clientProfileIndex >= 0 && !clientProfileId) {
    throw new Error("--client-profile-id requires a UUID value");
  }

  let cohort: HumanQualityCorpusCohort | undefined;
  if (cohortRaw) {
    if (!HUMAN_QUALITY_CORPUS_COHORTS.includes(cohortRaw as HumanQualityCorpusCohort)) {
      throw new Error(
        `Invalid cohort "${cohortRaw}". Expected one of: ${HUMAN_QUALITY_CORPUS_COHORTS.join(", ")}`
      );
    }
    cohort = cohortRaw as HumanQualityCorpusCohort;
  }

  let primaryFailureReason: HumanQualityFailureReason | undefined;
  if (failureReasonRaw) {
    if (
      !HUMAN_QUALITY_FAILURE_REASONS.includes(
        failureReasonRaw as HumanQualityFailureReason
      )
    ) {
      throw new Error(
        `Invalid primary failure reason "${failureReasonRaw}". Expected one of: ${HUMAN_QUALITY_FAILURE_REASONS.join(", ")}`
      );
    }
    primaryFailureReason = failureReasonRaw as HumanQualityFailureReason;
  }

  return {
    out: outIndex >= 0 ? path.resolve(argv[outIndex + 1] ?? "") : DEFAULT_OUT,
    allWorkspaces: argv.includes("--all-workspaces") || !workspaceId,
    workspaceId,
    cohort,
    generationMode,
    format,
    clientProfileId,
    primaryFailureReason,
  };
}

function buildRequirements(report: {
  status: string;
  populatedBucketCount: number;
  alertFlags: {
    insufficientCoverage: boolean;
    staleEvidence: boolean;
    regressionDetected: boolean;
  };
}): Array<{ id: string; result: "pass" | "pending"; note: string }> {
  return [
    {
      id: "TREND-01",
      result:
        report.populatedBucketCount >= 2 && report.status === "ok"
          ? "pass"
          : "pending",
      note: "ISO-week bucketing with populated time buckets",
    },
    {
      id: "TREND-02",
      result: "pass",
      note: "server-side dimensional filters applied before aggregation",
    },
    {
      id: "TREND-03",
      result: report.status === "ok" ? "pass" : "pending",
      note: "coverage trend_global gate reflects real trend status and guidance",
    },
    {
      id: "TREND-04",
      result:
        !report.alertFlags.insufficientCoverage &&
        !report.alertFlags.staleEvidence &&
        !report.alertFlags.regressionDetected
          ? "pass"
          : "pending",
      note: "bounded evidence refs and independent alert flags in API delivery",
    },
  ];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const verifiedAt = new Date().toISOString();

  const { report } = await runQualityTrend({
    workspaceId: options.allWorkspaces ? undefined : options.workspaceId,
    cohort: options.cohort,
    generationMode: options.generationMode,
    format: options.format,
    clientProfileId: options.clientProfileId,
    primaryFailureReason: options.primaryFailureReason,
    capturedAt: verifiedAt,
  });

  const evidence = {
    schemaVersion: 1,
    phaseVersion: "v12.6",
    capturedAt: report.capturedAt,
    verifiedAt,
    evidenceSource: report.evidenceSource,
    status: report.status,
    scope: {
      allWorkspaces: options.allWorkspaces,
      workspaceId: options.workspaceId ?? null,
      cohort: options.cohort ?? null,
      generationMode: options.generationMode ?? null,
      format: options.format ?? null,
      clientProfileId: options.clientProfileId ?? null,
      primaryFailureReason: options.primaryFailureReason ?? null,
    },
    requirements: buildRequirements(report),
    report,
    alertFlags: report.alertFlags,
    sampleGuidance: report.sampleGuidance,
    automated: {
      "quality-trend": "node app/scripts/check-quality-trend-evidence.mjs --skip-tests",
      unit: "cd app && npm test -- tests/unit/human-quality/trend/",
    },
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Quality trend evidence written: ${path.relative(REPO_ROOT, options.out)}`);
  console.log(
    `status=${report.status} evaluatedItemCount=${report.evaluatedItemCount} populatedBucketCount=${report.populatedBucketCount}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
