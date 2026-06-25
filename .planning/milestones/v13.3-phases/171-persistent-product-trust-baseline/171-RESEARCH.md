---
phase: 171-persistent-product-trust-baseline
status: complete
created: 2026-06-25
---

# Phase 171 Research: Persistent Product Trust Baseline

## Objective

Replace Zustand mock persistence and fake `setTimeout(800)` saves in Profile and Workspace settings tabs with backend-backed GET/PATCH APIs, react-query hooks, and honest tab gating — without regressing brand kit, team, billing, or privacy surfaces.

## Root Cause (Trust Break)

- `app/src/lib/store.ts` seeds `profile` and `workspaceSettings` with hardcoded defaults (`"User Name"`, `"My Workspace"`).
- Only `sidebarCollapsed` is persisted to localStorage via Zustand `partialize`.
- `ProfileTab.tsx` and `WorkspaceTab.tsx` call `updateProfile` / `updateWorkspaceSettings` after an artificial 800ms delay — values reset on refresh/login.
- `settings-tabs.ts` marks `profile` and `workspace` as `enabled: false` while UI components exist — dishonest "coming soon" gating once APIs ship.

## Existing Implementation Facts

### Reference stack (gold standard)

| Layer | File | Pattern |
|-------|------|---------|
| API | `app/src/app/api/workspace/brand-kit/route.ts` | `requireWorkspaceAccess`, zod schema, repository upsert |
| Upload | `app/src/app/api/workspace/brand-kit/logo/route.ts` | FormData, R2 `uploadBuffer`, magic-byte validation |
| Hook | `app/src/lib/hooks/use-brand-kit.ts` | `apiFetch`, react-query `useQuery` + `useMutation`, query invalidation |
| UI | `app/src/components/settings/BrandKitTab.tsx` | `saveState: idle \| saving \| saved`, `hasChanges`, explicit Save, skeleton on load |
| User API | `app/src/app/api/user/locale/route.ts` | `getSessionFromHeaders`, drizzle `user` update |
| Workspace auth | `app/src/server/auth/workspace.ts` | `requireWorkspaceAccess`, `requireRole(workspaceId, userId, roles)` |

### Current schema gaps

**`user` table** (`app/src/server/db/schema.ts`):
- Has: `name`, `email`, `image`, `locale`
- Missing: `bio`, `timezone` (nullable text)

**`workspaces` table**:
- Has: `name`, `slug`
- Missing: `description`, `industry`, `website`, `timezone` (nullable text)

### Profile field mapping (CONTEXT locked)

| UI field | Backend | Notes |
|----------|---------|-------|
| `firstName` + `lastName` | `user.name` | Split on first space / join with single space |
| `email` | session `user.email` | Read-only in UI; no PATCH |
| `bio` | `user.bio` | New column |
| `timezone` | `user.timezone` | IANA string |
| `avatar` | `user.image` | URL from R2 upload; no base64 in DB |

### Workspace field mapping (CONTEXT locked)

| UI field | Backend | PATCH auth |
|----------|---------|------------|
| `name` | `workspaces.name` | owner or admin |
| `slug` | `workspaces.slug` | owner or admin; uniqueness + URL-safe zod |
| `description` | `workspaces.description` | owner or admin |
| `industry` | `workspaces.industry` | owner or admin |
| `website` | `workspaces.website` | owner or admin |
| `timezone` | `workspaces.timezone` | owner or admin |

Members: GET allowed via `requireWorkspaceAccess`; PATCH returns 403.

### Settings tab gating

- `app/src/app/(dashboard)/settings/settings-tabs.ts` — `defaultTabId` = first enabled tab (`brandKit` today).
- `resolveSettingsTab` falls back to default when requested tab is disabled.
- **Conservative default:** keep `brandKit` as default after enabling profile/workspace (CONTEXT).
- **Integrations:** stays `enabled: false`; `IntegrationsTab.tsx` remains mock — honest unavailable state.

### Zustand cleanup scope

- Remove or stop using `profile` / `workspaceSettings` as source of truth in settings tabs.
- Keep `sidebarCollapsed`, `toasts`, billing UI slices untouched.
- `updateProfile` / `updateWorkspaceSettings` may remain for non-settings consumers if any — grep before delete.

