import { hashGuidanceSet } from "../../brand-taste/learned-guidance";
import { readGenerationIdentity, snapshotGenerationIdentity, type GenerationIdentityApplication } from "../../output-learning/generation-identity";
import { isHumanDecisionAuthor } from "../../output-learning/output-decision-author";
import { SAMPLE_ARM_MIN } from "../sampling/thresholds";
import type { GuidanceImpactComparison, GuidanceImpactDecision, GuidanceImpactGeneration, GuidanceImpactGroup, GuidanceImpactReport, GuidanceImpactSituation, ImpactRate } from "./types";

type Attribution = Pick<GuidanceImpactGroup, "role" | "situation" | "setHash" | "appliedRefs" | "fixedPromptVersion">;
const unknown = (): Attribution => ({ role: null, situation: "unknown", setHash: null, appliedRefs: [], fixedPromptVersion: "unknown" });
const rate = (numerator = 0, denominator = 0): ImpactRate => ({ numerator, denominator, value: denominator ? numerator / denominator : null });

function attribution(application: GenerationIdentityApplication, situation: unknown): Attribution {
  const valid = application.setHash === hashGuidanceSet(application.appliedRefs);
  const state: GuidanceImpactSituation = !valid ? "unknown"
    : situation === "applied" && application.appliedRefs.length ? "applied"
    : situation === "no_guidance" && !application.appliedRefs.length ? "control"
    : situation === "omitted" && !application.appliedRefs.length ? "omitted" : "unknown";
  return { ...application, situation: state };
}
function generationAttributions(value: unknown): Attribution[] {
  const identity = snapshotGenerationIdentity(value);
  if (identity.state === "unknown" || !Array.isArray(value)) return [unknown()];
  return identity.applications.map((application, index) => attribution(application, value[index]?.situation));
}
function sameIdentity(a: Pick<Attribution, "role" | "setHash" | "fixedPromptVersion">, b: Attribution): boolean {
  return a.role === b.role && a.setHash === b.setHash && a.fixedPromptVersion === b.fixedPromptVersion;
}
function decisionAttributions(decision: GuidanceImpactDecision, generation: GuidanceImpactGeneration): Attribution[] {
  const identity = readGenerationIdentity(decision.snapshot.generationIdentity);
  if (identity.state === "unknown") return [unknown()];
  const recorded = generationAttributions(generation.applications);
  return identity.applications.map(application => {
    // An applied decision is self-contained. Empty references alone do not prove a control.
    const matches = recorded.filter(item => sameIdentity(application, item));
    const situation = application.appliedRefs.length ? "applied"
      : matches.some(item => item.situation === "omitted") ? "omitted"
      : matches.some(item => item.situation === "control") ? "no_guidance" : "unknown";
    return attribution(application, situation);
  });
}

