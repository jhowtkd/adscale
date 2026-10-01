// Free-account balance rules for work that STARTS more AI spend than one call (ticket 08).
// The per-call admission (budgeted-client.ts) stays the strict guarantee; these helpers only
// keep a flow from being started when the cap could not finish it.

import type { FreeBudgetReader } from "../module/ports";
import { DIAGNOSIS_MEASURED_RESERVE_USD_CENTS, diagnosticReserveUsdCents, freeBudgetUsdCents } from "./free-budget";
import { maximumCallCostUsdCents, type LedgerStore } from "./ledger";
import { resolveStrategistModel } from "./roles";

export { DIAGNOSIS_MEASURED_RESERVE_USD_CENTS };

/** What one more diagnosis must be able to spend: the same reserve the chat leaves untouched (free-budget.ts), so the two places can never disagree. */
export function diagnosisAttemptRequirementUsdCents() {
  return diagnosticReserveUsdCents();
}

/** Admission maximum of the largest reading call (Instagram vision: 4 verified images, 2048 output tokens, ~25k-token bound). */
export function readingMaxAdmissionUsdCents() {
  return maximumCallCostUsdCents(resolveStrategistModel(), 25_000, 2_048) ?? 20;
}

/**
 * Reopening the source re-reserves the diagnosis under the strict cap: the balance must cover one
 * more reading and the diagnosis that follows it, or nothing starts (and no model is called).
 */
export function sourceCorrectionRequirementUsdCents() {
  return diagnosisAttemptRequirementUsdCents() + readingMaxAdmissionUsdCents();
}

export function createFreeBudgetReader(ledger: Pick<LedgerStore, "lifetimeTotalCostUsdCents">): FreeBudgetReader {
  return {
    async remainingUsdCents(scope) {
      return Math.max(0, freeBudgetUsdCents() - await ledger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId));
    },
  };
}
