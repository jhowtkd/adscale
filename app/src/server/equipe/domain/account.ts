// Conta (account) state machine — implantação to active, suspension, exit.
// "Conta ativa = a primeira frente liberada pela qualidade."

import { err, ok, type Result, type Transition } from "./result";

export type AccountStatus =
  | "free" // Grátis
  | "implantation" // Implantação
  | "implantation_paused" // Implantação pausada
  | "calibrating" // Em calibração
  | "active" // Ativa
  | "suspended" // Suspensa (inadimplência)
  | "scope_decision" // Decisão de escopo
  | "closed"; // Encerrada

export type AccountState = {
  status: AccountStatus;
};

export type AccountEvent =
  | { type: "account.entered_calibration"; from: "implantation" }
  | { type: "account.implantation_paused" }
  | { type: "account.implantation_resumed" }
  | { type: "account.activated"; releasedFrontId: string }
  | { type: "account.scope_decision_opened"; reason: string }
  | { type: "account.scope_reduced" }
  | { type: "account.suspended"; reason: string }
  | { type: "account.reactivated" }
  | { type: "account.closed"; from: AccountStatus };

export function initialAccountState(): AccountState {
  return { status: "implantation" };
}

function mustBe(state: AccountState, expected: AccountStatus, action: string): Result<void> {
  if (state.status !== expected) {
    return err("invalid_transition", `cannot ${action} from ${state.status}`);
  }
  return ok(undefined);
}

/** Entry checklist for "em calibração" (all must hold). */
export type CalibrationEntry = {
  planAndMandatesApproved: boolean;
  brandVoiceApproved: boolean;
  connectionsVerified: boolean;
  manualModeAgreed: boolean;
  secondInstallmentPaid: boolean;
};

export function enterCalibration(
  state: AccountState,
  entry: CalibrationEntry,
): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "implantation", "enter calibration");
  if (!gate.ok) return gate;
  const missing: string[] = [];
  if (!entry.planAndMandatesApproved) missing.push("plan_and_mandates");
  if (!entry.brandVoiceApproved) missing.push("brand_voice");
  if (!entry.connectionsVerified && !entry.manualModeAgreed) missing.push("connections_or_manual_mode");
  if (!entry.secondInstallmentPaid) missing.push("second_installment");
  if (missing.length > 0) {
    return err("calibration_entry_blocked", `calibration entry blocked: ${missing.join(", ")}`);
  }
  return ok({
    state: { status: "calibrating" },
    events: [{ type: "account.entered_calibration", from: "implantation" }],
  });
}

/** 10 business days without progress → "implantação pausada". */
export function pauseImplantation(state: AccountState): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "implantation", "pause implantation");
  if (!gate.ok) return gate;
  return ok({ state: { status: "implantation_paused" }, events: [{ type: "account.implantation_paused" }] });
}

export function resumeImplantation(state: AccountState): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "implantation_paused", "resume implantation");
  if (!gate.ok) return gate;
  return ok({ state: { status: "implantation" }, events: [{ type: "account.implantation_resumed" }] });
}

/** First front released by quality → account active. */
export function activateAccount(
  state: AccountState,
  releasedFrontId: string,
): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "calibrating", "activate account");
  if (!gate.ok) return gate;
  return ok({
    state: { status: "active" },
    events: [{ type: "account.activated", releasedFrontId }],
  });
}

/** No front passes within the limit → scope decision. */
export function openAccountScopeDecision(
  state: AccountState,
  reason: string,
): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "calibrating", "open scope decision");
  if (!gate.ok) return gate;
  return ok({
    state: { status: "scope_decision" },
    events: [{ type: "account.scope_decision_opened", reason }],
  });
}

/** Reduced scope → back to calibration. */
export function reduceAccountScope(state: AccountState): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "scope_decision", "reduce scope");
  if (!gate.ok) return gate;
  return ok({ state: { status: "calibrating" }, events: [{ type: "account.scope_reduced" }] });
}

/**
 * Delinquency suspension: future paid work stops; reading, export and
 * connection revocation continue (enforced by callers, not the machine).
 */
export function suspendForDelinquency(
  state: AccountState,
  reason: string,
): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "active", "suspend for delinquency");
  if (!gate.ok) return gate;
  return ok({
    state: { status: "suspended" },
    events: [{ type: "account.suspended", reason }],
  });
}

/** Regularized → active; callers revalidate held scheduled items. */
export function reactivateFromSuspension(state: AccountState): Result<Transition<AccountState, AccountEvent>> {
  const gate = mustBe(state, "suspended", "reactivate from suspension");
  if (!gate.ok) return gate;
  return ok({ state: { status: "active" }, events: [{ type: "account.reactivated" }] });
}

/** Contract exit, from active, suspended, or scope decision. */
export function closeAccount(state: AccountState): Result<Transition<AccountState, AccountEvent>> {
  if (state.status !== "active" && state.status !== "suspended" && state.status !== "scope_decision") {
    return err("invalid_transition", `cannot close account from ${state.status}`);
  }
  return ok({
    state: { status: "closed" },
    events: [{ type: "account.closed", from: state.status }],
  });
}
