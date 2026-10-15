import { validateGuidanceExperimentManifest } from "./manifest";

interface ExperimentLearningEvidence {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  contextId: string;
}

/** Simulation only. A window ending does not release holdout evidence into learning. */
export function partitionGuidanceExperimentLearningEvidence<T extends ExperimentLearningEvidence>(input: {
  manifest: unknown; evidence: T[]; asOf: string;
}): { eligible: T[]; withheld: T[] } {
  const result = validateGuidanceExperimentManifest(input.manifest);
  if (!result.ok) throw new Error(result.failures.join("; "));
  const now = Date.parse(input.asOf);
  if (!Number.isFinite(now)) throw new Error("asOf: invalid clock");
  const { manifest } = result;
  const eligible: T[] = [], withheld: T[] = [];
  const closed = manifest.closedAt !== null && now >= Date.parse(manifest.closedAt);
  const sources = new Set(manifest.brands.flatMap(brand => brand.holdout.flatMap(item => item.evidenceIds)));
  for (const evidence of input.evidence) {
    const holdout = sources.has(evidence.id) || manifest.brands.some(brand => brand.workspaceId === evidence.workspaceId
      && brand.clientProfileId === evidence.clientProfileId && brand.holdout.some(item => item.contextId === evidence.contextId));
    (holdout && !closed ? withheld : eligible).push(evidence);
  }
  return { eligible, withheld };
}
