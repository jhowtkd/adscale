<!-- generated-by: gsd-doc-writer -->
# Testing

This guide describes how to run and write tests for the ADScale Next.js application in `app/`. For local setup and environment variables, see [GETTING-STARTED.md](./GETTING-STARTED.md) and [CONFIGURATION.md](./CONFIGURATION.md). For day-to-day development commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Test framework and setup

| Tool | Version (from `app/package.json`) | Role |
|------|-----------------------------------|------|
| **Vitest** | `^4.1.5` | Unit and integration test runner |
| **jsdom** | `^29.0.2` | DOM environment for React/component tests |
| **@testing-library/react** | `^16.3.2` | Render and interact with components |
| **@testing-library/jest-dom** | `^6.9.1` | DOM matchers (`toBeInTheDocument`, etc.) |
| **@vitejs/plugin-react** | `^6.0.1` | JSX/React transform during tests |
| **@playwright/test** | `^1.60.0` | Browser E2E tests (separate from Vitest) |

**Vitest configuration:** `app/config/vitest.config.ts`

- `environment: "jsdom"` — browser-like APIs for UI tests
- `globals: true` — Vitest globals available (many files still import `describe` / `it` / `expect` / `vi` explicitly)
- `setupFiles: ["./tests/setup.ts"]` — runs before each test file
- `exclude: [..., "tests/e2e/**"]` — Playwright specs are not collected by Vitest
- Path alias `@` → `app/src` (same as the app)
- When `TEST_DATABASE_URL` is set in the environment, Vitest forwards it into `process.env` for tests that need it

**Playwright configuration:**

| Config file | Purpose |
|-------------|---------|
| `app/playwright.config.ts` | Local E2E (`npm run test:e2e`) — all `tests/e2e/*.spec.ts` |
| `app/playwright.release.config.ts` | Visual release gate (`npm run test:visual-release`) — layout and a11y gate specs only |

Shared defaults:

- `testDir: "./tests/e2e"`, `testMatch: /.*\.spec\.ts$/` (release config narrows the match)
- Default `baseURL`: `http://localhost:3000` (override with `E2E_BASE_URL`)
- Long timeouts (180–240s per test) for async Inngest/OpenAI image jobs and layout checks
- Release config starts a dev server via `webServer` (`E2E_DISABLE_RATE_LIMIT=true npm run dev:next`)

**Global setup:** `app/tests/setup.ts` registers jest-dom matchers:

```ts
import "@testing-library/jest-dom";
```

