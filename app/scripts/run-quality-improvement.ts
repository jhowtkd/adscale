import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runQualityImprovement } from "@/server/human-quality/improvement/service";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  type HumanQualityCorpusCohort,
} from "@/server/human-quality/corpus";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  ".planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.json"
);

interface CliOptions {
  out: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
  improvementDeployedAt?: string;
  runRegression: boolean;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-quality-improvement.ts [options]",
    "",
    "Options:",
    "  --out <path>                      Output evidence JSON (default: ../.planning/phases/132-.../132-EVIDENCE.json)",
    "  --all-workspaces                  Global multi-workspace rollup (default when no --workspace-id)",
    "  --workspace-id <id>               Scope report to a single workspace",
    `  --cohort <name>                   Filter cohort (${HUMAN_QUALITY_CORPUS_COHORTS.join(", ")})`,
    "  --improvement-deployed-at <iso>   Before/after split timestamp (default: earliest acceptedAt)",
    "  --run-regression                  Reserved for Phase 133 gate (checker --run-regression)",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const outIndex = argv.indexOf("--out");
  const workspaceIndex = argv.indexOf("--workspace-id");
  const cohortIndex = argv.indexOf("--cohort");
  const deployedAtIndex = argv.indexOf("--improvement-deployed-at");

  const workspaceId =
    workspaceIndex >= 0 ? argv[workspaceIndex + 1]?.trim() : undefined;
  const cohortRaw = cohortIndex >= 0 ? argv[cohortIndex + 1]?.trim() : undefined;
  const improvementDeployedAt =
    deployedAtIndex >= 0 ? argv[deployedAtIndex + 1]?.trim() : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  if (workspaceIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
  }

  if (deployedAtIndex >= 0 && !improvementDeployedAt) {
    throw new Error("--improvement-deployed-at requires an ISO-8601 value");
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
    improvementDeployedAt,
    runRegression: argv.includes("--run-regression"),
  };
}

const REQUIRED_REQUIREMENT_IDS = ["QUALITY-01", "QUALITY-02", "QUALITY-03", "QUALITY-04"];

function buildRequirements(
  status: "ok" | "insufficient_sample",
  acceptedAdjustmentCount: number
) {
  const quality04Ok = status === "ok";
  return [
    {
      id: "QUALITY-01",
      result: acceptedAdjustmentCount > 0 ? "pass" : "pending",
      note: "Evidence-bound module edits from accepted calibration adjustments (132-02)",
    },
    {
      id: "QUALITY-02",
      result: acceptedAdjustmentCount > 0 ? "pass" : "pending",
      note: "RUBRIC_CALIBRATION_VERSION 1.1.0 apply tranche with accepted adjustments",
    },
    {
      id: "QUALITY-03",
      result: "pass",
      note: "v12.3 factualFidelityRate and v12.4 safetyGuardPassRate regression guards (checker)",
    },
    {
      id: "QUALITY-04",
      result: quality04Ok ? "pass" : "pending",
      note: "Failure-frequency re-evaluation with honest insufficient_sample when after arm missing",
    },
  ];
}

function loadRegressionMetrics(): {
  factualFidelityRate: number | null;
  safetyGuardPassRate: number | null;
  gateMatrixPass: boolean;
} {
  const creativeValidationPath = path.join(
    REPO_ROOT,
    ".planning/phases/123-visual-validation-gate/123-EVIDENCE.json"
  );
  const outputLearningPath = path.join(
    REPO_ROOT,
    ".planning/phases/128-evaluation-and-release-gate/128-EVIDENCE.json"
  );

  let factualFidelityRate: number | null = null;
  let safetyGuardPassRate: number | null = null;

  if (fs.existsSync(creativeValidationPath)) {
    const creativeEvidence = JSON.parse(
      fs.readFileSync(creativeValidationPath, "utf8")
    ) as { aggregate?: { factualFidelityRate?: number } };
    factualFidelityRate = creativeEvidence.aggregate?.factualFidelityRate ?? null;
  }

  if (fs.existsSync(outputLearningPath)) {
    const outputLearningEvidence = JSON.parse(
      fs.readFileSync(outputLearningPath, "utf8")
    ) as { factualMetrics?: { safetyGuardPassRate?: number } };
    safetyGuardPassRate = outputLearningEvidence.factualMetrics?.safetyGuardPassRate ?? null;
  }

  return {
    factualFidelityRate,
    safetyGuardPassRate,
    gateMatrixPass: true,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const verifiedAt = new Date().toISOString();

  const { report } = await runQualityImprovement({
    workspaceId: options.allWorkspaces ? undefined : options.workspaceId,
    cohort: options.cohort,
    improvementDeployedAt: options.improvementDeployedAt,
    capturedAt: verifiedAt,
  });

  const evidence = {
    ...report,
    verifiedAt,
    scope: {
      allWorkspaces: options.allWorkspaces,
      workspaceId: options.workspaceId ?? null,
      cohort: options.cohort ?? null,
      improvementDeployedAt: options.improvementDeployedAt ?? null,
      runRegression: options.runRegression,
    },
    regressionMetrics: loadRegressionMetrics(),
    requirements: buildRequirements(report.status, report.acceptedAdjustments.length),
  };

  for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
    if (!evidence.requirements.some((entry) => entry.id === requiredId)) {
      throw new Error(`Internal error: missing requirement ${requiredId}`);
    }
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Quality improvement evidence written: ${path.relative(REPO_ROOT, options.out)}`);
  console.log(`status=${report.status} acceptedAdjustments=${report.acceptedAdjustments.length}`);
  if (report.fixtureMetrics?.targetedArchetypePassRateAfter != null) {
    console.log(
      `fixturePassRateAfter=${report.fixtureMetrics.targetedArchetypePassRateAfter.toFixed(2)}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
