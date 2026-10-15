import { buildGuidanceImpactReport } from "../guidance-impact/aggregate";
import { hashGuidanceSet } from "../../brand-taste/learned-guidance";
import { readGenerationIdentity, snapshotGenerationIdentity, type GenerationIdentity } from "../../output-learning/generation-identity";
import type { GuidanceImpactDecision, GuidanceImpactGeneration, GuidanceImpactReport } from "../guidance-impact/types";
import { validateGuidanceExperimentManifest, type GuidanceExperimentManifest } from "./manifest";

export interface GuidanceExperimentEvidence {
  origin: "simulated";
  generations: (GuidanceImpactGeneration & {
    arm: "treatment" | "control"; inputsHash: string; generatedAt: string;
  })[];
  decisions: GuidanceImpactDecision[];
}

interface ControlledGuidanceExperimentProvider {
  kind: "controlled";
  read: (manifest: GuidanceExperimentManifest) => Promise<GuidanceExperimentEvidence>;
}

type ExperimentReportResult = {
  realExecutionAllowed: false;
  realExecutionBlock: "d4_pending_704";
} & ({ ok: false; failures: string[] } | {
  ok: true; origin: "simulated"; conclusion: "simulated_only"; report: GuidanceImpactReport;
});

function matchesArm(identity: GenerationIdentity, brand: GuidanceExperimentManifest["brands"][number], arm: "control" | "treatment"): boolean {
  if (identity.state !== "recorded" || identity.applications.length !== 1) return false;
  const application = identity.applications[0], expected = brand.arms[arm];
  return application.role === brand.role && application.fixedPromptVersion === expected.fixedPromptVersion
    && application.setHash === expected.setHash && hashGuidanceSet(application.appliedRefs) === expected.setHash;
}

/** Read-only simulation seam. No production provider, persistence or activation path exists before #704. */
export async function buildSimulatedGuidanceExperimentReport(input: {
  manifest: unknown; provider: ControlledGuidanceExperimentProvider; capturedAt: string;
}): Promise<ExperimentReportResult> {
  const validation = validateGuidanceExperimentManifest(input.manifest);
  if (!validation.ok) return validation;
  const gate = { realExecutionAllowed: validation.realExecutionAllowed, realExecutionBlock: validation.realExecutionBlock };
  if (input.provider.kind !== "controlled") return { ...gate, ok: false, failures: ["provider: controlled simulation required"] };
  const capturedAt = Date.parse(input.capturedAt);
  if (!Number.isFinite(capturedAt)) return { ...gate, ok: false, failures: ["capturedAt: invalid clock"] };
  const evidence = await input.provider.read(validation.manifest);
  if (evidence.origin !== "simulated") return { ...gate, ok: false, failures: ["origin: simulated evidence required"] };
  const { manifest } = validation;
  const failures: string[] = [];
  const seen = new Set<string>(), covered = new Set<string>();
  const generations = new Map(evidence.generations.map(item => [item.id, item]));
  const findBrand = (generation: GuidanceImpactGeneration) => manifest.brands.find(brand => brand.workspaceId === generation.workspaceId && brand.clientProfileId === generation.clientProfileId);
  const coverageKey = (brand: GuidanceExperimentManifest["brands"][number], contextId: string, arm: string) => JSON.stringify([brand.workspaceId, brand.clientProfileId, contextId, arm]);
  for (const generation of evidence.generations) {
    const brand = findBrand(generation);
    const holdout = brand?.holdout.find(item => item.contextId === generation.contextId && item.contextKind === generation.contextKind);
    if (!brand || !holdout || generation.format !== brand.format || generation.generationMode !== brand.generationMode
      || generation.inputsHash !== holdout.inputsHash) {
      failures.push(`${generation.id}: outside frozen holdout/inputs/scope`);
      continue;
    }
    if (seen.has(generation.id)) failures.push(`${generation.id}: duplicate generation`);
    seen.add(generation.id);
    const at = Date.parse(generation.generatedAt);
    if (!Number.isFinite(at) || at < Date.parse(manifest.window.startsAt) || at >= Date.parse(manifest.window.endsAt) || at > capturedAt) failures.push(`${generation.id}: outside window/capture`);
    if (generation.arm !== "control" && generation.arm !== "treatment") {
      failures.push(`${generation.id}: unknown arm`);
      continue;
    }
    const situation = Array.isArray(generation.applications) ? generation.applications[0]?.situation : null;
    if (situation !== (generation.arm === "treatment" ? "applied" : "no_guidance")
      || !matchesArm(snapshotGenerationIdentity(generation.applications), brand, generation.arm)) failures.push(`${generation.id}: application differs from frozen arm`);
    covered.add(coverageKey(brand, holdout.contextId, generation.arm));
  }
  for (const brand of manifest.brands) for (const item of brand.holdout) for (const arm of ["control", "treatment"]) {
    if (!covered.has(coverageKey(brand, item.contextId, arm))) failures.push(`${item.contextId}: missing ${arm} arm`);
  }
  for (const decision of evidence.decisions) {
    const generation = generations.get(decision.generationId), brand = generation && findBrand(generation);
    if (!generation || !brand || (decision.snapshot.format != null && decision.snapshot.format !== generation.format)
      || (decision.snapshot.generationMode != null && decision.snapshot.generationMode !== generation.generationMode)
      || (generation.arm !== "control" && generation.arm !== "treatment")
      || !matchesArm(readGenerationIdentity(decision.snapshot.generationIdentity), brand, generation.arm)) failures.push(`${decision.id}: decision differs from frozen arm`);
  }
  if (failures.length) return { ...gate, ok: false, failures };
  const report = buildGuidanceImpactReport({ ...evidence, capturedAt: input.capturedAt });
  return { ...gate, ok: true, origin: "simulated", conclusion: "simulated_only", report };
}