**Prerequisites:** From `app/`, run `npm install` once. Most Vitest tests mock the database, auth, and external services; CI and optional local DB workflows use PostgreSQL (see [CI integration](#ci-integration) and optional scripts below).

**Optional local test database** (Docker on port `5433`):

```bash
cd app
npm run test:db:setup    # starts postgres:16-alpine, runs migrations
npm run test:db:teardown # stops and removes the container
```

Default URL (also in `app/.env.example`): `postgres://test:test@localhost:5433/adscale_test`.

---

## Running tests

Run all commands from the `app/` directory.

### Full suite (CI-style, single run)

```bash
npm test
```

Equivalent to:

```bash
vitest run --config config/vitest.config.ts --passWithNoTests
```

The project currently has **464** Vitest test files (`*.test.ts` / `*.test.tsx`) — **342** under `app/src/` (co-located with source) and **122** under `app/tests/` (shared unit/integration suites, excluding `tests/e2e/`). A full local run reports **~2200** tests (exact count grows with the codebase; one billing regression gate test is skipped by default). Refresh with `find app/src app/tests -name "*.test.ts" -o -name "*.test.tsx" | grep -v node_modules | wc -l`.

### Watch mode (development)

There is no `test:watch` npm script. Use Vitest directly:

```bash
npx vitest --config config/vitest.config.ts
```

### Single file or path

```bash
npx vitest run --config config/vitest.config.ts tests/unit/schemas.test.ts
npx vitest run --config config/vitest.config.ts src/server/billing/credits.test.ts
```

### Filter by test name

```bash
npx vitest run --config config/vitest.config.ts -t "campaign creation"
```

### Focused billing/auth/prompt subset

Documented in `app/README.md` for quick verification of billing and auth-related changes:

```bash
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts tests/integration/auth-workspace-access.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts
```

### Coverage report (optional)

Coverage is not part of the default `npm test` script and **no coverage thresholds** are configured in `vitest.config.ts`. To generate a report, install a Vitest coverage provider (for example `@vitest/coverage-v8`, aligned with Vitest 4.x) and run:

```bash
npx vitest run --config config/vitest.config.ts --coverage
```

### End-to-end tests (Playwright)

E2E specs live in `app/tests/e2e/` and use the `*.spec.ts` suffix. They are **not** run by `npm test`.

| Script | Config | Specs |
|--------|--------|-------|
| `npm run test:e2e` | `playwright.config.ts` | All E2E specs |
| `npm run test:visual-release` | `playwright.release.config.ts` | `visual-release-gate.spec.ts`, `visual-a11y-gate.spec.ts` |
| `npm run release-gate` | (orchestrator) | Unit tests, lint, build, then visual release Playwright suite |

**E2E spec files:**

| File | Purpose |
|------|---------|
| `restyle.spec.ts` | Restyle upload flows (TC014/TC019) with real file attachments |
| `visual-release-gate.spec.ts` | Multi-viewport layout checks for release evidence |
| `visual-a11y-gate.spec.ts` | Accessibility gate at mobile and desktop viewports |
| `visual-foundations.spec.ts` | Visual baseline capture for foundations phase evidence |
| `visual-shell.spec.ts` | App shell and navigation layout checks |
| `assistant-happy-path.spec.ts` | Assistant orchestrator happy-path user journey |
| `guided-assistant-journeys.spec.ts` | Guided assistant flows across multi-step briefs |
| `guided-assistant-scenarios.spec.ts` | Scenario variants for guided assistant behavior |

**Prerequisites for `test:e2e` (restyle and general E2E):**

1. App running on `http://localhost:3000` (for example `npm run start` after a build, or a production-like local server).
2. Inngest dev server available so async image-generation jobs complete.
3. `E2E_DISABLE_RATE_LIMIT=true` on the app process (restyle upload flows hit rate limits otherwise).
4. Test fixtures in `app/tests/fixtures/` (`base.png`, `style.png`, etc.) for file-upload scenarios.

`restyle.spec.ts` logs in with the dev-admin seed credentials and exercises TC014/TC019-style flows with a 240s per-test timeout. These cases require real `<input type="file">` attachments — something the TestSprite cloud runner cannot execute.

**Visual release gate (`test:visual-release`):**

Starts (or reuses) a local dev server automatically via `playwright.release.config.ts` `webServer`. Uses the `visual-foundations@example.test` seed identity from `tests/e2e/support/visual-auth.ts`. Override credentials with `VISUAL_FOUNDATIONS_PASSWORD` if needed.

Override the target server:

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

---

## Writing new tests

### File naming and placement

| Pattern | Location | Typical use |
|---------|----------|-------------|
| `*.test.ts` / `*.test.tsx` next to source | `app/src/**` | API routes, hooks, components, server modules |
| `*.test.ts` / `*.test.tsx` | `app/tests/unit/` | Pure logic, schemas, repositories (mocked DB) |
| `*.test.ts` | `app/tests/integration/` | Multi-module flows, auth guards, API behavior |
| `*.spec.ts` | `app/tests/e2e/` | Playwright browser tests (run via `npm run test:e2e`) |

Use the `.test.ts` or `.test.tsx` suffix for Vitest (not `.spec.*`). Reserve `.spec.ts` for Playwright E2E only.

### Conventions

- Import from `vitest`: `describe`, `it`, `expect`, `vi`, and lifecycle hooks (`beforeEach`, etc.).
- Mock dependencies with `vi.mock("module-path", () => ({ ... }))` before importing the module under test. See `app/tests/integration/auth-workspace-access.test.ts` and `app/tests/integration/campaign-crud.test.ts` for repository and auth patterns.
- Use `@/` imports for application code (resolved via Vitest config).
- React components: `@testing-library/react` plus jest-dom matchers from setup.
- Env validation tests live in `app/tests/unit/env-validation.test.ts` and `app/src/server/validation/env.test.ts`; keep required env shapes consistent with `app/.env.example`.
- E2E: use `@playwright/test`; share helpers from `tests/e2e/support/` (`visual-auth.ts`, `visual-layer-harness.ts`).

### Unit vs integration

| Type | Directory | Approach |
|------|-----------|----------|
| **Unit** | `tests/unit/`, many `src/**/*.test.ts` | Mock `db`, storage, AI, and auth; assert logic in isolation |
| **Integration** | `tests/integration/`, some `src/app/api/**/*.test.ts` | Exercise wiring between modules; still often use `vi.mock` for DB and externals |
| **E2E** | `tests/e2e/` | Real browser against a running app; minimal mocking; requires live services |

There is no shared `tests/helpers` module for Vitest; copy mocking patterns from tests in the same layer. E2E specs share helpers under `tests/e2e/support/`.

### Billing test patterns

Billing is covered across server logic, API routes, client hooks, and schema contracts. Use these patterns when adding or changing Stripe/credit-gated behavior.

**Where billing tests live**

| Layer | Files |
|-------|-------|
| Server billing | `src/server/billing/credits.test.ts`, `gates.test.ts`, `events.test.ts`, `sessions.test.ts`, `access.test.ts`, `beta.test.ts`, `credit-operation-key.test.ts` |
| Billing API routes | `src/app/api/billing/checkout/route.test.ts`, `portal/route.test.ts`, `webhook/route.test.ts`, `status/route.test.ts`, `history/route.test.ts` |
| Client hooks / UI | `src/lib/hooks/use-billing.test.tsx`, `src/components/settings/BillingTab.test.tsx` |
| Conversion contracts | `src/lib/billing/conversion-contract.test.ts`, `src/lib/billing/conversion-gate.test.ts` |
| Schema | `tests/unit/billing-schema.test.ts` |
| Credit-gated routes | Co-located route tests that `vi.mock("@/server/billing/gates")` (for example `src/app/api/derivations/[id]/regenerate/route.test.ts`) |

**Credit and gate logic** (`credits.test.ts`, `gates.test.ts`):

- Mock `@/server/billing/access`, `@/server/repositories/billing`, and `@/server/repositories/usage` before importing the module under test.
- Spy on `db.transaction` when exercising transactional credit deduction.
- For `spendCreditsOrApiError`, mock `recordUsage` to return `status: "recorded"` (allowed) or `status: "blocked"` (402 with conversion payload).
- Assert blocked responses use HTTP **402** and include structured `code` / `details` (for example `beta_exhausted`, `recommendedAction: "checkout"`).

**Stripe webhook** (`webhook/route.test.ts`):

- Use `vi.hoisted()` for Stripe client mocks so they are available inside `vi.mock` factories.
- Mock `@/server/validation/env` for `STRIPE_WEBHOOK_SECRET`.
- Mock `@/server/billing/events` `processStripeEvent` separately from signature verification.
- Build `Request` objects with optional `stripe-signature` header; assert `400` for missing/invalid signatures and `200` when `constructEvent` + `processStripeEvent` succeed.

**React Query hooks** (`use-billing.test.tsx`):

- Mock `@/lib/api-client` `apiFetch`.
- Wrap hooks with a fresh `QueryClient` (`retry: false`) via `renderHook` + `QueryClientProvider`.
- Reset `window.location.href` in `beforeEach` when testing checkout redirects.

**Schema contracts** (`billing-schema.test.ts`):

- Import Drizzle table objects from `@/server/db/schema` and assert expected column keys exist (`billingCustomers`, `subscriptions`, `creditGrants`, `processedStripeEvents`).

**Credit-gated API routes**:

- Mock `spendCreditsOrApiError` from `@/server/billing/gates` to return `null` (allowed) or a `Response` (blocked) without hitting Stripe or the database.
- Keep idempotency keys and `workspaceId` in test fixtures aligned with production call sites.

---

## Coverage requirements

No minimum coverage thresholds are defined in `app/config/vitest.config.ts` or enforced in CI. Generated coverage output is ignored via `app/.gitignore` (`/coverage`).

| Type | Threshold |
|------|-----------|
| Lines | Not configured |
| Branches | Not configured |
| Functions | Not configured |
| Statements | Not configured |

---

## CI integration

**Workflow:** `.github/workflows/ci.yml`  
**Job:** `test`  
**Triggers:** `push` and `pull_request` to `main`

| Step | Command / action |
|------|------------------|
| Postgres service | `postgres:16-alpine`, database `adscale_test`, port `5432` |
| Install | `cd app && npm ci` |
| Lint | `cd app && npm run lint` |
| Typecheck | **⚠ CI gap:** `cd app && npm run typecheck` — the script is **not yet defined** in `app/package.json`, so the workflow currently fails at this step. Local fallback: `npx tsc --noEmit` from `app/` (see [DEVELOPMENT.md](./DEVELOPMENT.md)). Track adding a `"typecheck": "tsc --noEmit"` script to `app/package.json` to unblock CI. |
| Migrations | `cd app && npx drizzle-kit migrate` with `DATABASE_URL=postgres://test:test@localhost:5432/adscale_test` |
| **Tests** | `cd app && npm test -- --run` with `DATABASE_URL` and `NODE_ENV=test` |
| Build | `cd app && npm run build` (with test env vars for auth, OpenAI, R2, Inngest) |

CI does not run `test:db:setup`; it relies on the GitHub Actions Postgres service and `DATABASE_URL` on port **5432**, while local Docker setup from `test:db:setup` defaults to port **5433**.

CI does **not** run Playwright E2E tests or the visual release gate; those are manual/local verification (or run via `npm run release-gate` before a release).

---

## Next steps

- [GETTING-STARTED.md](./GETTING-STARTED.md) — prerequisites, env, and first run  
- [DEVELOPMENT.md](./DEVELOPMENT.md) — scripts, lint, and workflow  
- [CONFIGURATION.md](./CONFIGURATION.md) — environment variables used at runtime and in tests  
- `app/README.md` — focused test command for billing/auth changes and Stripe manual smoke steps
