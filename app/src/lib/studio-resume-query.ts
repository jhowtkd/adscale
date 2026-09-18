import { UUID_PATTERN } from "@/components/guest-home/guest-core.mjs";

export const STUDIO_RESUME_QUERY_KEYS = [
  "workId",
  "intent",
  "mode",
  "fresh",
  "compose",
  "templateId",
  "campaignId",
] as const;

export function hasStudioResumeQuery(searchParams: URLSearchParams): boolean {
  if (
    STUDIO_RESUME_QUERY_KEYS.some((key) => {
      const value = searchParams.get(key);
      return Boolean(value && value.trim());
    })
  ) {
    return true;
  }
  // Validated recognition only (#442): a guest draft counts as a Studio
  // resume when — and only when — it is a well-formed UUID. Invalid values
  // navigate safely (login with the raw continuation, data never applied).
  // Arbitrary parameters never become an authenticated resume.
  const guestDraft = searchParams.get("guestDraft");
  return Boolean(guestDraft && UUID_PATTERN.test(guestDraft));
}
