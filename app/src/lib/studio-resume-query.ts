import { UUID_PATTERN } from "@/components/guest-home/guest-core.mjs";
import { COMPOSER_QUERY_KEYS } from "@/lib/studio/composer-href";

/** The Studio resume keys are the composer's query (spec 2026-10-07 §2): one list for both. */
export const STUDIO_RESUME_QUERY_KEYS = COMPOSER_QUERY_KEYS;

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
