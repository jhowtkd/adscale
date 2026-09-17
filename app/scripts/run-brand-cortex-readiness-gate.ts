import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import {
  evaluateBrandCortexPilotPending,
  evaluateBrandCortexPilotReview,
  inspectBrandCortexPilot,
  verifyBrandCortexPilotArtifacts,
} from "@/server/creative-work/brand-cortex-release";
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

const humanReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  reportType: z.literal("brand-cortex-human-release"),
  status: z.enum(["approved", "failed", "human_needed"]),
  pilotId: z.string().min(1),
  pilotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  reviewerId: z.string().min(1).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  failures: z.array(z.string()),
  pending: z.array(z.string()),
  coverage: z.object({
    requiredFormats: z.array(z.enum(["1:1", "4:5", "9:16"])),
    minimumArtifactsPerFormat: z.number().int().positive(),
    artifactsPerFormat: z.record(z.number().int().nonnegative()),
    meetsMinimum: z.boolean(),
  }).optional(),
  integrity: z.object({
    status: z.enum(["pass", "fail", "not_checked"]),
    checkedFiles: z.number().int().nonnegative(),
    failures: z.array(z.string()),
  }).optional(),
  typography: z.object({
    status: z.enum(["pass", "conflict", "not_applicable"]),
    precedence: z.literal("explicit_high_confidence_claim_over_approved_font_asset"),
    declaredFamilies: z.array(z.string()),
    appliedFamilies: z.array(z.string()),
    conflicts: z.array(z.string()),
  }).optional(),
});

export type BrandCortexReadinessStatus = "approved" | "failed" | "human_needed";

export function evaluateBrandCortexReadiness(input: {
  previousBaseline: BaselineSummary;
  rerunBaseline: BaselineSummary;
  seamEvidence: unknown | null;
  humanRelease: unknown | null;
  generatedAt?: string;
}) {
  const hashesMatch = canonicalJsonStringify(input.previousBaseline.hashes)
    === canonicalJsonStringify(input.rerunBaseline.hashes);
  const parsedSeam = input.seamEvidence === null
    ? null
    : seamEvidenceSchema.safeParse(input.seamEvidence);
  const parsedRelease = input.humanRelease === null
    ? null
    : humanReleaseSchema.safeParse(input.humanRelease);
  const baselineFailed = input.rerunBaseline.status === "fail"
    || input.rerunBaseline.divergences.length > 0
    || !hashesMatch;
  const seamFailed = parsedSeam !== null
    && (!parsedSeam.success || parsedSeam.data.status === "fail");
  const releaseFailed = parsedRelease !== null
    && (!parsedRelease.success || parsedRelease.data.status === "failed");
  const status: BrandCortexReadinessStatus = baselineFailed
    || seamFailed
    || releaseFailed
      ? "failed"
      : parsedSeam?.success === true
        && parsedSeam.data.status === "pass"
        && parsedRelease?.success === true
        && parsedRelease.data.status === "approved"
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
    humanRelease: input.humanRelease === null
      ? { status: "not_run" as const, evidence: null }
      : parsedRelease?.success
        ? { status: parsedRelease.data.status, evidence: parsedRelease.data }
        : { status: "invalid" as const, evidence: null },
    featureFlag: { defaultEnabled: false, controllable: true },
    paidGeneration: {
      executed: false,
      realProviderGate: parsedRelease?.success === true && parsedRelease.data.status === "approved"
        ? "reviewed" as const
        : "manual_and_authorized" as const,
    },
  };
}

function parseArgs(argv: string[]) {
  const defaults = {
    baseline: path.resolve(process.cwd(), "../.planning/validation/brand-consistency-baseline.evidence.json"),
    manifest: path.resolve(process.cwd(), "../.planning/validation/brand-consistency-baseline.manifest.json"),
    seam: path.resolve(process.cwd(), "tests/e2e/.evidence/brand-cortex-seam.json"),
    out: path.resolve(process.cwd(), "../.planning/validation/brand-cortex-readiness.evidence.json"),
    pilot: "",
    review: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline") defaults.baseline = path.resolve(argv[++index] ?? "");
    else if (arg === "--manifest") defaults.manifest = path.resolve(argv[++index] ?? "");
    else if (arg === "--seam") defaults.seam = path.resolve(argv[++index] ?? "");
    else if (arg === "--out") defaults.out = path.resolve(argv[++index] ?? "");
    else if (arg === "--pilot") defaults.pilot = path.resolve(argv[++index] ?? "");
    else if (arg === "--review") defaults.review = path.resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return defaults;
}

/**
 * ICE-05A: human_needed stays pending (exit 2, the repo's pending signal),
 * never a pass — and distinct from a hard failure (exit 1).
 */
export function readinessExitCode(status: BrandCortexReadinessReport["status"]): number {
  if (status === "approved") return 0;
  if (status === "human_needed") return 2;
  return 1;
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
    if (!args.pilot && args.review) throw new Error("--review requires --pilot");
    const pilot = args.pilot
      ? JSON.parse(readFileSync(args.pilot, "utf8")) as unknown
      : null;
    const artifactFailures = pilot && args.pilot
      ? verifyBrandCortexPilotArtifacts(pilot, (artifactPath) =>
          readFileSync(path.join(path.dirname(args.pilot), artifactPath)),
        )
      : [];
    const pilotEvidence = pilot ? inspectBrandCortexPilot(pilot, artifactFailures) : null;
    const reviewedRelease = pilot && args.review
      ? evaluateBrandCortexPilotReview({
          pilot,
          review: JSON.parse(readFileSync(args.review, "utf8")) as unknown,
        })
      : null;
    const humanRelease = pilot && pilotEvidence
      ? reviewedRelease
        ? {
            ...reviewedRelease,
            coverage: pilotEvidence.coverage,
            integrity: pilotEvidence.integrity,
            typography: pilotEvidence.typography,
            ...(artifactFailures.length > 0
              ? {
                  status: "failed" as const,
                  failures: [...reviewedRelease.failures, ...artifactFailures],
                }
              : {}),
          }
        : evaluateBrandCortexPilotPending({ pilot, artifactFailures })
      : null;
    const report = evaluateBrandCortexReadiness({
      previousBaseline,
      rerunBaseline: rerun.report,
      seamEvidence,
      humanRelease,
    });
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`BRAND-CORTEX: ${report.status}`);
    console.log(`Structured evidence: ${args.out}`);
    return readinessExitCode(report.status);
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
