// Exceção de atendimento (support exception) machine — the only place where
// human support works. The account returns to the AI as soon as the case
// closes. Support staff never approve nor confirm facts for the client
// (enforced by actors.ts, which grants them neither action).

import { err, ok, type Result, type Transition } from "./result";

export type SupportExceptionStatus = "open" | "in_progress" | "closed";

export type SupportExceptionTrigger =
  | "client_requested_person" // "Falar com uma pessoa"
  | "stalled_implantation" // 7 business days without progress
  | "stuck_connection" // Two failed attempts or 3 business days stuck
  | "unresolved_fact_conflict" // Not solved in two questions
  | "repeated_silence" // Three batches missing windows, or 2nd inconclusive round
  | "out_of_contract_request" // Commercial exception
  | "dissatisfaction_signal" // Complaint, negative tone
  | "production_fix" // A person must produce a corrected piece
  | "cancel_request" // Client asks to cancel
  | "critical_incident" // Critical or cross-account incident
  | "off_app_material"; // Material only exists outside the app

export type SupportExceptionCloseReason =
  | "resolved"
  | "commercial_forwarded"
  | "client_no_response";

export type SupportExceptionState = {
  status: SupportExceptionStatus;
  trigger: SupportExceptionTrigger;
  assignee: string | null;
};

export type SupportExceptionEvent =
  | { type: "support_exception.opened"; trigger: SupportExceptionTrigger }
  | { type: "support_exception.assumed"; staffId: string }
  | { type: "support_exception.closed"; reason: SupportExceptionCloseReason };

export function openSupportException(trigger: SupportExceptionTrigger): SupportExceptionState {
  return { status: "open", trigger, assignee: null };
}

/** A support person joins the conversation (with name and photo, in the UI). */
export function assumeSupportException(
  state: SupportExceptionState,
  staffId: string,
): Result<Transition<SupportExceptionState, SupportExceptionEvent>> {
  if (state.status !== "open") {
    return err("invalid_transition", `cannot assume support exception from ${state.status}`);
  }
  return ok({
    state: { ...state, status: "in_progress", assignee: staffId },
    events: [{ type: "support_exception.assumed", staffId }],
  });
}

/** Close and hand the account back to the AI. */
export function closeSupportException(
  state: SupportExceptionState,
  reason: SupportExceptionCloseReason,
): Result<Transition<SupportExceptionState, SupportExceptionEvent>> {
  if (state.status !== "in_progress") {
    return err("invalid_transition", `cannot close support exception from ${state.status}`);
  }
  return ok({
    state: { ...state, status: "closed" },
    events: [{ type: "support_exception.closed", reason }],
  });
}

/**
 * First-response SLA: 2 h within business hours for critical incidents and
 * cancel requests, 1 business day for everything else. The caller turns the
 * business-day SLA into a deadline with the calendar.
 */
export function firstResponseSla(trigger: SupportExceptionTrigger): { hours: 2 } | { businessDays: 1 } {
  if (trigger === "critical_incident" || trigger === "cancel_request") {
    return { hours: 2 };
  }
  return { businessDays: 1 };
}
