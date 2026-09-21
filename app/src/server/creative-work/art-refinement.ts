import { z } from "zod";

/**
 * Art direction critique + bounded automatic refinement (plan 04).
 * Pure module: no I/O, no provider calls. A new image is justified only by
 * a concrete problem, a concrete intervention and visible evidence — never
 * by a bare score or a generic aesthetic preference.
 */

export const ART_REFINEMENT_VERSION = 1 as const;
export const ART_REFINEMENT_MAX_REVISIONS_PER_ROOT = 2 as const;
/** Root + two revisions: at most 3 canonical units per initial output. */
export const ART_REFINEMENT_UNITS_PER_ROOT = 3 as const;

/** Literal instruction for the contextual art-direction critique. */
export const ART_DIRECTION_CRITIQUE_INSTRUCTION =
  "Avalie se a composição resolve a mensagem. Localize um problema concreto de " +
  "hierarquia, foco, integração da pessoa, tipografia, recorte, perspectiva, " +
  "iluminação ou acabamento. Cite evidência visível e proponha uma intervenção. " +
  "Se a estrutura inteira for fraca, proponha outra composição. Preserve os " +
  "fatos, a identidade, as características anatômicas e os invariantes aprovados. " +
  "Uma preferência estética genérica ou nota isolada não justifica nova imagem.";

export const artCritiqueSchema = z.object({
  verdict: z.enum(["ready", "weak", "inconclusive"]),
  problem: z.string().trim().max(1000),
  intervention: z.string().trim().max(1000),
  mode: z.enum(["edit", "recompose"]),
  preserve: z.array(z.string().trim().min(1).max(300)).max(10),
  evidence: z.array(z.string().trim().min(1).max(300)).max(10),
  confidence: z.enum(["low", "medium", "high"]),
}).superRefine((value, context) => {
  if (value.verdict !== "weak") return;
  if (value.problem.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["problem"], message: "weakCritiqueRequiresProblem" });
  }
  if (value.intervention.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["intervention"], message: "weakCritiqueRequiresIntervention" });
  }
  if (value.evidence.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidence"], message: "weakCritiqueRequiresEvidence" });
  }
});
export type ArtCritique = z.infer<typeof artCritiqueSchema>;

export const refinementCandidateSchema = z.object({
  id: z.string().trim().min(1),
  objective: z.enum(["pass", "fail", "inconclusive"]),
  humanReviewRequired: z.boolean(),
  critique: artCritiqueSchema,
});
export type RefinementCandidate = z.infer<typeof refinementCandidateSchema>;

export const artComparisonSchema = z.object({
  preferredId: z.string().trim().min(1).nullable(),
  reason: z.string().trim().min(1).max(1000),
  fixedIssues: z.array(z.string().trim().min(1).max(300)).max(10),
  regressions: z.array(z.string().trim().min(1).max(300)).max(10),
});
export type ArtComparison = z.infer<typeof artComparisonSchema>;

/** Frozen per-work refinement budget accepted by the user before generation. */
export const artRefinementBudgetSchema = z.object({
  version: z.literal(ART_REFINEMENT_VERSION),
  maxRevisionsPerRoot: z.literal(ART_REFINEMENT_MAX_REVISIONS_PER_ROOT),
  acceptedCreditCeiling: z.number().int().nonnegative(),
  acceptedBy: z.string().trim().min(1),
  acceptedAt: z.string().trim().min(1),
});
export type ArtRefinementBudget = z.infer<typeof artRefinementBudgetSchema>;

/**
 * Persisted pairwise verdict of the multimodal judge. Completed versions are
 * immutable, so a verdict keyed by (before, after, brief) never changes and
 * later refreshes reuse it instead of re-running the vision call.
 */
export const artComparisonVerdictSchema = z.object({
  preferredId: z.string().trim().min(1).nullable(),
});
export type ArtComparisonVerdict = z.infer<typeof artComparisonVerdictSchema>;

export const artRefinementStateSchema = z.object({
  recommendedOutputIds: z.array(z.string().trim().min(1)),
  status: z.enum(["running", "ready", "budget_exhausted", "needs_review"]),
  issues: z.array(z.string().trim().min(1).max(300)).max(10),
  comparisons: z.record(z.string().min(1), artComparisonVerdictSchema).optional(),
});
export type ArtRefinementState = z.infer<typeof artRefinementStateSchema>;

