// Free-account balance rules for work that STARTS more AI spend than one call (ticket 08).
// The per-call admission (budgeted-client.ts) stays the strict guarantee; these helpers only
// keep a flow from being started when the cap could not finish it.

import { env } from "@/server/validation/env";
import type { FreeBudgetReader } from "../module/ports";
import { freeBudgetUsdCents } from "./free-budget";
import { maximumCallCostUsdCents, type LedgerStore } from "./ledger";
import { resolveStrategistModel } from "./roles";

/** The diagnosis reserve when none is configured: the measured proposal (10 cents, see ticket 08 notes). */
export const DIAGNOSIS_MEASURED_RESERVE_USD_CENTS = 10;

/** What one more diagnosis must be able to spend: the configured reserve, or the measured value when unset. */
export function diagnosisAttemptRequirementUsdCents() {
  return Math.min(freeBudgetUsdCents(), Number(env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS ?? DIAGNOSIS_MEASURED_RESERVE_USD_CENTS));
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
