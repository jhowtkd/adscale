import type { CreativeHardFailureCode } from "../creative-quality-gate";

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