/** Cache key of one pairwise verdict: `${beforeId}:${afterId}:${briefHash}`. */
export function artComparisonKey(beforeId: string, afterId: string, briefHash: string): string {
  return `${beforeId}:${afterId}:${briefHash}`;
}

export function resolveArtCritique(value: unknown): ArtCritique | null {
  const parsed = artCritiqueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveArtRefinementBudget(value: unknown): ArtRefinementBudget | null {
  const parsed = artRefinementBudgetSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveArtRefinementState(value: unknown): ArtRefinementState | null {
  const parsed = artRefinementStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Gate for one automatic revision. Calibration works never refine; an
 * objective fail/inconclusive never refines (the objective path owns it);
 * anything below high confidence — or without a concrete
 * problem/intervention/evidence — never justifies a new image.
 */
export function shouldRefine(input: {
  critique: ArtCritique;
  usedRevisions: number;
  isCalibration: boolean;
  objective: "pass" | "fail" | "inconclusive";
}): boolean {
  const critique = input.critique;
  return !input.isCalibration
    && input.objective === "pass"
    && Number.isInteger(input.usedRevisions)
    && input.usedRevisions >= 0
    && input.usedRevisions < ART_REFINEMENT_MAX_REVISIONS_PER_ROOT
    && critique.verdict === "weak"
    && critique.confidence === "high"
    && critique.problem.trim().length > 0
    && critique.intervention.trim().length > 0
    && critique.evidence.length > 0;
}

/**
 * Best valid candidate for presentation. Objectively rejected outputs and
 * outputs pending human review are never eligible — not even when preferred.
 * `preferredId` must come from a validated comparison between presented IDs,
 * never from an arbitrary client/model value (callers validate membership).
 */
export function chooseBestCandidate(
  candidates: readonly RefinementCandidate[],
  preferredId: string | null,
): RefinementCandidate | null {
  const valid = candidates.filter(
    (candidate) => candidate.objective === "pass" && !candidate.humanReviewRequired,
  );
  return valid.find((candidate) => candidate.id === preferredId)
    ?? valid.find((candidate) => candidate.critique.verdict === "ready")
    ?? valid[0]
    ?? null;
}

/** Deterministic revision key: one idempotent claim per root + attempt. */
export function artRefinementRevisionKey(input: {
  workId: string;
  /** Output root id or carousel slide root id — unique per work either way. */
  rootId: string;
  attempt: number;
}): string {
  return `art-refinement:${input.workId}:${input.rootId}:${input.attempt}`;
}

/** Max canonical units for n initial outputs (root + 2 revisions each). */
export function artRefinementMaxUnits(initialOutputCount: number): number {
  if (!Number.isInteger(initialOutputCount) || initialOutputCount < 0) return 0;
  return initialOutputCount * ART_REFINEMENT_UNITS_PER_ROOT;
}

/**
 * Canonical units of one carousel slide revision. Rebuilding the anchor
 * forces every dependent slide to rebuild, so all of them must be claimed
 * in the same transaction before the anchor revision starts.
 */
export function carouselRevisionUnits(input: {
  changesAnchor: boolean;
  dependentSlides: number;
}): number {
  if (!Number.isInteger(input.dependentSlides) || input.dependentSlides < 0) {
    throw new Error("invalid_dependent_slides");
  }
  return 1 + (input.changesAnchor ? input.dependentSlides : 0);
}

/** Root output id of a revision chain: revisions hang off their root. */
export function artRefinementRootId(output: {
  id: string;
  parentOutputId: string | null;
}): string {
  return output.parentOutputId ?? output.id;
}

/** Directive prepended to a recompose revision instruction (internal only). */
export const RECOMPOSE_INSTRUCTION_PREFIX =
  "RECOMPOSE from the original briefing, photos and brand instead of editing the parent pixels; " +
  "the parent shows what to move away from, not what to keep. Preserve every required fact, " +
  "the identity, the anatomy and the approved brand elements. ";

/**
 * Effective revision mode. Recompose never escapes original-preservation:
 * under format_adaptation/restyle the mode is constrained to edit (only the
 * editable elements move), so a critique that only a preservation violation
 * would fix cannot trigger it.
 */
export function resolveRevisionCompositionMode(
  critiqueMode: ArtCritique["mode"],
  protocolMode: string | null | undefined,
): "edit" | "recompose" {
  if (protocolMode === "format_adaptation" || protocolMode === "restyle" || protocolMode === "restyling") {
    return "edit";
  }
  return critiqueMode;
}
