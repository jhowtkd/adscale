import {
  personFidelitySelectionGate,
  resolvePersonFidelity,
} from "@/server/creative-work/person-fidelity";

export type CreativeWorkObjectiveVerdict = "pass" | "fail" | "inconclusive";
export type CreativeWorkSelectionVerdict = CreativeWorkObjectiveVerdict | "legacy";

export type CreativeWorkSelectionPolicy = {
  verdict: CreativeWorkSelectionVerdict;
  selectable: boolean;
  requiresConfirmation: boolean;
  rationale: "objective_pass" | "objective_fail" | "objective_inconclusive" | "objective_legacy" | "objective_legacy_fail";
  nextStep: "approve" | "generate_again" | "review_then_confirm";
};

export function getCreativeWorkObjectiveVerdict(
  quality: unknown,
): CreativeWorkObjectiveVerdict | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const payload = quality as Record<string, unknown>;
  if (payload.schemaVersion !== 1) return null;
  const verdict = payload.objectiveVerdict;
  return verdict === "pass" || verdict === "fail" || verdict === "inconclusive"
    ? verdict
    : null;
}

export function getCreativeWorkSelectionPolicy(
  quality: unknown,
  outputId?: string | null,
): CreativeWorkSelectionPolicy {
  const base = getCreativeWorkObjectiveSelectionPolicy(quality);
  if (!base.selectable) return base;
  // Named-person fidelity (plan 03, T3): a confirmed mismatch always blocks
  // selection, and doubt blocks approval until the specific human review bound
  // to THIS output and reference hash is recorded. The generic
  // confirmObjective never bypasses either state. Without an outputId the
  // binding cannot be verified, so doubt stays blocking (conservative).
  const gate = personFidelitySelectionGate(resolvePersonFidelity(quality), outputId ?? null);
  if (gate === null || gate === "selectable") return base;
  if (gate === "blocked") {
    return {
      verdict: base.verdict,
      selectable: false,
      requiresConfirmation: false,
      rationale: "objective_fail",
      nextStep: "generate_again",
    };
  }
  return {
    verdict: base.verdict,
    selectable: false,
    requiresConfirmation: false,
    rationale: "objective_inconclusive",
    nextStep: "review_then_confirm",
  };
}

function getCreativeWorkObjectiveSelectionPolicy(
  quality: unknown,
): CreativeWorkSelectionPolicy {
  const verdict = getCreativeWorkObjectiveVerdict(quality) ?? "legacy";
  if (verdict === "pass") {
    return {
      verdict,
      selectable: true,
      requiresConfirmation: false,
      rationale: "objective_pass",
      nextStep: "approve",
    };
  }
  if (verdict === "fail") {
    return {
      verdict,
      selectable: false,
      requiresConfirmation: false,
      rationale: "objective_fail",
      nextStep: "generate_again",
    };
  }
  const legacy = quality && typeof quality === "object" && !Array.isArray(quality)
    ? quality as Record<string, unknown>
    : null;
  if (verdict === "legacy" && (
    legacy?.qualityVerdict === "invalid"
    || legacy?.verdict === "invalid"
    || (Array.isArray(legacy?.hardFailures) && legacy.hardFailures.length > 0)
  )) {
    return {
      verdict,
      selectable: false,
      requiresConfirmation: false,
      rationale: "objective_legacy_fail",
      nextStep: "generate_again",
    };
  }
  return {
    verdict,
    selectable: true,
    requiresConfirmation: true,
    rationale: verdict === "inconclusive" ? "objective_inconclusive" : "objective_legacy",
    nextStep: "review_then_confirm",
  };
}

export function getCreativeWorkEvaluatorSummary(
  quality: unknown,
): string | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const payload = quality as Record<string, unknown>;
  return typeof payload.evaluatorSummary === "string" && payload.evaluatorSummary.trim().length > 0
    ? payload.evaluatorSummary
    : null;
}

export type ArtRefinementPresentationStatus = "running" | "ready" | "budget_exhausted" | "needs_review";

export type ArtRefinementPresentation = {
  status: ArtRefinementPresentationStatus | null;
  issues: string[];
  isRecommended: boolean;
};

function asArtRefinementStatus(value: unknown): ArtRefinementPresentationStatus | null {
  return value === "running" || value === "ready" || value === "budget_exhausted" || value === "needs_review"
    ? value
    : null;
}

function asNonEmptyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Presentation-only read of the work refinement summary (plan 04, T3).
 * `isRecommended` is a display hint — never selection: approval, promotion
 * and reference-publishing keep their own guards and effects. Unknown or
 * malformed state resolves to "no recommendation" instead of failing.
 */
export function getArtRefinementPresentation(
  outputId: string | null | undefined,
  state: unknown,
): ArtRefinementPresentation {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { status: null, issues: [], isRecommended: false };
  }
  const payload = state as Record<string, unknown>;
  const status = asArtRefinementStatus(payload.status);
  if (!status) return { status: null, issues: [], isRecommended: false };
  const recommended = asNonEmptyStrings(payload.recommendedOutputIds);
  return {
    status,
    issues: asNonEmptyStrings(payload.issues).slice(0, 10),
    isRecommended: typeof outputId === "string" && outputId.length > 0 && recommended.includes(outputId),
  };
}

/** Validated weak-critique problem persisted on the output quality, if any. */
export function getArtRefinementIssue(quality: unknown): string | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const critique = (quality as Record<string, unknown>).artCritique;
  if (!critique || typeof critique !== "object" || Array.isArray(critique)) return null;
  const payload = critique as Record<string, unknown>;
  if (payload.verdict !== "weak") return null;
  const problem = typeof payload.problem === "string" ? payload.problem.trim() : "";
  const intervention = typeof payload.intervention === "string" ? payload.intervention.trim() : "";
  const evidence = asNonEmptyStrings(payload.evidence);
  if (problem.length === 0 || intervention.length === 0 || evidence.length === 0) return null;
  return problem.slice(0, 300);
}
