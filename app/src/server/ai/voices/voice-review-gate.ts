export type ClientVoiceReviewStatus =
  | "pending_review"
  | "approved"
  | "changes_requested";

/**
 * Mirrors `.planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md`.
 * Update to `approved` after manual creative-director sign-off.
 */
export const CENBRAP_VOICE_REVIEW_STATUS: ClientVoiceReviewStatus =
  "pending_review";

export function isClientVoiceInjectionAllowed(
  voiceId: string,
  options?: { forceApproved?: boolean }
): boolean {
  if (options?.forceApproved) {
    return true;
  }
  if (voiceId === "cenbrap") {
    return CENBRAP_VOICE_REVIEW_STATUS === "approved";
  }
  return false;
}
