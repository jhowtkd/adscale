# Phase 171: Persistent Product Trust Baseline - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** `--auto` (conservative defaults; no interactive discussion)

<domain>
## Phase Boundary

Remove first-use trust breaks from **Settings** by making profile and workspace state **backend-persistent**, **deterministic** on save/load/error, and **honestly gated** for tabs without real APIs.

In scope (TRUST-01..05):
- Profile tab fields persist via backend and survive refresh/logout/login/device change.
- Workspace tab fields persist via backend with the same durability guarantees.
- Disabled tabs either gain real APIs (profile/workspace) or remain behind honest unavailable states (integrations).
- Save/error/loading behavior is explicit, test-covered, and free of fake timeout simulation.
- Brand kit, team, billing, credit history, plans, and privacy tabs keep current behavior.

Out of scope: integrations OAuth/connect flows, workspace delete, email change/auth flows, multi-workspace switching UI, marketing copy (Phase 170), owner/corpus surfaces.
</domain>

<decisions>
## Implementation Decisions

### Profile persistence (TRUST-01)
- Replace Zustand `updateProfile` + `setTimeout(800)` simulation with **real GET/PATCH API** scoped to the authenticated user.
- **Recommended route shape:** `GET/PATCH /api/user/profile` (mirrors existing `/api/user/locale`, `/api/user/onboarding` patterns).
- **Field mapping (conservative):**
  - `firstName` + `lastName` ↔ `user.name` (split on first space / join with single space).
  - `email` → **read-only** in UI (sourced from auth session; no email-change flow in this phase).
  - `bio` → new nullable `user.bio` column.
  - `timezone` → new nullable `user.timezone` column (IANA string, same select options as today).
  - `avatar` ↔ `user.image` (existing column).
- **Avatar upload:** follow brand-kit logo pattern — dedicated upload endpoint or reuse workspace asset upload if simpler; persist resulting URL/key on `user.image`. No base64-in-DB.
- **Hydration:** ProfileTab loads from API on mount (react-query); Zustand `profile` slice is **not** source of truth after this phase (remove or limit to ephemeral UI if still referenced elsewhere).
- **Durability test bar:** saved values must round-trip through DB and reappear after hard refresh and new session (logout/login).

### Workspace persistence (TRUST-02)
- Replace Zustand `updateWorkspaceSettings` + fake delay with **real GET/PATCH API** scoped via `requireWorkspaceAccess`.
- **Recommended route shape:** `GET/PATCH /api/workspace/settings` (parallel to `/api/workspace/brand-kit`).
- **Field mapping:** extend `workspaces` table with nullable columns matching current UI: `description`, `industry`, `website`, `timezone`. Existing `name` and `slug` columns already cover those form fields.
- **Authorization:** require workspace **owner or admin** role to PATCH (members read-only). Conservative default — workspace identity is sensitive.
- **Slug changes:** allow PATCH but validate uniqueness and URL-safe format (reuse zod patterns from other workspace routes).
- **Hydration:** WorkspaceTab loads from API on mount; Zustand `workspaceSettings` is not source of truth after this phase.
- **Danger zone delete button:** stays **honest unavailable** (`comingSoon` toast) — workspace delete is out of scope; do not fake persistence there.

### Disabled tab honesty (TRUST-03)
- **Enable** `profile` and `workspace` in `settings-tabs.ts` once their APIs ship end-to-end (update `settings-nav.test.ts` expectations accordingly).
- **Integrations** remains `enabled: false` — no OAuth/connect APIs exist; keep visible tab with `comingSoon` badge and disabled nav (current `ResponsiveTabs` pattern). Do **not** render fake connect/save flows.
- **Default tab:** after enablement, default remains first enabled tab in array order — move profile to first enabled position **or** keep brandKit default; **conservative choice: keep brandKit as default** (least disruptive to existing users/bookmarks).
- Deep links to disabled tabs (`?tab=integrations`) continue falling back to first enabled tab via `resolveSettingsTab`.

### Save / error / loading determinism (TRUST-04)
- **Canonical pattern:** mirror `BrandKitTab` + `use-brand-kit.ts`:
  - react-query `useQuery` for load, `useMutation` for save.
  - Local `saveState`: `idle | saving | saved` (+ implicit error via toast + return to `idle`).
  - Explicit **Save** button disabled when `!hasChanges || saveState === "saving"`.
  - On success: toast + `saved` for 2s then `idle`.
  - On error: toast with API message + `idle` (no stuck `saving`).
  - **Remove** all `await new Promise(r => setTimeout(r, 800))` fake delays.
