# Phase 16: Tech Debt Cleanup — Infra, Observability & Quality

**Phase:** 16  
**Milestone:** v4.0 — Foundation  
**Goal:** Resolve critical tech debt blocking production confidence, security, and maintainability.  
**Estimated Duration:** 3–4 days  
**Parallelizable:** Yes (6 workstreams, some dependencies)

---

## Context

After 15 phases of feature delivery (v1.0 → v3.0), the codebase accumulated structural debt that now poses risks to production stability, security, and developer velocity. This phase is a **pure infrastructure/quality pass** — no new product features. The six critical issues were identified by comprehensive codebase audit:

1. **No rate limiting** — 42 API handlers vulnerable to brute-force and resource exhaustion
2. **No production observability** — Blind to runtime errors, performance regressions, and failures
3. **Massive page components** — 3 pages exceed 600+ lines, hurting bundle size and maintainability
4. **Test infrastructure broken** — 4 test files failing (17 tests), mostly due to missing local DB setup
5. **Mock data in production UI** — TeamTab ships fake emails/names to real users
6. **Images completely unoptimized** — `images.unoptimized: true` wastes bandwidth and slows loads

Additionally: no CI/CD pipeline, ~40+ `console.*` calls in production code, no error/loading boundaries.

---

## Scope

### In Scope

| # | Workstream | Deliverable |
|---|-----------|-------------|
| 1 | **Rate Limiting** | `@upstash/ratelimit` (or memory-based fallback) on all mutation API routes |
| 2 | **Observability** | Sentry integration (error tracking + performance monitoring) |
| 3 | **Page Refactoring** | Extract components from 3 oversized pages; target <300 lines each |
| 4 | **Test Infrastructure** | Local test DB setup script + fix failing tests |
| 5 | **TeamTab Real Data** | Wire TeamTab to workspace_members API; add invite/remove flows |
| 6 | **Image Optimization** | Remove `unoptimized: true`; configure `sharp` + R2 domains |
| 7 | **CI/CD** | GitHub Actions workflow: type-check, lint, test, build |
| 8 | **Logging Cleanup** | Replace `console.*` with `pino` structured logger; add request correlation IDs |

### Out of Scope
- New product features (Persona Simulator, ad platform export, etc.)
- Database schema changes (unless required by TeamTab invites)
- OAuth login (Better Auth already supports; UI toggle only if trivial)
- SEO/sitemap (separate phase)

---

## Prerequisites

- [ ] `npm run build` passes on `main`
- [ ] `npm run lint` passes on `main`
- [ ] `.env.local` has all required vars (for local dev)
- [ ] Docker Compose available (for local test DB)

---

## Workstreams

---

### WS1: Rate Limiting

**Owner:** Backend  
**Files:** `src/middleware.ts`, `src/lib/rate-limit.ts` (new), all `src/app/api/**/route.ts` mutation routes

**Approach:** Use `@upstash/ratelimit` with Redis/Upstash if `UPSTASH_REDIS_REST_URL` is configured; fallback to simple in-memory map for local dev. Apply only to `POST`, `PATCH`, `DELETE` routes.

**Tasks:**
1. Install `@upstash/ratelimit` and `@upstash/redis`
2. Create `src/lib/rate-limit.ts`:
   - `createRateLimiter(category: 'auth' | 'ai' | 'general')` returning middleware function
   - Auth routes: 10 req/min per IP
   - AI routes (plan, derivation, restyling): 5 req/min per workspace
   - General mutation: 30 req/min per IP
3. Create `src/lib/with-rate-limit.ts` HOC for API routes
4. Apply to all mutation routes:
   - `/api/auth/[...all]` (login, signup)
   - `/api/campaigns/*` POST, PATCH, DELETE
   - `/api/derivations/*/review`, `/api/derivations/*/regenerate`
   - `/api/briefing-doctor/analyze`
   - `/api/billing/checkout`, `/api/billing/portal`
   - `/api/quick-tools/restyling`, `/api/restyling`
5. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.example` and `env.ts`

**Verification:**
- [ ] Rapid sequential POSTs to `/api/billing/checkout` return 429 after limit
- [ ] Rate limit headers present (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)
- [ ] No rate limit applied to GET/HEAD routes

---

### WS2: Observability (Sentry)

**Owner:** Full-stack  
**Files:** `next.config.ts`, `src/instrumentation.ts` (new), `src/lib/sentry.ts` (new), error boundaries

**Approach:** Use `@sentry/nextjs` official SDK. Enable error tracking + performance monitoring. Sample rate 100% in dev, 10% in prod.

**Tasks:**
1. Install `@sentry/nextjs`
2. Run `npx @sentry/wizard@latest -i nextjs`
3. Verify `next.config.ts` has `withSentryConfig` wrapper
4. Create `src/instrumentation.ts` for edge/runtime instrumentation
5. Add `SENTRY_DSN` to `.env.example` and `env.ts`
6. Verify source maps upload in build
7. Add `Sentry.captureException()` in `handleApiError` (`src/lib/api-response.ts`)
8. Add Sentry error boundary in root layout (wraps children)

**Verification:**
- [ ] Throw test error in dev → appears in Sentry dashboard
- [ ] Build completes with source maps
- [ ] API 500 errors include Sentry event ID in response

---

### WS3: Page Refactoring

**Owner:** Frontend  
**Files:** `src/app/(dashboard)/campaigns/page.tsx`, `src/app/(dashboard)/campaigns/[id]/page.tsx`, `src/app/(dashboard)/page.tsx`

**Approach:** Extract domain components. Keep pages as thin orchestration layers. No behavior change.

**Tasks:**

**3a. campaigns/page.tsx (932 → ~150 lines)**
- Extract `CampaignListHeader` (title + new campaign button)
- Extract `CampaignFilters` (search, sort, status filters)
- Extract `CampaignGrid` / `CampaignTable` (switchable view)
- Extract `CampaignPagination`
- Extract `EmptyCampaignState`

**3b. campaigns/[id]/page.tsx (821 → ~180 lines)**
- Extract `CampaignWorkspaceShell` (layout wrapper)
- Extract `StepRouter` (renders correct step based on status)
- Extract `CampaignHeader` (title, status badge, actions)
- Extract `CampaignSidebar` or inline step navigation
- Keep only: data fetching (TanStack Query), step state, layout composition

**3c. page.tsx (648 → ~120 lines)**
- Extract `DashboardStats` (campaign count, credit balance)
- Extract `RecentActivityFeed`
- Extract `UsageChart` (replace placeholder with real chart component using recharts or similar)
- Extract `QuickActionsPanel` (shortcut cards)

**Verification:**
- [ ] Each refactored page < 250 lines
- [ ] `npm run build` passes
- [ ] No visual regressions in manual smoke test
- [ ] `npm run lint` passes

---

### WS4: Test Infrastructure

**Owner:** Backend / DevOps  
**Files:** `config/vitest.config.ts`, `package.json`, `tests/setup.ts`, `.env.test` (new), `scripts/setup-test-db.ts` (new)

**Approach:** Create isolated test database using Docker or mock DB layer. Fix 4 failing test files.

**Tasks:**

**4a. Test DB Setup**
- Add `TEST_DATABASE_URL` to `.env.example` and `env.ts` (optional, defaults to local Docker Postgres)
- Create `scripts/setup-test-db.ts`:
  - Checks if Docker is running
  - Spins up `postgres:16-alpine` on port 5433 (isolated from dev DB)
  - Runs `drizzle-kit migrate` against test DB
  - Seeds minimal data (or uses existing test mocks)
- Add npm script: `"test:db:setup": "tsx scripts/setup-test-db.ts"`
- Add npm script: `"test:db:teardown": "docker stop adscale-test-postgres && docker rm adscale-test-postgres"`
- Update `vitest.config.ts` to use `TEST_DATABASE_URL` when present

**4b. Fix template.test.ts**
- Root cause: tries to connect to database `"jhonatan"` (default from env)
- Fix: Ensure test setup provides correct `TEST_DATABASE_URL`
- Fix assertion: "Campaign not found" error message vs raw query error — wrap repository query in try/catch that throws human-readable error

**4c. Fix campaign-crud.test.ts**
- Root cause: workspace isolation assertions failing
- Diagnose: Check if `requireWorkspaceAccess` mock is correctly set up
- Fix: Update mock or test expectations to match current auth behavior

**4d. Fix restyling.test.ts**
- Root cause: RESTyling API integration assertions
- Diagnose: Check if route handler signature changed after v3.0 restyling refactor
- Fix: Update test to match current API contract

**4e. Fix briefing-doctor-ui.test.tsx**
- Root cause: React Testing Library rendering/behavior assertions
- Diagnose: Check if component props changed; check mock providers
- Fix: Update test setup or component test wrappers

**Verification:**
- [ ] `npm run test:db:setup` creates test DB successfully
- [ ] `npm test` passes with 0 failures (323/323)
- [ ] `npm run test:db:teardown` cleans up
- [ ] CI runs tests against test DB

---

### WS5: TeamTab Real Data

**Owner:** Full-stack  
**Files:** `src/components/settings/TeamTab.tsx`, `src/server/auth/team.ts` (new), `src/app/api/workspace/members/route.ts` (new), `src/app/api/workspace/invites/route.ts` (new)

**Approach:** Replace mock data with real workspace_members queries. Add invite flow via email.

**Tasks:**

**5a. Backend**
- Create `src/server/auth/team.ts`:
  - `getWorkspaceMembers(workspaceId)`
  - `inviteMember(workspaceId, email, role)` — creates pending invite record
  - `removeMember(workspaceId, userId)` — deletes workspace_members row
- Add invite table to schema (or reuse workspace_members with `role: 'pending'`):
  ```ts
  workspace_invites: id, workspaceId, email, role, token, expiresAt, createdAt
  ```
- Create `src/app/api/workspace/members/route.ts` (GET, DELETE)
- Create `src/app/api/workspace/invites/route.ts` (POST to invite, PATCH to accept via token)
- Add `sendInviteEmail` using Resend

**5b. Frontend**
- Update `TeamTab.tsx`:
  - Fetch real members from `/api/workspace/members`
  - Show invite form (email + role selector)
  - Show pending invites separately
  - Add remove member button (with confirmation)
- Remove all hardcoded fake data

**5c. Schema Migration**
- Generate Drizzle migration for `workspace_invites` table

**Verification:**
- [ ] TeamTab shows real workspace members
- [ ] Invite sends email with acceptance link
- [ ] Accepting invite adds user to workspace
- [ ] Removing member deletes from workspace_members
- [ ] Build passes

---

### WS6: Image Optimization

**Owner:** Frontend / DevOps  
**Files:** `next.config.ts`, `src/app/layout.tsx`, `src/components/ui/ImageWithFallback.tsx` (new)

**Approach:** Remove `images.unoptimized: true`. Configure `sharp` for local processing. Add R2 domain to `images.remotePatterns`. Create optimized image wrapper component.

**Tasks:**
1. Update `next.config.ts`:
   - Remove `images.unoptimized: true`
   - Add `images.remotePatterns` with R2 public domain
   - Keep `output: 'standalone'`
2. Verify `sharp` is in dependencies (already is)
3. Create `src/components/ui/ImageWithFallback.tsx`:
   - Wraps Next.js `<Image>` with error boundary
   - Falls back to plain `<img>` on R2 failure
   - Accepts `placeholder="blur"` with data URL
4. Replace all `<img>` tags in components with `ImageWithFallback`
5. Update `src/app/layout.tsx` to ensure `sharp` is properly imported in server bundle

**Verification:**
- [ ] `npm run build` passes
- [ ] Images load from R2 via Next.js Image component
- [ ] No 404s on image requests
- [ ] Lighthouse shows improved performance score

---

### WS7: CI/CD (GitHub Actions)

**Owner:** DevOps  
**Files:** `.github/workflows/ci.yml` (new)

**Tasks:**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:16-alpine
           env:
             POSTGRES_USER: test
             POSTGRES_PASSWORD: test
             POSTGRES_DB: adscale_test
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: cd app && npm ci
         - run: cd app && npm run lint
         - run: cd app && npm run typecheck
         - run: cd app && npm run db:migrate
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/adscale_test
         - run: cd app && npm test
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/adscale_test
             NODE_ENV: test
         - run: cd app && npm run build
   ```
