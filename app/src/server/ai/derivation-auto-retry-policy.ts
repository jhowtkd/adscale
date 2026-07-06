import type { CreativeContract } from "./creative-contract";
import { RETRYABLE_OBJECTIVE_FAILURE_CODES, type ObjectiveIntegrityFailureCode } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { normalizeHardFailureCode } from "./creative-quality-gate";

// Only objective, machine-verifiable failures warrant an automatic retry.
// Subjective/advisory findings (cta_drift, visual_overload, etc.) surface as
// polish suggestions instead of triggering regeneration.

export function shouldAutoRetryDerivation(
  _generationMode: CreativeContract["generationMode"],
  hardFailures: CreativeHardFailure[] | null | undefined,
  autoRetryAttempted?: boolean
): boolean {
  if (autoRetryAttempted) return false;
  if (!hardFailures?.length) return false;

  return hardFailures.some((failure) =>
    RETRYABLE_OBJECTIVE_FAILURE_CODES.has(
      normalizeHardFailureCode(failure.code) as ObjectiveIntegrityFailureCode
    )
  );
}
