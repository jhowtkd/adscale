/**
 * Inventory of already-built intelligence switches. Do not enable a flag
 * because the code exists. Enable only with a SHA that has the evidence
 * listed here, and keep rollback as setting the env back to "false".
 */
export const INTELLIGENCE_ROLLOUT_FLAGS = [
  {
    env: "CREATIVE_WORK_QUALITY_RECOVERY_ENABLED",
    owner: "creative-work-quality",
    dependsOn: ["M01", "M07"],
    freezeField: "generationPolicyVersion",
    requiredEvidence: [
      "ten complete journeys across at least three brands",
      "objective QA pass/fail/inconclusive recorded",
      "idempotent refund on persistent objective failure",
    ],
    rollback: "set env to false and redeploy; in-flight work keeps the frozen snapshot",
  },
  {
    env: "BRAND_CORTEX_SINGLE_PIECE_ENABLED",
    owner: "brand-identity",
    dependsOn: ["M01", "M07", "M08"],
    freezeField: "includePublishedBrandKnowledge",
    requiredEvidence: [
      "Peça única with published brand knowledge on and off",
      "no leakage into restyle/variations/format_adaptation",
      "identity defects not worse than the control SHA",
    ],
    rollback: "set env to false and redeploy; in-flight work keeps the frozen snapshot",
  },
] as const;

export type IntelligenceRolloutDecision = {
  ready: boolean;
  blockedReason: string | null;
};

export function intelligenceRolloutDecision(input: {
  evidenceCommitSha: string | null;
  rollbackDocumented: boolean;
  productionFlagValue: string;
}): IntelligenceRolloutDecision {
  if (input.productionFlagValue === "true" && !input.evidenceCommitSha) {
    return { ready: false, blockedReason: "flag_on_without_evidence_sha" };
  }
  if (!input.rollbackDocumented) {
    return { ready: false, blockedReason: "rollback_not_documented" };
  }
  if (!input.evidenceCommitSha) {
    return { ready: false, blockedReason: "waiting_for_evidence_sha" };
  }
  return { ready: true, blockedReason: null };
}

/** Rollback: set the env to "false" and redeploy. In-flight work keeps the frozen snapshot. */
export function intelligenceRollbackValue(): "false" {
  return "false";
}
