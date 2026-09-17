/**
 * Experiment manifest for quality-release decisions (ICE-05A).
 *
 * One manifest binds one decision: the delivery SHA, a SINGLE changed
 * feature, its control, the equivalent inputs both ran, the data origin,
 * the human authorization, the verified traceability measurements, the
 * blind packages and the gate reports the conclusion rests on.
 *
 * Rejections are the point: two changed features, an incompatible
 * baseline, a missing origin, missing authorization, missing measurements
 * and — above all — an approval conclusion the evidence does not support.
 * Without authorization or data the outcome is a prepared package and a
 * blocked gate, never a release.
 */
import { z } from "zod";
import { DIAGNOSTIC_DATA_ORIGINS } from "@/server/diagnostics/contract";

export const EXPERIMENT_FEATURES = ["quality_recovery", "brand_cortex_single"] as const;
export type ExperimentFeature = (typeof EXPERIMENT_FEATURES)[number];

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const experimentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  experimentId: z.string().min(1),
  /** Delivery SHA under evaluation. */
  sha: gitShaSchema,
  /** Exactly one feature per experiment — never two. */
  changedFeatures: z.array(z.enum(EXPERIMENT_FEATURES)).min(1),
  control: z.object({
    kind: z.enum(["frozen_production", "direct_generation", "controlled_baseline"]),
    baselineId: z.string().min(1),
  }),
  baseline: z.object({
    id: z.string().min(1),
    policyVersion: z.string().min(1),
    schemaVersion: z.number().int(),
    inputsHash: sha256Schema,
    expectedPolicyVersion: z.string().min(1),
    expectedSchemaVersion: z.number().int(),
  }),
  /** Inputs both arms ran: one hash, one count, no divergence. */
  inputs: z.object({
    inputsHash: sha256Schema,
    count: z.number().int().positive(),
  }),
  /** Frozen traceability vocabulary — never absent, never invented. */
  origin: z.enum(DIAGNOSTIC_DATA_ORIGINS),
  authorization: z.object({
    authorizedBy: z.string().min(1).nullable(),
    authorizedAt: z.string().datetime().nullable(),
    scope: z.string().min(1),
  }),
  /**
   * Verified traceability measurements precede any approval. The OBS plan
   * owns collection; the manifest requires the verified report reference.
   */
  measurements: z
    .object({
      schemaVersion: z.number().int(),
      origin: z.enum(DIAGNOSTIC_DATA_ORIGINS),
      reportRef: z.string().min(1),
    })
    .nullable(),
  packages: z.array(
    z.object({
      kind: z.enum(["quality_recovery_blind", "brand_cortex_pilot"]),
      path: z.string().min(1),
      sha256: sha256Schema,
    }),
  ),
  gates: z.array(
    z.object({
      kind: z.enum(["quality_recovery", "brand_cortex_readiness"]),
      /**
       * quality_recovery: gate EVIDENCE ref — the validator re-runs the
       * checker's pure evaluation over it. brand_cortex_readiness: the
       * readiness REPORT ref — the validator requires status approved.
       */
      reportRef: z.string().min(1),
    }),
  ),
  conclusion: z.object({
    decision: z.enum(["approved", "rejected", "inconclusive", "pending"]),
    decidedBy: z.string().nullable(),
    decidedAt: z.string().datetime().nullable(),
    notes: z.string().nullable(),
  }),
});

export type ExperimentManifest = z.infer<typeof experimentManifestSchema>;

/** Injected file reads keep validation pure and unit-testable. */
export type ManifestReportReader = (ref: string) => unknown | null;

export type ManifestValidation = {
  ok: boolean;
  failures: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateExperimentManifest(
  input: unknown,
  readReport: ManifestReportReader,
  evaluateQualityRecoveryGate: (evidence: unknown) => { failures: string[] },
): ManifestValidation {
  const failures: string[] = [];
  const parsed = experimentManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`,
      ),
    };
  }
  const manifest = parsed.data;

  // One feature per experiment: two changed features invalidate every comparison.
  if (manifest.changedFeatures.length !== 1) {
    failures.push(
      `changedFeatures must list exactly one feature; got ${manifest.changedFeatures.length}`,
    );
  }

  // An incompatible baseline invalidates the control arm.
  if (
    manifest.baseline.policyVersion !== manifest.baseline.expectedPolicyVersion ||
    manifest.baseline.schemaVersion !== manifest.baseline.expectedSchemaVersion
  ) {
    failures.push("baseline is incompatible with the expected policy/schema version");
  }
  if (manifest.baseline.id !== manifest.control.baselineId) {
    failures.push("baseline id does not match the control baseline");
  }

  // Equivalent inputs: both arms ran the baseline's exact input set.
  if (manifest.inputs.inputsHash !== manifest.baseline.inputsHash) {
    failures.push("inputs hash does not match the baseline inputs: arms diverged");
  }

  const { decision } = manifest.conclusion;
  if (decision === "pending") {
    // A pending manifest is a prepared package, never a conclusion.
    return { ok: failures.length === 0, failures };
  }
  // No authorization, no decision: the gate stays blocked, never releasing.
  if (!isNonEmptyString(manifest.authorization.authorizedBy) || !manifest.authorization.authorizedAt) {
    failures.push("a decided conclusion requires authorization by a named human");
  }
  if (!isNonEmptyString(manifest.conclusion.decidedBy) || !manifest.conclusion.decidedAt) {
    failures.push("a decided conclusion requires decidedBy and decidedAt");
  }
  if (decision !== "approved") {
    if (!isNonEmptyString(manifest.conclusion.notes)) {
      failures.push("a rejected or inconclusive conclusion requires notes for audit");
    }
    return { ok: failures.length === 0, failures };
  }

  // Approval: every gate passes, measurements verified, human decided.
  for (const gate of manifest.gates) {
    const report = readReport(gate.reportRef);
    if (report === null) {
      failures.push(`${gate.kind}: report ref is missing or unreadable: ${gate.reportRef}`);
      continue;
    }
    if (gate.kind === "quality_recovery") {
      const record = asRecord(report);
      if (record?.status !== "completed") {
        failures.push("quality_recovery: gate evidence is not completed");
        continue;
      }
      const evaluation = evaluateQualityRecoveryGate(report);
      if (evaluation.failures.length > 0) {
        failures.push(
          `quality_recovery: gate fails (${evaluation.failures.length}): ${evaluation.failures[0]}`,
        );
      }
    } else {
      const record = asRecord(report);
      if (record?.status !== "approved") {
        failures.push("brand_cortex_readiness: report status is not approved");
      }
    }
  }
  if (manifest.gates.length === 0) {
    failures.push("approval requires at least one gate report");
  }
  const measurements = manifest.measurements;
  if (!measurements) {
    failures.push("approval requires verified traceability measurements");
  } else {
    const report = readReport(measurements.reportRef);
    const record = asRecord(report);
    if (!record) {
      failures.push(`measurements report is missing or unreadable: ${measurements.reportRef}`);
    } else {
      if (record.schemaVersion !== measurements.schemaVersion) {
        failures.push("measurements report schema version does not match the manifest");
      }
      if (record.origin !== measurements.origin || record.origin !== manifest.origin) {
        failures.push("measurements origin does not match the experiment origin");
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
