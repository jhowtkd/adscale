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

**Playwright configuration:** `app/playwright.config.ts`

- `testDir: "./tests/e2e"`, `testMatch: /.*\.spec\.ts$/`
- Default `baseURL`: `http://localhost:3000` (override with `E2E_BASE_URL`)
- Long timeouts (240s per test) for async Inngest/OpenAI image jobs

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
npx vitest run --config config/vitest.config.ts --passWithNoTests
```

The project currently has **187** Vitest test files (`*.test.ts` / `*.test.tsx`) under `app/src/` (co-located with source) and `app/tests/` (shared unit/integration suites), with **1000+** individual test cases (for example, 1006 passing and 1 skipped in a full local run).

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

E2E specs live in `app/tests/e2e/` and use the `*.spec.ts` suffix. They are **not** run by `npm test`; use the dedicated script:

```bash
npm run test:e2e
```

**Prerequisites for E2E:**

1. App running on `http://localhost:3000` (for example `npm run start` after a build, or a production-like local server).
2. Inngest dev server available so async image-generation jobs complete.
3. `E2E_DISABLE_RATE_LIMIT=true` on the app process (restyle upload flows hit rate limits otherwise).
4. Test fixtures in `app/tests/fixtures/` (`base.png`, `style.png`, etc.) for file-upload scenarios.

The current suite (`tests/e2e/restyle.spec.ts`) covers restyle upload flows that require real `<input type="file">` attachments — cases the TestSprite cloud runner cannot execute. Playwright logs in with the dev-admin seed credentials and exercises TC014/TC019-style flows with a 240s per-test timeout.

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
- E2E: use `@playwright/test`; put shared helpers and fixture paths next to specs (see `tests/e2e/restyle.spec.ts`).

### Unit vs integration

| Type | Directory | Approach |
|------|-----------|----------|
| **Unit** | `tests/unit/`, many `src/**/*.test.ts` | Mock `db`, storage, AI, and auth; assert logic in isolation |
| **Integration** | `tests/integration/`, some `src/app/api/**/*.test.ts` | Exercise wiring between modules; still often use `vi.mock` for DB and externals |
| **E2E** | `tests/e2e/` | Real browser against a running app; minimal mocking; requires live services |

There is no shared `tests/helpers` module; copy mocking patterns from tests in the same layer (unit vs integration vs e2e).

---

## Coverage requirements

No minimum coverage thresholds are defined in `app/config/vitest.config.ts` or enforced in CI. Generated coverage output is ignored via `app/.gitignore` (`/coverage`).

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
| Typecheck | `cd app && npm run typecheck` — the workflow expects this script; if it is missing from `app/package.json`, use `npx tsc --noEmit` locally (see [DEVELOPMENT.md](./DEVELOPMENT.md)) |
| Migrations | `cd app && npx drizzle-kit migrate` with `DATABASE_URL=postgres://test:test@localhost:5432/adscale_test` |
| **Tests** | `cd app && npm test -- --run` with `DATABASE_URL` and `NODE_ENV=test` |
| Build | `cd app && npm run build` (with test env vars for auth, OpenAI, R2, Inngest) |

CI does not run `test:db:setup`; it relies on the GitHub Actions Postgres service and `DATABASE_URL` on port **5432**, while local Docker setup from `test:db:setup` defaults to port **5433**.

CI does **not** run Playwright E2E tests; those are manual/local verification against a running server.

---

## Next steps

- [GETTING-STARTED.md](./GETTING-STARTED.md) — prerequisites, env, and first run  
- [DEVELOPMENT.md](./DEVELOPMENT.md) — scripts, lint, and workflow  
- [CONFIGURATION.md](./CONFIGURATION.md) — environment variables used at runtime and in tests  
- `app/README.md` — focused test command for billing/auth changes  
