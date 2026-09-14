# App Router routes

Next.js App Router under `app/src/app/`. Layouts nest: **root** (`app/src/app/layout.tsx`) wraps everything. Route groups `(dashboard)` and `(public)` do not appear in the URL.

There is **no** `middleware.ts` in `app/`. Workspace access for `/` is enforced in the page via `requireWorkspaceAccess()`.

## Layouts

| Scope | File | Applies to |
|---|---|---|
| Root | `app/src/app/layout.tsx` | All routes (fonts Inter / Space Mono / Press Start 2P, forced `dark`, intl, Query, Tooltip, Toaster) |
| Dashboard | `app/src/app/(dashboard)/layout.tsx` → `DashboardShellSwitcher` | All `(dashboard)` pages |
| Dashboard assistant override | `app/src/app/(dashboard)/assistant/layout.tsx` | `/assistant` only (AssistantShell) |
| Public legal | `app/src/app/(public)/layout.tsx` | `/privacy`, `/terms` |
| Auth / share / invite | root only | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite`, `/share/[token]` |

Dashboard chrome: `AppShell` except `/assistant`, which uses `V6ShellLayout` + `assistant-shell-host`.

## Page routes

| URL | File | Layout |
|---|---|---|
| `/` | `app/src/app/(dashboard)/page.tsx` | root → dashboard (`AppShell`) |
| `/dashboard` | `app/src/app/(dashboard)/dashboard/page.tsx` | root → dashboard (`AppShell`) |
| `/library` | `app/src/app/(dashboard)/library/page.tsx` | root → dashboard (`AppShell`) |
| `/campaigns` | `app/src/app/(dashboard)/campaigns/page.tsx` | root → dashboard (`AppShell`) |
| `/campaigns/new` | `app/src/app/(dashboard)/campaigns/new/page.tsx` | redirects to `/?compose=1` |
| `/campaigns/[id]` | `app/src/app/(dashboard)/campaigns/[id]/page.tsx` | root → dashboard (`AppShell`) |
| `/settings` | `app/src/app/(dashboard)/settings/page.tsx` | root → dashboard (`AppShell`); tab via `?tab=` |
| `/brand-kit` | `app/src/app/(dashboard)/brand-kit/page.tsx` | root → dashboard (`AppShell`) |
| `/templates` | `app/src/app/(dashboard)/templates/page.tsx` | root → dashboard (`AppShell`) |
| `/creative-work/[id]` | `app/src/app/(dashboard)/creative-work/[id]/page.tsx` | root → dashboard (`AppShell`) |
| `/quick-tools/create-post` | `app/src/app/(dashboard)/quick-tools/create-post/page.tsx` | legacy redirect into home composer |
| `/assistant` | `app/src/app/(dashboard)/assistant/page.tsx` | root → dashboard switcher (assistant host) → assistant layout |
| `/docs` | `app/src/app/(dashboard)/docs/page.tsx` | redirects to `/manual/` |
| `/feedback` | `app/src/app/(dashboard)/feedback/page.tsx` | root → dashboard (`AppShell`); platform-owner |
| `/admin/quality/brands/[clientProfileId]` | `app/src/app/(dashboard)/admin/quality/brands/[clientProfileId]/page.tsx` | root → dashboard (`AppShell`) |
| `/login` | `app/src/app/login/page.tsx` | root only (`LoginContent` + `AuthPageShell`) |
| `/signup` | `app/src/app/signup/page.tsx` | root only |
| `/forgot-password` | `app/src/app/forgot-password/page.tsx` | root only |
| `/reset-password` | `app/src/app/reset-password/page.tsx` | root only |
| `/invite` | `app/src/app/invite/page.tsx` | root only |
| `/share/[token]` | `app/src/app/share/[token]/page.tsx` | root only (public gallery) |
| `/privacy` | `app/src/app/(public)/privacy/page.tsx` | root → public layout |
| `/terms` | `app/src/app/(public)/terms/page.tsx` | root → public layout |

Special files: `app/src/app/(dashboard)/not-found.tsx`, `app/src/app/global-error.tsx`, `app/src/app/robots.ts`.

## Key pages (summary)

### Home / studio — `/`

Entry: `app/src/app/(dashboard)/page.tsx`. Server component: `requireWorkspaceAccess()`, parses `workId` / `intent` / `mode` / `compose` / `templateId` / `campaignId` / `fresh` via `dashboard-search-params.ts`, then renders **`DashboardHomeActions`**.

This is the operational studio: composer, tool cards (variations / peça / format adaptation / restyle / carousel), inspirations rail, continue-work card, brand switcher. Search params: `?compose=1`, `?mode=arte|briefing`, `?intent=…`, `?workId=`, `?templateId=`, `?campaignId=`, `?fresh=1`.

### Overview dashboard — `/dashboard`

`DashboardV6View`: KPIs, recent works, templates. Distinct from `/` (studio). Sidebar account row links here.

### Library — `/library`

Client page: workspace assets (`useWorkspaceAssets`, excludes curated inspirations), upload, filters, `LibraryV6View`, `ConfirmDialog` for delete.

### Campaigns — `/campaigns`

Canonical works list (`useCanonicalWorks`) + `CampaignsV6View`, bulk actions, pagination, optional kanban. `/campaigns/new` redirects home. `/campaigns/[id]` is the campaign workspace (briefing, derivations, assistant chrome).

### Settings — `/settings`

`SettingsV6View` card nav + lazy tabs: profile, workspace, team, billing, creditHistory, plans, integrations, privacy. Legacy `brandKit` / `brandTraining` tabs redirect to `/brand-kit`.

### Login — `/login`

`LoginContent` in `AuthPageShell`: email/password, magic link, social auth. No dashboard shell.

## API routes (`app/src/app/api/**/route.ts`)

All use root layout only (no HTML shell). Grouped by prefix (~177 handlers):

| Prefix | Typical files |
|---|---|
| `/api/auth/[...all]` | better-auth |
| `/api/creative-work` | draft, generate, outputs, carousel, inspirations, identity |
| `/api/campaigns` | CRUD, assets, analyze, plan, restyle, diagnosis, competitors |
| `/api/derivations` | review, regenerate, copy-variants, QA, landing-page |
| `/api/client-profiles` | brand knowledge, fonts, voice, references, memory |
| `/api/workspace` | assets, members, invites, settings, brand-kit, missions |
| `/api/assistant` | threads, chat, guided-flow, goal, artifacts |
| `/api/billing` | status, checkout, portal, webhook, history, trial, beta |
| `/api/feedback` | reports, corpus, analytics, calibration, beta-sessions |
| `/api/admin` | quality brands, learning proposals, testers, inspirations |
| `/api/user` | profile, avatar, account, onboarding, locale, export |
| `/api/templates` | list, materialize |
| `/api/notifications` | list, mark read, webhook |
| `/api/dashboard` | stats |
| `/api/health`, `/api/build-id`, `/api/inngest` | ops |
| `/api/share`, `/api/exports`, `/api/waitlist`, `/api/analytics/events` | misc |

## Sidebar destinations vs URLs

Primary (desktop icon nav + mobile tab bar): `/`, `/campaigns`, `/library`, `/brand-kit`.  
Secondary: `/docs` (redirect), `/settings`, `/feedback` (owner), `/dashboard` (account card).
