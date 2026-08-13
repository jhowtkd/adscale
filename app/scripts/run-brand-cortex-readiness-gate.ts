import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import { runBrandConsistencyValidation } from "./run-brand-consistency-validation";

type BaselineSummary = {
  status: "pass" | "human_needed" | "fail";
  hashes: Record<string, string>;
  divergences: string[];
};

const assertionsSchema = z.object({
  trainingReviewed: z.literal(true),
  versionPublished: z.literal(true),
  laterPublicationDidNotMutateSnapshot: z.literal(true),
  exactAssetProven: z.literal(true),
  approvedFontAndCopyProven: z.literal(true),
  deterministicAndResidualSeparated: z.literal(true),
  traceableToEvidence: z.literal(true),
});

const seamEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["pass", "fail"]),
  capturedAt: z.string().datetime(),
  authenticated: z.literal(true),
  provider: z.literal("e2e-controlled"),
  paidGeneration: z.literal(false),
  featureFlag: z.literal("enabled_for_test"),
  assertions: assertionsSchema,
  version: z.unknown().optional(),
});

export type BrandCortexReadinessStatus = "approved" | "failed" | "human_needed";

export function evaluateBrandCortexReadiness(input: {
  previousBaseline: BaselineSummary;
  rerunBaseline: BaselineSummary;
  seamEvidence: unknown | null;
  humanRelease: "approved" | "rejected" | "pending";
  generatedAt?: string;
}) {
  const hashesMatch = canonicalJsonStringify(input.previousBaseline.hashes)
    === canonicalJsonStringify(input.rerunBaseline.hashes);
  const parsedSeam = input.seamEvidence === null
    ? null
    : seamEvidenceSchema.safeParse(input.seamEvidence);
  const baselineFailed = input.rerunBaseline.status === "fail"
    || input.rerunBaseline.divergences.length > 0
    || !hashesMatch;
  const seamFailed = parsedSeam !== null
    && (!parsedSeam.success || parsedSeam.data.status === "fail");
  const status: BrandCortexReadinessStatus = baselineFailed
    || seamFailed
    || input.humanRelease === "rejected"
      ? "failed"
      : input.rerunBaseline.status === "pass"
        && parsedSeam?.success === true
        && parsedSeam.data.status === "pass"
        && input.humanRelease === "approved"
        ? "approved"
        : "human_needed";

  return {
    schemaVersion: 1 as const,
    reportType: "brand-cortex-readiness" as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    baselineComparison: {
      previousStatus: input.previousBaseline.status,
      rerunStatus: input.rerunBaseline.status,
      hashesMatch,
      previousHashes: input.previousBaseline.hashes,
      rerunHashes: input.rerunBaseline.hashes,
      regressions: baselineFailed
        ? [...input.rerunBaseline.divergences, ...(!hashesMatch ? ["controlled baseline hashes changed"] : [])]
        : [],
    },
    authenticatedControlledSeam: input.seamEvidence === null
      ? { status: "not_run" as const, evidence: null }
      : parsedSeam?.success
        ? { status: parsedSeam.data.status, evidence: parsedSeam.data }
        : { status: "invalid" as const, evidence: null },
    humanRelease: input.humanRelease,
    featureFlag: { defaultEnabled: false, controllable: true },
    paidGeneration: { executed: false, realProviderGate: "manual_and_authorized" as const },
  };
}

function parseArgs(argv: string[]) {
  const defaults = {
    baseline: path.resolve(process.cwd(), "../.planning/validation/brand-consistency-baseline.evidence.json"),
    manifest: path.resolve(process.cwd(), "../.planning/validation/brand-consistency-baseline.manifest.json"),
    seam: path.resolve(process.cwd(), "tests/e2e/.evidence/brand-cortex-seam.json"),
    out: path.resolve(process.cwd(), "../.planning/validation/brand-cortex-readiness.evidence.json"),
    humanRelease: "pending" as "approved" | "rejected" | "pending",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline") defaults.baseline = path.resolve(argv[++index] ?? "");
    else if (arg === "--manifest") defaults.manifest = path.resolve(argv[++index] ?? "");
    else if (arg === "--seam") defaults.seam = path.resolve(argv[++index] ?? "");
    else if (arg === "--out") defaults.out = path.resolve(argv[++index] ?? "");
    else if (arg === "--human-release") {
      const value = argv[++index];
      if (value !== "approved" && value !== "rejected" && value !== "pending") {
        throw new Error("--human-release must be approved, rejected or pending");
      }
      defaults.humanRelease = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return defaults;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let temporaryDirectory: string | null = null;
  try {
    const args = parseArgs(argv);
    const previousBaseline = JSON.parse(readFileSync(args.baseline, "utf8")) as BaselineSummary;
    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "adscale-brand-cortex-"));
    const rerun = await runBrandConsistencyValidation({
      manifestPath: args.manifest,
      outputPath: path.join(temporaryDirectory, "baseline-rerun.json"),
    });
    const seamEvidence = existsSync(args.seam)
      ? JSON.parse(readFileSync(args.seam, "utf8")) as unknown
      : null;
    const report = evaluateBrandCortexReadiness({
      previousBaseline,
      rerunBaseline: rerun.report,
      seamEvidence,
      humanRelease: args.humanRelease,
    });
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`BRAND-CORTEX: ${report.status}`);
    console.log(`Structured evidence: ${args.out}`);
    return report.status === "failed" ? 1 : 0;
  } catch (error) {
    console.error(`BRAND-CORTEX: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