### Test infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest (`app/config/vitest.config.ts`) |
| Route test pattern | Mock `@/server/auth/workspace` or session; call route handlers directly |
| Hook test pattern | `renderHook` + `QueryClientProvider` + mock `apiFetch` (see `use-billing.test.tsx`) |
| Nav test | `app/src/app/(dashboard)/settings/settings-nav.test.ts` |

## Recommended Implementation Shape

### Plan 01 — Schema + APIs (TRUST-01, TRUST-02, TRUST-04 backend)

1. Additive Drizzle migration: `user.bio`, `user.timezone`; `workspaces.description`, `industry`, `website`, `timezone`.
2. `GET/PATCH /api/user/profile` + `POST /api/user/profile/avatar` with route tests.
3. `GET/PATCH /api/workspace/settings` with `requireRole` on PATCH + route tests.
4. Repository helpers: `app/src/server/repositories/user-profile.ts`; extend `workspace.ts` with settings read/update.

### Plan 02 — Profile UI (TRUST-01, TRUST-04)

1. `use-user-profile.ts` hook mirroring `use-brand-kit.ts`.
2. Rewire `ProfileTab.tsx`: react-query load, mutation save, skeleton, remove fake delay and Zustand reads.

### Plan 03 — Workspace UI (TRUST-02, TRUST-04)

1. `use-workspace-settings.ts` hook.
2. Rewire `WorkspaceTab.tsx`; danger-zone delete stays `comingSoon` toast.

### Plan 04 — Tab honesty + regression (TRUST-03, TRUST-05)

1. Flip `profile`/`workspace` `enabled: true`; update `settings-nav.test.ts`.
2. Demote Zustand mock profile/workspace defaults; run regression tests for billing/brand-kit hooks.

## Validation Architecture

| Property | Value |
|----------|-------|
| Profile API tests | `cd app && npm test -- --run src/app/api/user/profile/route.test.ts` |
| Avatar API tests | `cd app && npm test -- --run src/app/api/user/profile/avatar/route.test.ts` |
| Workspace settings tests | `cd app && npm test -- --run src/app/api/workspace/settings/route.test.ts` |
| Profile hook tests | `cd app && npm test -- --run src/lib/hooks/use-user-profile.test.tsx` |
| Workspace hook tests | `cd app && npm test -- --run src/lib/hooks/use-workspace-settings.test.tsx` |
| Nav tests | `cd app && npm test -- --run src/app/\(dashboard\)/settings/settings-nav.test.ts` |
| Full phase command | All commands above + `src/lib/hooks/use-billing.test.tsx` |
| Estimated runtime | ~30–45 seconds |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Slug collision on PATCH | zod + DB unique constraint; return 409 with clear error |
| Avatar base64 in DB | Dedicated upload endpoint → R2 → `user.image` URL only |
| Accidental BrandKitTab refactor | TRUST-05 scope lock in Plan 04 regression task |
| Phase 170 i18n regression | Edit ProfileTab/WorkspaceTab wiring only; no message key churn unless required |
| Member PATCH escalation | `requireRole(..., ["owner", "admin"])` on workspace PATCH |

## Architectural Responsibility Map

| Tier | Responsibility |
|------|----------------|
| `app/src/server/db/schema.ts` + migration | Durable columns |
| `app/src/app/api/user/profile/*` | Profile read/write + avatar upload |
| `app/src/app/api/workspace/settings/route.ts` | Workspace settings read/write + role guard |
| `app/src/lib/hooks/use-user-profile.ts` | Client profile data contract |
| `app/src/lib/hooks/use-workspace-settings.ts` | Client workspace settings contract |
| `ProfileTab.tsx` / `WorkspaceTab.tsx` | Deterministic save UX |
| `settings-tabs.ts` | Honest tab enablement |
| `app/src/lib/store.ts` | UI-only state; no settings source of truth |

## Out of Scope

- Integrations OAuth/connect flows
- Workspace delete, email change, multi-workspace switching
- Profile/workspace autosave
- Better Auth session name sync without refresh

---

*Phase: 171-persistent-product-trust-baseline*
