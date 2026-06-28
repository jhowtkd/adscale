export type ClientVoiceReviewStatus =
  | "pending_review"
  | "approved"
  | "changes_requested";

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