2. Add `npm run typecheck` script to `package.json` if missing (`tsc --noEmit`)
3. Ensure `.env.test` or CI env vars satisfy `env.ts` validation in test mode

**Verification:**
- [ ] CI passes on push to this branch
- [ ] CI fails on lint/type/test errors
- [ ] CI runs in < 5 minutes

---

### WS8: Logging Cleanup

**Owner:** Backend  
**Files:** `src/lib/logger.ts` (new), `src/lib/api-response.ts`, `src/server/jobs/derivation.ts`, all API routes

**Tasks:**
1. Install `pino` and `pino-pretty`
2. Create `src/lib/logger.ts`:
   - Uses `pino` with pretty transport in dev
   - Uses JSON transport in prod
   - Auto-injects `requestId` from AsyncLocalStorage
3. Create `src/lib/with-request-id.ts` middleware for API routes
4. Replace all `console.log`, `console.error`, `console.warn` in `src/server/` and `src/app/api/` with `logger.info/error/warn`
5. In `handleApiError`: log full error with `requestId`, return `errorId` to client
6. In `derivation.ts` job: log each step with structured fields (`campaignId`, `derivationId`, `step`)

**Verification:**
- [ ] `grep -r "console\." src/server/ src/app/api/` returns 0 matches
- [ ] Dev logs are human-readable (pino-pretty)
- [ ] Error responses include `errorId` correlating to log entry

