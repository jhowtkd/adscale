import type { CreativeHardFailure } from "./creative-quality-gate";

const RETRYABLE_FAILURE_CODES = new Set<CreativeHardFailure["code"]>([
  "cta_drift",
  "unreadable_required_text",
]);

export function shouldAutoRetryDerivation(
  hardFailures: CreativeHardFailure[] | null | undefined,
  autoRetryAttempted?: boolean
): boolean {
  if (autoRetryAttempted) return false;
  if (!hardFailures?.length) return false;
  return hardFailures.some((f) => RETRYABLE_FAILURE_CODES.has(f.code));
}