- **Loading:** skeleton/spinner while initial query pending (BrandKitTab already uses Skeleton — reuse).
- **Tests required:**
  - API route tests (GET/PATCH happy path, auth, validation, role guard for workspace).
  - Hook tests or tab-level tests asserting save state transitions and error recovery.
  - Update `settings-nav.test.ts` when tab enable flags change.

### Regression guard (TRUST-05)
- **Do not refactor** BrandKitTab, TeamTab, BillingTab, CreditHistoryTab, PlansTab, PrivacyTab beyond shared import/path churn.
- Brand kit continues using `/api/workspace/brand-kit` + react-query hooks unchanged.
- Privacy export/delete continues using `/api/user/export` and `/api/user/account`.
- Billing/team hooks and API contracts untouched.
- Zustand store may retain UI-only slices (`sidebarCollapsed`, toasts); remove profile/workspace persistence from `partialize`/initial mock defaults where they mislead.

### Data migration
- Additive Drizzle migration only (new nullable columns on `user` and `workspaces`).
- Backfill not required — nulls render as empty/current UI defaults on first load.

### Claude's Discretion
- Exact zod schemas and max string lengths (align with brand-kit route limits where sensible).
- Whether profile PATCH is PATCH vs POST (prefer PATCH for partial updates; POST acceptable if codebase convention favors POST-only).
- Avatar upload implementation detail (new `/api/user/profile/avatar` vs reuse workspace assets).
- Repository layer vs inline route handlers (follow nearest existing user/workspace route style).
- Whether to sync `user.name` into header/nav display on save or wait for session refresh.
</decisions>

<specifics>
## Specific Ideas

- **Trust goal:** user edits profile/workspace, refreshes, logs out/in — sees the same values. No silent reset to "User Name" / "My Workspace" mock defaults.
- **Honesty goal:** integrations tab must not imply connections work; profile/workspace must not stay "coming soon" once APIs exist.
- **Reference implementation:** `BrandKitTab.tsx` + `use-brand-kit.ts` + `/api/workspace/brand-kit/route.ts` is the gold standard for settings persistence in this codebase.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BrandKitTab.tsx` — production save/load/error pattern with react-query mutations.
- `use-brand-kit.ts` — `apiFetch` + query keys + typed responses.
- `/api/workspace/brand-kit/route.ts` — zod validation, `requireWorkspaceAccess`, upsert repository.
- `/api/user/locale/route.ts` — authenticated user PATCH with session + drizzle update.
- `/api/user/onboarding/route.ts` — user row read/write precedent.
- `settings-tabs.ts` + `settings-nav.test.ts` — tab enable gating and fallback navigation.
- `ProfileTab.tsx` / `WorkspaceTab.tsx` — UI and form fields already built; currently wired to Zustand + fake delay.
- `IntegrationsTab.tsx` — static mock integrations; correctly out of scope for real persistence.

### Established Patterns
- Settings tabs use **next-intl** for copy; save toasts use `useAppStore.addToast`.
- Workspace APIs use `requireWorkspaceAccess(request)` from `@/server/auth/workspace`.
- User APIs use `getSessionFromHeaders` or `auth.api.getSession`.
- `useAppStore` (`app/src/lib/store.ts`) holds mock `profile` and `workspaceSettings` with only `sidebarCollapsed` persisted to localStorage — root cause of trust break.
- DB today: `user` has `name`, `email`, `image`, `locale`; **no** `bio`/`timezone`. `workspaces` has `name`, `slug` only — **no** description/industry/website/timezone.
- Phase 170 locked curator narrative in settings copy — persistence work must not revert i18n changes.

### Integration Points
- `app/src/app/(dashboard)/settings/settings-tabs.ts` — flip `profile`/`workspace` `enabled` flags.
- `app/src/components/settings/ProfileTab.tsx` — replace store wiring with profile hook.
- `app/src/components/settings/WorkspaceTab.tsx` — replace store wiring with workspace settings hook.
- `app/src/server/db/schema.ts` + migration — new columns.
- New repositories optional: `user-profile.ts`, extend `workspace.ts` with updateSettings.
- `app/src/lib/store.ts` — demote or remove profile/workspace mock state.
</code_context>

<deferred>
## Deferred Ideas

- Integrations OAuth (Meta/Google/TikTok/Slack) — separate phase; keep coming-soon gating.
- Workspace delete and ownership transfer.
- Email change with verification flow.
- Multi-workspace picker / active workspace switching.
- Profile/workspace autosave (explicit Save button is conservative default).
- Syncing profile name into Better Auth session object without page refresh.
</deferred>

---

*Phase: 171-persistent-product-trust-baseline*
*Context gathered: 2026-06-25*
