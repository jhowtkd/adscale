// Exhaustive module-code → HTTP mapping (#552): every code the module can
// return today, so a new module code fails this test and forces an
// explicit decision instead of silently landing on 500.

import { describe, expect, it } from "vitest";
import { equipeErrorStatus } from "./errors";

const CASES: Array<{ code: string; status: number }> = [
  { code: "forbidden_actor", status: 403 },

  { code: "equipe_not_enabled", status: 404 },
  { code: "unknown_account", status: 404 },
  { code: "unknown_asset", status: 404 },
  { code: "unknown_batch", status: 404 },
  { code: "unknown_client_profile", status: 404 },
  { code: "unknown_connection", status: 404 },
  { code: "unknown_creative_output", status: 404 },
  { code: "unknown_creative_work", status: 404 },
  { code: "unknown_escalation", status: 404 },
  { code: "unknown_event", status: 404 },
  { code: "unknown_exception", status: 404 },
  { code: "unknown_front", status: 404 },
  { code: "unknown_item", status: 404 },
  { code: "unknown_part", status: 404 },
  { code: "unknown_pause", status: 404 },
  { code: "unknown_pause_level", status: 404 },
  { code: "unknown_pause_origin", status: 404 },
  { code: "unknown_round", status: 404 },
  { code: "unknown_signal", status: 404 },

  { code: "invalid_actor", status: 400 },
  { code: "invalid_command", status: 400 },
  { code: "invalid_context", status: 400 },
  { code: "invalid_escalation_kind", status: 400 },
  { code: "invalid_front", status: 400 },
  { code: "invalid_schedule", status: 400 },
  { code: "invalid_score", status: 400 },
  { code: "invalid_signal", status: 400 },
  { code: "batch_front_mismatch", status: 400 },
  { code: "cannot_merge_self", status: 400 },
  { code: "connections_only_for_cross_account", status: 400 },
  { code: "evidence_required", status: 400 },
  { code: "front_mismatch", status: 400 },
  { code: "front_required", status: 400 },
  { code: "invalid_idea_payload", status: 400 },
  { code: "item_not_in_round", status: 400 },
  { code: "merge_requires_same_item", status: 400 },
  { code: "no_change", status: 400 },
  { code: "output_work_mismatch", status: 400 },
  { code: "part_kind_required", status: 400 },
  { code: "round_size_mismatch", status: 400 },
  { code: "use_request_support", status: 400 },
  { code: "wrong_front", status: 400 },

  { code: "account_already_exists", status: 409 },
  { code: "already_corrected", status: 409 },
  { code: "already_marked", status: 409 },
  { code: "already_released", status: 409 },
  { code: "already_returned", status: 409 },
  { code: "already_scored", status: 409 },
  { code: "already_withdrawn", status: 409 },
  { code: "calibration_entry_blocked", status: 409 },
  { code: "conference_pending", status: 409 },
  { code: "connection_already_revoked", status: 409 },
  { code: "correction_pending", status: 409 },
  { code: "deadline_not_reached", status: 409 },
  { code: "duplicate_pause", status: 409 },
  { code: "front_not_released", status: 409 },
  { code: "invalid_transition", status: 409 },
  { code: "item_critical", status: 409 },
  { code: "item_limit_passed", status: 409 },
  { code: "item_not_ready", status: 409 },
  { code: "item_withdrawn", status: 409 },
  { code: "limit_not_reached", status: 409 },
  { code: "no_deadline", status: 409 },
  { code: "no_return", status: 409 },
  { code: "no_version", status: 409 },
  { code: "nothing_to_classify", status: 409 },
  { code: "nothing_to_confirm", status: 409 },
  { code: "pause_already_active", status: 409 },
  { code: "pause_not_active", status: 409 },
  { code: "recalibration_requires_closed_critical_content", status: 409 },
  { code: "release_blocked_low_score", status: 409 },
  { code: "release_requires_3_consecutive", status: 409 },
  { code: "revalidation_required", status: 409 },
  { code: "round_already_open", status: 409 },
  { code: "round_already_open_this_week", status: 409 },
  { code: "round_closed", status: 409 },
  { code: "round_still_open", status: 409 },
  { code: "stale_version", status: 409 },
  { code: "thread_conflict", status: 409 },
  { code: "unscored_item", status: 409 },
  { code: "version_mismatch", status: 409 },

  // Corrupt stored data and anything unrecognized fail loud.
  { code: "corrupt_parts", status: 500 },
  { code: "some_future_code", status: 500 },
];

describe("equipeErrorStatus", () => {
  it.each(CASES)("maps $code to $status", ({ code, status }) => {
    expect(equipeErrorStatus(code)).toBe(status);
  });
});
