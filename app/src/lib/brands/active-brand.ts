/**
 * The active brand of the rail (spec 2026-10-07 §3). It lives in a cookie the server reads, and the server never trusts it
 * without the workspace's own brands.
 */
export const ACTIVE_BRAND_COOKIE = "adscale_active_brand";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ActiveBrand = { id: string; name: string };
type BrandRow = { id: string; name: string; createdAt: Date };

/**
 * The brand every screen of the rail is about. On the free plan, the brand of its account: the plan has one. Otherwise the
 * cookie's brand when it is one of the workspace's, else the oldest. Null for a workspace with no brand yet.
 */
export function pickActiveBrand(brands: BrandRow[], cookieValue: string | undefined, freePlanBrandId: string | null): ActiveBrand | null {
  const byAge = [...brands].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const chosen = (freePlanBrandId ? byAge.find((brand) => brand.id === freePlanBrandId) : undefined)
    ?? (cookieValue ? byAge.find((brand) => brand.id === cookieValue) : undefined)
    ?? byAge[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

/** Writes the active brand for the next server render (the rail, `/`, the screens). Browser only. */
export function writeActiveBrandCookie(clientProfileId: string): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ACTIVE_BRAND_COOKIE}=${encodeURIComponent(clientProfileId)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}
