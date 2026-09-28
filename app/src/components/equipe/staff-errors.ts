// Module error codes → plain-language i18n keys (#554).
//
// The API is the authority: every code the staff commands can return maps
// to an `equipe.staffErrors.*` key, with a status-based fallback so an
// unknown code still reads as a sentence, never a raw identifier.

import { StaffApiError } from "./staff-api";

const CODE_TO_KEY: Record<string, string> = {
  forbidden: "forbidden",
  forbidden_actor: "forbiddenAction",
  staff_role_required: "roleRequired",
  notFound: "notFound",
  equipe_not_enabled: "notEnabled",
  unknown_account: "unknownAccount",
  unknown_round: "unknownRound",
  unknown_escalation: "unknownEscalation",
  unknown_exception: "unknownException",
  unknown_pause: "unknownPause",
  unknown_connection: "unknownConnection",
  unknown_front: "unknownFront",
  // #584
  unknown_mandate: "unknownMandate",
  invalid_transition: "invalidTransition",
  already_scored: "alreadyScored",
  already_returned: "alreadyReturned",
  already_corrected: "alreadyCorrected",
  already_released: "alreadyReleased",
  already_marked: "alreadyMarked",
  already_withdrawn: "alreadyWithdrawn",
  correction_pending: "correctionPending",
  no_return: "noReturn",
  no_version: "noVersion",
  item_critical: "itemCritical",
  item_withdrawn: "itemWithdrawn",
  unscored_item: "unscoredItem",
  round_closed: "roundClosed",
  round_still_open: "roundStillOpen",
  round_size_mismatch: "roundSizeMismatch",
  release_blocked_low_score: "releaseBlockedLowScore",
  evidence_required: "evidenceRequired",
  nothing_to_classify: "nothingToClassify",
  part_kind_required: "partKindRequired",
  recalibration_requires_closed_critical_content: "recalibrationNeedsClosedCritical",
  front_not_released: "frontNotReleased",
  pause_not_active: "pauseNotActive",
  pause_already_active: "pauseAlreadyActive",
  connection_already_revoked: "connectionAlreadyRevoked",
  item_not_in_round: "itemNotInRound",
  round_not_in_front: "roundNotInFront",
  stale_version: "staleVersion",
  version_mismatch: "versionMismatch",
  invalid_score: "invalidScore",
  invalid_command: "invalidCommand",
  invalidInput: "invalidInput",
  // #582 — open_account failures, in plain language.
  account_already_exists: "accountAlreadyExists",
  unknown_client_profile: "unknownClientProfile",
};

export function staffErrorKey(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.code && CODE_TO_KEY[error.code]) return CODE_TO_KEY[error.code]!;
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "notFound";
    if (error.status === 409) return "conflict";
    if (error.status >= 500) return "serverError";
    return "generic";
  }
  return "generic";
}
