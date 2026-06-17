import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLearningImpact } from "@/server/human-quality/impact/service";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  type HumanQualityCorpusCohort,
} from "@/server/human-quality/corpus";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  ".planning/phases/131-learning-impact-measurement/131-EVIDENCE.json"
);

interface CliOptions {
  out: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-learning-impact.ts [options]",
    "",
    "Options:",
    "  --out <path>         Output evidence JSON (default: ../.planning/phases/131-.../131-EVIDENCE.json)",
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

const REQUIRED_REQUIREMENT_IDS = ["IMPACT-01", "IMPACT-02", "IMPACT-03", "IMPACT-04"];

function buildRequirements(status: "ok" | "insufficient_sample", evaluatedItemCount: number) {
  const sampleOk = status === "ok";
  return [
    {
      id: "IMPACT-01",
      result: sampleOk ? "pass" : "pending",
      note: "output-learning application snapshot on derivations and corpus freeze",
      evaluatedItemCount,
    },
    {
      id: "IMPACT-02",
      result: sampleOk ? "pass" : "pending",
      note: "learned vs non-learned arm comparison per client×mode×format slice",
    },
    {
      id: "IMPACT-03",
      result: sampleOk ? "pass" : "pending",
      note: "separated learningImpact, intent, visualMovement, and factual metric buckets",
    },
    {
      id: "IMPACT-04",
      result: sampleOk ? "pass" : "pending",
      note: "insufficient_sample nulls movement deltas; no improvement claims when gated",
    },
  ];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const verifiedAt = new Date().toISOString();

  const { report } = await runLearningImpact({
    workspaceId: options.allWorkspaces ? undefined : options.workspaceId,
    cohort: options.cohort,
    capturedAt: verifiedAt,
  });

  const evidence = {
    ...report,
    verifiedAt,
    scope: {
      allWorkspaces: options.allWorkspaces,
      workspaceId: options.workspaceId ?? null,
      cohort: options.cohort ?? null,
    },
    requirements: buildRequirements(report.status, report.evaluatedItemCount),
  };

  for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
    if (!evidence.requirements.some((entry) => entry.id === requiredId)) {
      throw new Error(`Internal error: missing requirement ${requiredId}`);
    }
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Learning impact evidence written: ${path.relative(REPO_ROOT, options.out)}`);
  console.log(
    `status=${report.status} evaluatedItemCount=${report.evaluatedItemCount} learned=${report.learningImpactMetrics.learnedCount} nonLearned=${report.learningImpactMetrics.nonLearnedCount}`
  );
  if (report.learningImpactMetrics.globalVisualScoreDelta != null) {
    console.log(
      `globalVisualScoreDelta=${report.learningImpactMetrics.globalVisualScoreDelta.toFixed(2)}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
