/**
 * Demo gating helpers.
 *
 * The triage doc (BUG #5) confirmed: there is no demo-gating mechanism in the
 * codebase, and the rows "Teste", "Cenbrap", "wqee", "Cenbrap em Dobro" are
 * real DB rows produced by manual seed scripts (`app/scripts/seed-*.ts`).
 *
 * All list queries (campaigns, notifications, assistant threads) are already
 * workspace-scoped via `requireWorkspaceAccess`, so a logged-in real user only
 * ever sees their own workspace. The leak happens when the demo account (`DA`)
 * shares a workspace with Jhonatan's real data, or when a public demo viewer
 * is pointed at that workspace.
 *
 * Seeds self-mark themselves: `seed-cenbrap-calibration-corpus.ts` writes
 * `notes = "phase144_cenbrap_calibration_corpus"`, `seed-live-real-customer-corpus.ts`
 * writes `notes = "phase173_live_real_customer_corpus"`. This module uses those
 * markers (plus a `source=synthetic_fixture` / `source=real_customer` pattern
 * in `constraints`) to identify fixture rows without requiring a schema
 * migration.
 *
 * Gating model (smallest viable for Sprint 1):
 *   - `DEMO_WORKSPACE_SLUG` env identifies the workspace that should be the
 *     public demo surface (e.g. "adscale-demo"). When the request resolves to
 *     that workspace, `isDemoWorkspace` returns true and fixture rows are
 *     ALLOWED to render.
 *   - For non-demo workspaces, `filterFixtureCampaigns` drops any campaign
 *     whose `notes` or `constraints` carry a known seed marker. This keeps
 *     Jhonatan's real workspace clean if a seed was accidentally pointed at it.
 *   - `DEMO_USER_EMAIL` env identifies the demo account itself so the UI can
 *     show a "Demo" badge near the avatar and offer a "Restore demo data"
 *     affordance (stubbed for this sprint — full re-seed is L-lift, blocked
 *     on a product decision per triage).
 *
 * No DB migration required; the markers already exist on seeded rows.
 */

export const SEED_MARKERS = [
  "phase144_cenbrap_calibration_corpus",
  "phase173_live_real_customer_corpus",
  "seed_marker=phase144_cenbrap_calibration_corpus",
  "seed_marker=phase173_live_real_customer_corpus",
] as const;

const FIXTURE_SOURCE_PATTERN = /source=synthetic_fixture/;

export interface WorkspaceLike {
  slug?: string | null;
  id: string;
  name: string;
}

export interface UserLike {
  email?: string | null;
  id?: string | null;
  name?: string | null;
}

export interface CampaignLike {
  id: string;
  name: string;
  notes?: string | null;
  constraints?: string | null;
}

export function demoWorkspaceSlug(): string | null {
  const value = process.env.DEMO_WORKSPACE_SLUG;
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function demoUserEmail(): string | null {
  const value = process.env.DEMO_USER_EMAIL;
  return value && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

export function isDemoWorkspace(workspace: WorkspaceLike | null | undefined): boolean {
  if (!workspace) return false;
  const slug = demoWorkspaceSlug();
  if (!slug) return false;
  return workspace.slug?.toLowerCase() === slug.toLowerCase();
}

export function isDemoUser(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  const email = demoUserEmail();
  if (!email) return false;
  return (user.email ?? "").toLowerCase() === email;
}

/**
 * Returns true when the campaign row was produced by a known seed script.
 * Detects the markers the seed scripts already write into `notes` and
 * `constraints` — no schema migration required.
 */
export function isFixtureCampaign(campaign: CampaignLike): boolean {
  const haystack = `${campaign.notes ?? ""}\n${campaign.constraints ?? ""}`;
  if (SEED_MARKERS.some((marker) => haystack.includes(marker))) {
    return true;
  }
  return FIXTURE_SOURCE_PATTERN.test(haystack);
}

export interface FilterFixtureCampaignsOptions {
  /**
   * When true (the caller is on the demo workspace or is the demo user),
   * fixture campaigns are KEPT so the demo surface shows curated sample data.
   * When false, fixture campaigns are dropped so a real workspace never
   * leaks seed rows into its campaign list.
   */
  allowFixtures: boolean;
}

/**
 * Pure filter: drops seed-marked campaigns unless `allowFixtures` is true.
 * Order-preserving; non-fixture campaigns always pass through.
 */
export function filterFixtureCampaigns<T extends CampaignLike>(
  campaigns: T[],
  options: FilterFixtureCampaignsOptions
): T[] {
  if (options.allowFixtures) return campaigns;
  return campaigns.filter((campaign) => !isFixtureCampaign(campaign));
}

/**
 * Convenience: given a workspace + (optional) user, decide whether fixture
 * rows should be visible on this request. Used by API routes before calling
 * `filterFixtureCampaigns`.
 */
export function shouldAllowFixtures(
  workspace: WorkspaceLike | null | undefined,
  user?: UserLike | null | undefined
): boolean {
  return isDemoWorkspace(workspace) || isDemoUser(user);
}
