/**
 * Quality-recovery blind package builder (ICE-05A). Emits the gate-evidence
 * scaffold for ten journeys — two per protocol — with seeded-random blind
 * assignments and every human field null. The builder invents nothing: no
 * preference, no reviewer identity, no authorization. Humans fill verdicts
 * against real artifacts; the existing gate checker evaluates the result.
 *
 * Usage:
 *   npx tsx scripts/build-quality-recovery-blind-package.ts <spec.json> <out.json>
 *
 * Exit codes: 0 package written, 1 invalid spec or unwritable output.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export const PACKAGE_PROTOCOLS = [
  "single",
  "variations",
  "format_adaptation",
  "restyle",
  "carousel",
] as const;

export const PACKAGE_MANDATORY_CASES = [
  "psicologia_fact_preservation",
  "xtb_content_style_identity_separation",
  "nr1_three_format_adaptation",
  "carousel_slide_sequence",
  "studio_edit_preserves_copy",
  "safe_margins",
] as const;

const COMPARISON_SOURCES = ["production_snapshot", "direct_generation", "creative_work_v1"] as const;
const BLIND_OPTIONS = ["A", "B", "C"] as const;

export const blindPackageSpecSchema = z.object({
  schemaVersion: z.literal(1),
  /** Recorded seed: the same spec always shuffles the same assignments. */
  seed: z.string().min(1),
  journeys: z
    .array(
      z.object({
        id: z.string().min(1),
        protocol: z.enum(PACKAGE_PROTOCOLS),
        brand: z.string().min(1),
        segment: z.string().min(1),
        mandatoryCase: z.enum(PACKAGE_MANDATORY_CASES).nullable(),
        plannedOutputs: z.number().int().positive(),
      }),
    )
    .length(10),
});

export type BlindPackageSpec = z.infer<typeof blindPackageSpecSchema>;

