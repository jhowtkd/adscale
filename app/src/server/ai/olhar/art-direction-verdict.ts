import type { CreativeHardFailureCode } from "../creative-quality-gate";
import type { ArtCritique } from "@/server/creative-work/art-refinement";

export type ArtDirectionVerdict = "pronta" | "quase" | "sem_opiniao" | "confusa";

export type ArtDirectionFailureReason =
  | "generic_template_aesthetic"
  | "decorative_only_variation"
  | "missing_dominant_idea"
  | "visual_overload";

export const ART_DIRECTION_FAILURE_REASONS: readonly ArtDirectionFailureReason[] = [
  "generic_template_aesthetic",
  "decorative_only_variation",
  "missing_dominant_idea",
  "visual_overload",
] as const;

export const ART_DIRECTION_FAILURE_TO_VERDICT: Record<
  ArtDirectionFailureReason,
  ArtDirectionVerdict
> = {
  generic_template_aesthetic: "sem_opiniao",
  decorative_only_variation: "sem_opiniao",
  missing_dominant_idea: "confusa",
  visual_overload: "confusa",
};

const ART_DIRECTION_FAILURE_SET = new Set<string>(ART_DIRECTION_FAILURE_REASONS);

/** Export/factual failures — not classified as art-direction verdicts. */
const EXPORT_ONLY_FAILURE_CODES = new Set<CreativeHardFailureCode>([
  "wrong_brand",
  "cta_drift",
  "unsupported_offer",
  "unreadable_required_text",
  "invalid_format_layout",
]);

/** Most severe first — deterministic tie-break when multiple art-direction failures coexist. */
const VERDICT_SEVERITY_ORDER: readonly ArtDirectionVerdict[] = [
  "confusa",
  "sem_opiniao",
  "quase",
  "pronta",
];

export interface ArtDirectionFailureInput {
  code: CreativeHardFailureCode | string;
  message: string;
}

function isArtDirectionFailureCode(
  code: string
): code is ArtDirectionFailureReason {
  return ART_DIRECTION_FAILURE_SET.has(code);
}

function mapFailureToVerdict(
  code: CreativeHardFailureCode | string
): ArtDirectionVerdict | null {
  if (!isArtDirectionFailureCode(code)) {
    return null;
  }

  return ART_DIRECTION_FAILURE_TO_VERDICT[code];
}

export function resolveArtDirectionVerdictFromFailures(
  failures: ArtDirectionFailureInput[]
): ArtDirectionVerdict | null {
  const verdicts = failures
    .map((failure) => mapFailureToVerdict(failure.code))
    .filter((verdict): verdict is ArtDirectionVerdict => verdict !== null);

  if (verdicts.length === 0) {
    return null;
  }

  for (const severity of VERDICT_SEVERITY_ORDER) {
    if (verdicts.includes(severity)) {
      return severity;
    }
  }

  return null;
}

export function isExportOnlyFailureCode(code: CreativeHardFailureCode | string): boolean {
  return EXPORT_ONLY_FAILURE_CODES.has(code as CreativeHardFailureCode);
}

/** Canonical intervention per art-direction failure (plan 04, T1). */
const ART_DIRECTION_INTERVENTIONS: Record<ArtDirectionFailureReason, string> = {
  generic_template_aesthetic: "Recompor com uma ideia dominante própria em vez da estética de template.",
  decorative_only_variation: "Manter a composição e variar tratamento, copy ou hierarquia com intenção.",
  missing_dominant_idea: "Eleger um elemento dominante e subordinar os demais a ele.",
  visual_overload: "Remover elementos secundários e dar respiro à hierarquia.",
};

/** Structural failures need another composition; the rest can be edited. */
const RECOMPOSE_REASONS: ReadonlySet<ArtDirectionFailureReason> = new Set([
  "generic_template_aesthetic",
  "missing_dominant_idea",
]);

/**
 * Build a structured art critique from existing QA failures only — no new
 * model call, no invented cause. Returns null when no art-direction failure
 * is present: absence of a confirmed composition problem is not a critique.
 * Export-only codes (wrong brand, CTA drift, …) never become art critiques.
 */
export function buildArtCritiqueFromFailures(
  failures: ArtDirectionFailureInput[],
): ArtCritique | null {
  const artFailures = failures.filter((failure) => isArtDirectionFailureCode(failure.code));
  if (artFailures.length === 0) return null;

  const messages = artFailures
    .map((failure) => failure.message.trim())
    .filter((message) => message.length > 0);
  const reasons = artFailures
    .map((failure) => failure.code as ArtDirectionFailureReason)
    .filter((reason, index, all) => all.indexOf(reason) === index);
  const problem = messages.join("; ").slice(0, 1000);
  if (problem.length === 0) return null;
  const intervention = reasons
    .map((reason) => ART_DIRECTION_INTERVENTIONS[reason])
    .join(" ")
    .slice(0, 1000);

  return {
    verdict: "weak",
    problem,
    intervention,
    mode: reasons.some((reason) => RECOMPOSE_REASONS.has(reason)) ? "recompose" : "edit",
    preserve: ["facts", "identity", "anatomy"],
    evidence: messages.map((message) => message.slice(0, 300)).slice(0, 10),
    confidence: "high",
  };
}
