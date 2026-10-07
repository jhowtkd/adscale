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
 * Translate only the pathname of a recognized legacy composer URL. Raw search is the authoritative form: unlike
 * the server-page Record it preserves repeated keys interleaved with other keys, encoding and blank values.
 * Detection is independent from hydration validation. Pure conversation/invite queries and any guestDraft stay `/`.
 */
export function legacyComposerHref(searchParams: SearchParamsRecord | string): string | null {
  if (typeof searchParams === "string") {
    const params = new URLSearchParams(searchParams);
    if (params.has("guestDraft") || !COMPOSER_QUERY_KEYS.some((key) => params.has(key))) return null;
    const search = searchParams && !searchParams.startsWith("?") ? `?${searchParams}` : searchParams;
    return `${COMPOSER_PATH}${search}`;
  }
  if (searchParams.guestDraft !== undefined || !COMPOSER_QUERY_KEYS.some((key) => searchParams[key] !== undefined)) return null;
  // Fallback for direct server-page callers. Global interleaving is already lost by Next's Record conversion.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  return `${COMPOSER_PATH}?${params}`;
}

/** Internal request header, always overwritten by proxy on the exact composer entry. */
export const COMPOSER_RETURN_HEADER = "x-adscale-composer-return";
