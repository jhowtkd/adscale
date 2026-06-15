import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { normalizeHardFailureCode } from "./creative-quality-gate";

const RETRYABLE_BY_MODE: Record<
  CreativeContract["generationMode"],
  ReadonlySet<CreativeHardFailure["code"]>
> = {
  art_variation: new Set([
    "cta_drift",
    "unreadable_required_text",
    "decorative_only_variation",
    "visual_overload",
  ]),
  format_adaptation: new Set([
    "cta_drift",
    "unreadable_required_text",
    "invalid_format_layout",
    "cropped_critical_content",
  ]),
  restyling: new Set([
    "style_reference_contamination",
    "cta_drift",
    "unreadable_required_text",
    "copied_style_reference_facts",
  ]),
};

export function shouldAutoRetryDerivation(
  generationMode: CreativeContract["generationMode"],
  hardFailures: CreativeHardFailure[] | null | undefined,
  autoRetryAttempted?: boolean
): boolean {
  if (autoRetryAttempted) return false;
  if (!hardFailures?.length) return false;

  const retryableCodes = RETRYABLE_BY_MODE[generationMode];
  return hardFailures.some((failure) =>
    retryableCodes.has(normalizeHardFailureCode(failure.code))
  );
}