export function buildGuidanceImpactReport(input: {
  generations: GuidanceImpactGeneration[]; decisions: GuidanceImpactDecision[]; capturedAt: string;
}): GuidanceImpactReport {
  const groups = new Map<string, GuidanceImpactGroup>();
  const assessed = new Map<GuidanceImpactGroup, Set<string>>();
  const backgrounds = new Map<GuidanceImpactGroup, Set<string>>();
  function recordBackground(group: GuidanceImpactGroup, item: Attribution, items: Attribution[]) {
    const others = items.filter(other => !sameIdentity(other, item) || other.situation !== item.situation);
    const known = others.every(other => ["applied", "control"].includes(other.situation) && other.fixedPromptVersion !== "unknown");
    const signature = known ? JSON.stringify([...new Set(others.map(other =>
      JSON.stringify([other.role, other.situation, other.setHash, other.fixedPromptVersion])))].sort()) : "unknown";
    const signatures = backgrounds.get(group) ?? new Set<string>();
    signatures.add(signature);
    backgrounds.set(group, signatures);
  }
  function groupFor(generation: GuidanceImpactGeneration, item: Attribution): GuidanceImpactGroup {
    const scope = { workspaceId: generation.workspaceId, clientProfileId: generation.clientProfileId,
      generationMode: generation.generationMode, format: generation.format, contextId: generation.contextId, contextKind: generation.contextKind };
    const key = JSON.stringify([scope, item.role, item.situation, item.setHash, item.fixedPromptVersion]);
    let group = groups.get(key);
    if (!group) {
      group = { ...scope, ...item, generationCount: 0, humanApproval: rate(), rejection: rate(), adjustment: rate(), humanVisualScore: { value: null, denominator: 0 }, factualPass: rate() };
      groups.set(key, group);
    }
    return group;
  }
  const generations = new Map(input.generations.map(generation => [generation.id, generation]));
  for (const generation of generations.values()) {
    const seen = new Set<GuidanceImpactGroup>();
    const items = generationAttributions(generation.applications);
    for (const item of items) {
      const group = groupFor(generation, item);
      recordBackground(group, item, items);
      if (seen.has(group)) continue; // Retries/corrections are calls, not additional Peças or evaluations.
      seen.add(group);
      group.generationCount++;
      if (typeof generation.humanVisualScore === "number" && Number.isFinite(generation.humanVisualScore)) {
        const metric = group.humanVisualScore;
        metric.value = ((metric.value ?? 0) * metric.denominator + generation.humanVisualScore) / (metric.denominator + 1);
        metric.denominator++;
      }
      if (typeof generation.factualPass === "boolean") {
        group.factualPass = rate(group.factualPass.numerator + Number(generation.factualPass), group.factualPass.denominator + 1);
      }
    }
  }
  const seenDecisions = new Set<string>();
  for (const decision of input.decisions) {
    if (seenDecisions.has(decision.id) || !isHumanDecisionAuthor(decision)) continue;
    const metric = decision.action === "approved" ? "humanApproval" : decision.action === "rejected" ? "rejection"
      : decision.action === "regenerated" || decision.action === "layer_regenerated" ? "adjustment" : null;
    const generation = generations.get(decision.generationId);
    if (!metric || !generation) continue;
    seenDecisions.add(decision.id);
    const seen = new Set<GuidanceImpactGroup>();
    const items = decisionAttributions(decision, generation);
    for (const item of items) {
      const group = groupFor(generation, item);
      recordBackground(group, item, items);
      if (seen.has(group)) continue;
      seen.add(group);
      const ids = assessed.get(group) ?? new Set<string>();
      ids.add(generation.id);
      assessed.set(group, ids);
      for (const name of ["humanApproval", "rejection", "adjustment"] as const) {
        group[name] = rate(group[name].numerator + Number(name === metric), group[name].denominator + 1);
      }
    }
  }
  const rows = [...groups.values()];
  const comparisons = rows.flatMap((group, appliedGroupIndex) => {
    if (group.situation !== "applied") return [];
    const controlGroupIndex = rows.findIndex(other => other.situation === "control"
      && other.workspaceId === group.workspaceId && other.clientProfileId === group.clientProfileId
      && other.contextId === group.contextId && other.contextKind === group.contextKind
      && other.role === group.role && other.generationMode === group.generationMode && other.format === group.format
      && other.fixedPromptVersion === group.fixedPromptVersion);
    const control = rows[controlGroupIndex];
    const sample = (appliedCount: number, controlCount: number) => ({ appliedCount, controlCount,
      sufficient: appliedCount >= SAMPLE_ARM_MIN && controlCount >= SAMPLE_ARM_MIN });
    const metrics = {
      humanDecision: sample(assessed.get(group)?.size ?? 0, control ? assessed.get(control)?.size ?? 0 : 0),
      humanVisualScore: sample(group.humanVisualScore.denominator, control?.humanVisualScore.denominator ?? 0),
      factualPass: sample(group.factualPass.denominator, control?.factualPass.denominator ?? 0),
    };
    const status = Object.values(metrics).some(metric => metric.sufficient) ? "inconclusive" as const : "insufficient_sample" as const;
    const reasons: GuidanceImpactComparison["reasons"] = [];
    if (!control) reasons.push("missing_control");
    if (!group.role || !group.generationMode || !group.format) reasons.push("unknown_scope");
    if (group.fixedPromptVersion === "unknown") reasons.push("unknown_fixed_version");
    const background = backgrounds.get(group);
    const controlBackground = control && backgrounds.get(control);
    if (control && (background?.size !== 1 || controlBackground?.size !== 1
      || background.has("unknown") || [...background][0] !== [...controlBackground][0])) reasons.push("other_guidance_changed");
    const target: GuidanceImpactComparison["target"] = reasons.length || group.appliedRefs.some(ref => ref.revision === "legacy") ? "unisolated"
      : group.appliedRefs.length === 1 ? "revision" : "set";
    if (status === "insufficient_sample") reasons.push("insufficient_sample");
    return [{ appliedGroupIndex, controlGroupIndex: controlGroupIndex < 0 ? null : controlGroupIndex, status,
      target, reasons, metrics }];
  });
  return { schemaVersion: 1, mechanism: "guidance_revisions", capturedAt: input.capturedAt,
    decisionDenominator: "explicit_human_decision_events", groups: rows,
    status: comparisons.some(item => item.status === "inconclusive") ? "inconclusive" : "insufficient_sample",
    samplePolicy: { minimumPerArm: SAMPLE_ARM_MIN, unit: "distinct_generations_per_metric" }, comparisons };
}