/** Deterministic string hash (xfnv1a) feeding the seeded shuffle. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Seeded PRNG (mulberry32): same seed, same assignment order, everywhere. */
export function seededRandom(state: number): () => number {
  let current = state >>> 0;
  return () => {
    current = (current + 0x6d2b79f5) >>> 0;
    let mixed = current;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleBlindAssignments(seed: string, journeyId: string): Record<string, string> {
  const random = seededRandom(hashSeed(`${seed}:${journeyId}`));
  const sources = [...COMPARISON_SOURCES];
  for (let index = sources.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const current = sources[index]!;
    sources[index] = sources[pick]!;
    sources[pick] = current;
  }
  return Object.fromEntries(BLIND_OPTIONS.map((option, index) => [option, sources[index]!]));
}

export type BlindPackageJourney = {
  id: string;
  protocol: (typeof PACKAGE_PROTOCOLS)[number];
  brand: string;
  segment: string;
  mandatoryCase: (typeof PACKAGE_MANDATORY_CASES)[number] | null;
  reviewerId: null;
  reviewedAt: null;
  plannedOutputs: number;
  terminalCoherentOutputs: null;
  regressions: { factual: number; brand: number; dimension: number };
  objectiveVerdict: null;
  inconclusiveResolution: null;
  blindComparison: {
    options: string[];
    assignmentsRevealed: boolean;
    assignments: Record<string, string>;
    preferenceVsProduction: null;
    preferenceVsDirect: null;
    /** Filled by the human reviewer: human only, never agent or auto_score. */
    preferenceProvenance: { vsProduction: null; vsDirect: null };
  };
  mandatoryAssertions: Record<string, never>;
};

export function buildBlindPackage(spec: BlindPackageSpec): {
  schemaVersion: 1;
  gate: "creative_work_quality_recovery";
  status: "pending_human_review";
  randomization: { seed: string; algorithm: "mulberry32-xfnv1a" };
  budgetApproval: { approvedBy: null; approvedAt: null; reference: null };
  evidenceWindow: { startedAt: null; endedAt: null };
  journeys: BlindPackageJourney[];
  technicalMetrics: {
    outputDurationsMs: [];
    batchDurationsMs: [];
    rssPeakMb: [];
    rssMeasurement: { process: null; instanceType: null; method: null };
    refinementCallCount: null;
    imageCallCounts: [];
    postgresReconciliation: {
      reconciledAt: null;
      method: null;
      terminalFailures: null;
      refundsIssued: null;
      unrefundedFailures: null;
      duplicateCharges: null;
      ledgerBalanced: null;
    };
  };
} {
  const parsed = blindPackageSpecSchema.parse(spec);
  const ids = parsed.journeys.map((journey) => journey.id);
  if (new Set(ids).size !== ids.length) throw new Error("journey ids must be unique");
  for (const protocol of PACKAGE_PROTOCOLS) {
    const count = parsed.journeys.filter((journey) => journey.protocol === protocol).length;
    if (count !== 2) {
      throw new Error(`protocol "${protocol}" needs exactly 2 journeys; got ${count}`);
    }
  }
  const cases = new Set(
    parsed.journeys.flatMap((journey) => (journey.mandatoryCase ? [journey.mandatoryCase] : [])),
  );
  const missing = PACKAGE_MANDATORY_CASES.filter((mandatoryCase) => !cases.has(mandatoryCase));
  if (missing.length > 0) {
    throw new Error(`mandatory cases missing from the spec: ${missing.join(", ")}`);
  }
  return {
    schemaVersion: 1,
    gate: "creative_work_quality_recovery",
    status: "pending_human_review",
    randomization: { seed: parsed.seed, algorithm: "mulberry32-xfnv1a" },
    budgetApproval: { approvedBy: null, approvedAt: null, reference: null },
    evidenceWindow: { startedAt: null, endedAt: null },
    journeys: parsed.journeys.map((journey) => ({
      id: journey.id,
      protocol: journey.protocol,
      brand: journey.brand,
      segment: journey.segment,
      mandatoryCase: journey.mandatoryCase,
      reviewerId: null,
      reviewedAt: null,
      plannedOutputs: journey.plannedOutputs,
      terminalCoherentOutputs: null,
      regressions: { factual: 0, brand: 0, dimension: 0 },
      objectiveVerdict: null,
      inconclusiveResolution: null,
      blindComparison: {
        options: [...BLIND_OPTIONS],
        assignmentsRevealed: false,
        assignments: shuffleBlindAssignments(parsed.seed, journey.id),
        preferenceVsProduction: null,
        preferenceVsDirect: null,
        preferenceProvenance: { vsProduction: null, vsDirect: null },
      },
      mandatoryAssertions: {},
    })),
    technicalMetrics: {
      outputDurationsMs: [],
      batchDurationsMs: [],
      rssPeakMb: [],
      rssMeasurement: { process: null, instanceType: null, method: null },
      refinementCallCount: null,
      imageCallCounts: [],
      postgresReconciliation: {
        reconciledAt: null,
        method: null,
        terminalFailures: null,
        refundsIssued: null,
        unrefundedFailures: null,
        duplicateCharges: null,
        ledgerBalanced: null,
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [specFile, outFile] = process.argv.slice(2);
  if (!specFile || !outFile) {
    console.error(
      "BLIND-PACKAGE: usage: build-quality-recovery-blind-package.ts <spec.json> <out.json>",
    );
    process.exitCode = 1;
  } else {
    try {
      const spec = JSON.parse(fs.readFileSync(specFile, "utf8")) as unknown;
      const pkg = buildBlindPackage(spec as BlindPackageSpec);
      fs.writeFileSync(outFile, `${JSON.stringify(pkg, null, 2)}\n`);
      console.log(`[blind-package] wrote ${outFile} (10 journeys, seed ${JSON.stringify(pkg.randomization.seed)})`);
    } catch (error) {
      console.error(
        `BLIND-PACKAGE: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}
