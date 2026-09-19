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
  if (STUDIO_RESUME_QUERY_KEYS.some((key) => {
    const value = searchParams.get(key);
    return Boolean(value && value.trim());
  })) {
    return true;
  }
  // guestDraft is the only validated key: a single well-formed UUID.
  // Anything else is ignored here and handled as invalid downstream.
  const guests = searchParams.getAll("guestDraft");
  return guests.length === 1 && UUID_PATTERN.test(guests[0]);
}