---

## Execution Order

```
Day 1
├── WS4 (Test Infrastructure)      ← Unblocks everything else
├── WS7 (CI/CD skeleton)           ← Parallel with WS4
├── WS8 (Logger setup)             ← Must finish before replacing consoles
│
Day 2
├── WS1 (Rate Limiting)            ← Depends on logger for 429 responses
├── WS2 (Sentry)                   ← Can parallel with WS1
├── WS3 (Page Refactoring)         ← Frontend-only, parallel
│
Day 3
├── WS5 (TeamTab Real Data)        ← Needs backend + frontend
├── WS6 (Image Optimization)       ← Frontend-only, parallel
├── Fix remaining failing tests    ← After WS4 stable
│
Day 4
├── Integration / smoke testing
├── CI verification
├── Phase review & commit
```

---

## Success Criteria

1. **Rate Limiting:** All mutation routes return 429 after exceeding limits; GET routes unaffected
2. **Observability:** Sentry dashboard shows errors and performance data; build uploads source maps
3. **Pages:** `campaigns/page.tsx`, `campaigns/[id]/page.tsx`, `page.tsx` each < 250 lines; build passes
4. **Tests:** `npm test` passes 323/323 with 0 failures; test DB spins up in < 30s
5. **TeamTab:** Displays real workspace members; invite/remove works end-to-end
6. **Images:** `images.unoptimized` removed; R2 images served via Next.js Image; no regressions
7. **CI/CD:** GitHub Actions passes on every push; runs lint, typecheck, test, build
8. **Logging:** Zero `console.*` in server/API code; structured logs with request IDs

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sentry breaks build due to source map upload | Medium | High | Test build locally before pushing; disable upload in CI if needed |
| Rate limiting breaks legitimate bulk operations | Medium | Medium | Use workspace-scoped limits (not IP) for AI routes; allow override via env |
| TeamTab schema change requires migration | High | Low | Simple table addition; test migration on staging DB |
| Image optimization breaks R2 presigned URLs | Low | High | Test with actual R2 assets; keep fallback to plain `<img>` |
| Test DB setup flaky in CI | Medium | Medium | Use GitHub Actions service container for Postgres; add retry logic |
| Page refactoring introduces visual regressions | Medium | Medium | Manual smoke test each page; compare before/after screenshots |

---

## Notes

- **No product features.** This phase is pure foundation. Resist scope creep.
- **Parallelizable.** WS1/WS2/WS3/WS4/WS7 can run simultaneously. WS5 and WS6 are mostly independent.
- **TeamTab invites** are the only schema change. Everything else is code-only.
- If Sentry setup proves complex, fallback to LogRocket or simple error-tracking middleware.
- For rate limiting without Upstash, implement a simple LRU in-memory map with TTL (sufficient for single-instance deploys on Render free tier).
