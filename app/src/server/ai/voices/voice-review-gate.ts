export type ClientVoiceReviewStatus =
  | "pending_review"
  | "approved"
  | "changes_requested";

/**
 * Mirrors `.planning/phases/138-olhar-constitution-and-cenbrap-voice/138-VOICE-REVIEW.md`.
 * Update to `approved` after manual creative-director sign-off.
 * @deprecated Legacy hardcoded status — generation path uses DB `reviewStatus`.
 */
export const CENBRAP_VOICE_REVIEW_STATUS: ClientVoiceReviewStatus =
  "pending_review";

export interface ClientVoiceInjectionOptions {
  forceApproved?: boolean;
  clientProfileId?: string;
  workspaceId?: string;
  reviewStatus?: ClientVoiceReviewStatus;
}

export function isClientVoiceInjectionAllowed(
  _voiceId: string,
  options?: ClientVoiceInjectionOptions
): boolean {
  if (options?.forceApproved) {
    return true;
  }
  if (options?.reviewStatus !== undefined) {
    return options.reviewStatus === "approved";
  }
  return false;
}
