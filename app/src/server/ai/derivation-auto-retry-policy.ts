import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { normalizeHardFailureCode } from "./creative-quality-gate";

// Only objective, machine-verifiable failures warrant an automatic retry.
// Subjective/advisory findings (cta_drift, visual_overload, etc.) surface as
// polish suggestions instead of triggering regeneration.
const RETRYABLE_OBJECTIVE_FAILURES: ReadonlySet<CreativeHardFailure["code"]> = new Set([
  "wrong_brand",
  "unsupported_offer",
  "invented_factual_entity",
  "style_reference_contamination",
  "replaced_source_subject",
  "unauthorized_brand_or_ip",
  "cropped_critical_content",
  "invalid_format_layout",
]);

export function shouldAutoRetryDerivation(
  _generationMode: CreativeContract["generationMode"],
  hardFailures: CreativeHardFailure[] | null | undefined,
  autoRetryAttempted?: boolean
): boolean {
  if (autoRetryAttempted) return false;
  if (!hardFailures?.length) return false;

  return hardFailures.some((failure) =>
    RETRYABLE_OBJECTIVE_FAILURES.has(normalizeHardFailureCode(failure.code))
  );
}
