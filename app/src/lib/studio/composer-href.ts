/**
 * Where the Studio composer lives (spec 2026-10-07, §2): its own page inside whichever shell the workspace has, no
 * longer `/`. `/creative-work/<id>` stays the piece page of an existing work, the canonical resume.
 */
export const COMPOSER_PATH = "/creative-work/new";

/** The `[id]` of `/creative-work/[id]` that means "the Studio stage for a new work", not a work id. */
export const NEW_CREATIVE_WORK_ID = "new";

/** The query the composer reads, as the home used to read it. */
export const COMPOSER_QUERY_KEYS = [
  "workId",
  "intent",
  "mode",
  "fresh",
  "compose",
  "templateId",
  "campaignId",
] as const;

export type ComposerQueryKey = (typeof COMPOSER_QUERY_KEYS)[number];
export type ComposerQuery = Partial<Record<ComposerQueryKey, string | null | undefined>>;
type SearchParamsRecord = Record<string, string | string[] | undefined>;

const COMPOSER_KEYS: ReadonlySet<string> = new Set(COMPOSER_QUERY_KEYS);

/** The composer's address with the given query, in the order given; empty values are left out. */
export function composerHref(query: ComposerQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (COMPOSER_KEYS.has(key) && value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${COMPOSER_PATH}?${search}` : COMPOSER_PATH;
}

/**
 * Where an old link that opened the composer at `/` goes now: the composer, with the same composer query in the same
 * order, so an open `workId` stays open. Null when nothing in it is a composer key (the conversation's `?suggestion=`,
 * an invite's `?workspaceId=`) or when it carries a guest draft: the guest handoff keeps landing on `/` until the guest
 * flow is removed (spec §4).
 */
export function legacyComposerHref(searchParams: SearchParamsRecord): string | null {
  if (searchParams.guestDraft !== undefined) return null;
  const query: ComposerQuery = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (COMPOSER_KEYS.has(key) && typeof value === "string" && value.trim()) {
      query[key as ComposerQueryKey] = value;
    }
  }
  return Object.keys(query).length > 0 ? composerHref(query) : null;
}
