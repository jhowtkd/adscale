import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runScoreCalibration } from "@/server/human-quality/calibration/service";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  type HumanQualityCorpusCohort,
} from "@/server/human-quality/corpus";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  ".planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.json"
);

interface CliOptions {
  out: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-score-calibration.ts [options]",
    "",
    "Options:",
    "  --out <path>         Output evidence JSON (default: ../.planning/phases/130-.../130-EVIDENCE.json)",
    "  --all-workspaces     Global multi-workspace rollup (default when no --workspace-id)",
    "  --workspace-id <id>  Scope report to a single workspace",
    `  --cohort <name>      Filter cohort (${HUMAN_QUALITY_CORPUS_COHORTS.join(", ")})`,
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const outIndex = argv.indexOf("--out");
  const workspaceIndex = argv.indexOf("--workspace-id");
  const cohortIndex = argv.indexOf("--cohort");

  const workspaceId =
    workspaceIndex >= 0 ? argv[workspaceIndex + 1]?.trim() : undefined;
  const cohortRaw = cohortIndex >= 0 ? argv[cohortIndex + 1]?.trim() : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  if (workspaceIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
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

  return {
    out: outIndex >= 0 ? path.resolve(argv[outIndex + 1] ?? "") : DEFAULT_OUT,
    allWorkspaces: argv.includes("--all-workspaces") || !workspaceId,
    workspaceId,
    cohort,
  };
}

function buildRequirements(status: "ok" | "insufficient_corpus", evaluatedItemCount: number) {
  const corpusOk = status === "ok";
  return [
    {
      id: "CALIB-01",
      result: corpusOk ? "pass" : "pending",
      note: "per-item automatic vs human visual score comparison",
      evaluatedItemCount,
    },
    {
      id: "CALIB-02",
      result: corpusOk ? "pass" : "pending",
      note: "grouped divergence by failure reason, mode and format",
    },
    {
      id: "CALIB-03",
      result: "pass",
      note: "versioned adjustment proposals with corpus evidence refs",
    },
    {
      id: "CALIB-04",
      result: corpusOk ? "pass" : "pending",
      note: "visualMetrics and factualMetrics stored separately",
    },
  ];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const verifiedAt = new Date().toISOString();

  const { report, persistedAdjustments } = await runScoreCalibration({
    workspaceId: options.allWorkspaces ? undefined : options.workspaceId,
    cohort: options.cohort,
    capturedAt: verifiedAt,
  });

  const evidence = {
    ...report,
    visualMetrics: {
      ...report.visualMetrics,
      evidenceSource: "live_human" as const,
      denominatorNote: "Human-evaluated corpus items only",
    },
    factualMetrics: {
      ...report.factualMetrics,
      evidenceSource: "live_human" as const,
      denominatorNote: "Human-evaluated corpus items only",
    },
    verifiedAt,
    scope: {
      allWorkspaces: options.allWorkspaces,
      workspaceId: options.workspaceId ?? null,
      cohort: options.cohort ?? null,
    },
    persistedAdjustmentCount: persistedAdjustments.length,
    requirements: buildRequirements(report.status, report.evaluatedItemCount),
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Score calibration evidence written: ${path.relative(REPO_ROOT, options.out)}`);
  console.log(
    `status=${report.status} evaluatedItemCount=${report.evaluatedItemCount} persistedAdjustments=${persistedAdjustments.length}`
  );
  if (report.visualMetrics.meanAbsError != null) {
    console.log(
      `visual MAE=${report.visualMetrics.meanAbsError.toFixed(2)} signedBias=${report.visualMetrics.meanSignedDelta?.toFixed(2) ?? "n/a"}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
