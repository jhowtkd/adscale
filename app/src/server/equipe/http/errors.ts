// Module Result errors → HTTP for the /api/equipe routes (#552).
//
// - forbidden_actor → 403 (the actor may not do this);
// - unknown_* → 404 (never reveal another account's existence — same
//   status either way);
// - invalid_* (minus invalid_transition) + incoherent-request codes → 400;
// - domain transition/state codes → 409 (valid request, illegal in the
//   current state — retry after the state changes);
// - anything else → 500, logged: either corrupt stored data or a module
//   code this adapter doesn't know yet, both fail loud.
//
// The module code rides the envelope `code` field so clients can switch
// on it; the human message goes in `details` (ids and states only).

import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import type { DomainError } from "../domain";

/** invalid_* minus invalid_transition, which is a state conflict (409). */
const INVALID_REQUEST_CODES = new Set([
  "invalid_source",
  "invalid_actor",
  "invalid_command",
  "invalid_context",
  "invalid_escalation_kind",
  "invalid_front",
  "invalid_schedule",
  "invalid_score",
  "invalid_signal",
]);

/**
 * Requests that are incoherent as formed — inconsistent references, a
 * void edit, the wrong command for the job. No state change fixes them;
 * only different input does.
 */
const BAD_REQUEST_CODES = new Set([
  "batch_front_mismatch",
  "cannot_merge_self",
  "connections_only_for_cross_account",
  "evidence_required",
  "front_mismatch",
  "front_required",
  "invalid_idea_payload",
  "item_not_in_round",
  "merge_requires_same_item",
  "no_change",
  "output_work_mismatch",
  "part_kind_required",
  "round_size_mismatch",
  "use_request_support",
  "wrong_front",
]);

/** Deliberate domain rejections: legal request, illegal transition/state. */
const CONFLICT_CODES = new Set([
  "reading_limit",
  "requires_plan",
  "automatic_publication_requires_connection",
  "automatic_publication_requires_mandate",
  "account_already_exists",
  "already_corrected",
  "already_marked",
  "already_released",
  "already_returned",
  "already_scored",
  "already_withdrawn",
  "calibration_entry_blocked",
  "conference_pending",
  "connection_already_revoked",
  "correction_pending",
  "deadline_not_reached",
  "duplicate_pause",
  "execution_suspended",
  "execution_delinquent",
  "execution_closed",
  "front_not_released",
  // #583 — stopping twice / resuming without a stop.
  "global_stop_already_active",
  "global_stop_not_active",
  "invalid_transition",
  "item_critical",
  "item_limit_passed",
  "item_not_ready",
  "item_withdrawn",
  "limit_not_reached",
  "no_deadline",
  "no_return",
  "no_version",
  "nothing_to_classify",
  "nothing_to_confirm",
  "pause_already_active",
  "pause_not_active",
  "recalibration_requires_closed_critical_content",
  "release_blocked_low_score",
  "release_requires_3_consecutive",
  "revalidation_required",
  "round_already_open",
  "round_already_open_this_week",
  "round_closed",
  "round_still_open",
  "stale_version",
  "thread_conflict",
  "unscored_item",
  "version_mismatch",
]);

export function equipeErrorStatus(code: string): number {
  if (code === "forbidden_actor") return 403;
  if (code.startsWith("unknown_")) return 404;
  if (INVALID_REQUEST_CODES.has(code) || BAD_REQUEST_CODES.has(code)) return 400;
  if (CONFLICT_CODES.has(code)) return 409;
  return 500;
}

export async function equipeErrorResponse(
  error: DomainError,
  context: string,
): Promise<Response> {
  const status = equipeErrorStatus(error.code);
  if (status === 500) {
    logger.error("[equipe-api]", { context, code: error.code, message: error.message });
  }
  return apiError(error.code, status, { message: error.message });
}
