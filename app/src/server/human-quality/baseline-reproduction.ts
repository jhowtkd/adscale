/**
 * Controlled-baseline reproduction check (ICE-05A).
 *
 * A controlled baseline is captured once (inputs + expected artifact
 * hashes); an independently authorized rerun reproduces it. This module
 * verifies the reproduction REPORT against the baseline — it never runs
 * billable generations itself. Both arms of every experiment run the same
 * inputs; a hash divergence fails the comparison before any human verdict
 * is weighed.
 */
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const baselineManifestSchema = z.object({
  schemaVersion: z.literal(1),
  baselineId: z.string().min(1),
  policyVersion: z.string().min(1),
  inputsHash: sha256Schema,
  capturedAt: z.string().datetime(),
  capturedBy: z.string().min(1),
  artifacts: z.array(
    z.object({
      artifactId: z.string().min(1),
      sha256: sha256Schema,
    }),
  ),
});

export const baselineReproductionSchema = z.object({
  schemaVersion: z.literal(1),
  baselineId: z.string().min(1),
  policyVersion: z.string().min(1),
  inputsHash: sha256Schema,
  runAt: z.string().datetime(),
  runBy: z.string().min(1),
  authorization: z.object({
    authorizedBy: z.string().min(1),
    authorizedAt: z.string().datetime(),
  }),
  artifacts: z.array(
    z.object({
      artifactId: z.string().min(1),
      sha256: sha256Schema,
    }),
  ),
});

export type BaselineManifest = z.infer<typeof baselineManifestSchema>;
export type BaselineReproduction = z.infer<typeof baselineReproductionSchema>;

export function verifyBaselineReproduction(
  baseline: unknown,
  reproduction: unknown,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const parsedBaseline = baselineManifestSchema.safeParse(baseline);
  const parsedReproduction = baselineReproductionSchema.safeParse(reproduction);
  if (!parsedBaseline.success) {
    failures.push(
      `baseline: ${parsedBaseline.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  if (!parsedReproduction.success) {
    failures.push(
      `reproduction: ${parsedReproduction.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  if (!parsedBaseline.success || !parsedReproduction.success) {
    return { ok: false, failures };
  }
  const base = parsedBaseline.data;
  const rerun = parsedReproduction.data;
  if (rerun.baselineId !== base.baselineId) {
    failures.push("reproduction targets another baseline");
  }
  if (rerun.policyVersion !== base.policyVersion) {
    failures.push("reproduction ran under another policy version");
  }
  if (rerun.inputsHash !== base.inputsHash) {
    failures.push("reproduction inputs diverge from the baseline inputs");
  }
  const expected = new Map(base.artifacts.map((artifact) => [artifact.artifactId, artifact.sha256]));
  const actual = new Map(rerun.artifacts.map((artifact) => [artifact.artifactId, artifact.sha256]));
  for (const [artifactId, sha256] of expected) {
    const rerunHash = actual.get(artifactId);
    if (rerunHash === undefined) {
      failures.push(`${artifactId}: missing from the reproduction`);
    } else if (rerunHash !== sha256) {
      failures.push(`${artifactId}: hash diverged from the baseline`);
    }
  }
  for (const artifactId of actual.keys()) {
    if (!expected.has(artifactId)) {
      failures.push(`${artifactId}: not part of the baseline`);
    }
  }
  return { ok: failures.length === 0, failures };
}
