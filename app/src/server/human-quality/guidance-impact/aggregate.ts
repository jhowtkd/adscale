import { hashGuidanceSet } from "../../brand-taste/learned-guidance";
import { readGenerationIdentity, snapshotGenerationIdentity, type GenerationIdentityApplication } from "../../output-learning/generation-identity";
import { isHumanDecisionAuthor } from "../../output-learning/output-decision-author";
import type { GuidanceImpactDecision, GuidanceImpactGeneration, GuidanceImpactGroup, GuidanceImpactReport, GuidanceImpactSituation, ImpactRate } from "./types";

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
function sameIdentity(a: GenerationIdentityApplication, b: Attribution): boolean {
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
    for (const item of generationAttributions(generation.applications)) {
      const group = groupFor(generation, item);
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
    for (const item of decisionAttributions(decision, generation)) {
      const group = groupFor(generation, item);
      if (seen.has(group)) continue;
      seen.add(group);
      for (const name of ["humanApproval", "rejection", "adjustment"] as const) {
        group[name] = rate(group[name].numerator + Number(name === metric), group[name].denominator + 1);
      }
    }
  }
  return { schemaVersion: 1, mechanism: "guidance_revisions", capturedAt: input.capturedAt,
    decisionDenominator: "explicit_human_decision_events", groups: [...groups.values()] };
}
