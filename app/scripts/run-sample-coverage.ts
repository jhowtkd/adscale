import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSampleCoverage } from "@/server/human-quality/sampling/service";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  type HumanQualityCorpusCohort,
} from "@/server/human-quality/corpus";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.json"
);

interface CliOptions {
  out: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-sample-coverage.ts [options]",
    "",
    "Options:",
    "  --out <path>         Output evidence JSON (default: ../.planning/phases/135-.../135-EVIDENCE.json)",
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

function gatePasses(gateStatus: string): boolean {
  return gateStatus === "ok";
}

function buildRequirements(
  gates: Array<{ id: string; status: string }>
): Array<{ id: string; result: "pass" | "pending"; note: string }> {
  const byId = Object.fromEntries(gates.map((gate) => [gate.id, gate.status]));

  return [
    {
      id: "SAMPLE-01",
      result:
        gatePasses(byId.calibration_global ?? "") &&
        gatePasses(byId.impact_global ?? "") &&
        gatePasses(byId.quality_improvement ?? "")
          ? "pass"
          : "pending",
      note: "canonical sampling thresholds applied across calibration, impact and quality gates",
    },
    {
      id: "SAMPLE-02",
      result: gates.every((gate) => gate.status === "ok" || gate.status === "insufficient_sample")
        ? "pass"
        : "pending",
      note: "insufficient_sample guidance with additionalNeeded counts",
    },
    {
      id: "SAMPLE-03",
      result: "pending",
      note: "evidenceSource tags enforced by Phase 135-02 checkers",
    },
    {
      id: "SAMPLE-04",
      result: gatePasses(byId.calibration_global ?? "") ? "pass" : "pending",
      note: "operator coverage rollup with cross-gate slice gaps",
    },
  ];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const verifiedAt = new Date().toISOString();

  const { report } = await runSampleCoverage({
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
    requirements: buildRequirements(report.gates),
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Sample coverage evidence written: ${path.relative(REPO_ROOT, options.out)}`);
  console.log(
    `nextGate=${report.nextGate} evaluatedItemCount=${report.evaluatedItemCount} sliceGaps=${report.sliceGaps.length}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
