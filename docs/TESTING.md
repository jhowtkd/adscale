<!-- generated-by: gsd-doc-writer -->
# Testing

This guide describes how to run and write tests for the ADScale Next.js application in `app/`. For local setup and environment variables, see [GETTING-STARTED.md](./GETTING-STARTED.md) and [CONFIGURATION.md](./CONFIGURATION.md). For day-to-day development commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Test framework and setup

| Tool | Version (from `app/package.json`) | Role |
|------|-----------------------------------|------|
| **Vitest** | `^4.1.5` | Test runner |
| **jsdom** | `^29.0.2` | DOM environment for React/component tests |
| **@testing-library/react** | `^16.3.2` | Render and interact with components |
| **@testing-library/jest-dom** | `^6.9.1` | DOM matchers (`toBeInTheDocument`, etc.) |
| **@vitejs/plugin-react** | `^6.0.1` | JSX/React transform during tests |

**Configuration:** `app/config/vitest.config.ts`

- `environment: "jsdom"` — browser-like APIs for UI tests
- `globals: true` — Vitest globals available (many files still import `describe` / `it` / `expect` / `vi` explicitly)
- `setupFiles: ["./tests/setup.ts"]` — runs before each test file
- Path alias `@` → `app/src` (same as the app)
- When `TEST_DATABASE_URL` is set in the environment, Vitest forwards it into `process.env` for tests that need it

**Global setup:** `app/tests/setup.ts` registers jest-dom matchers:

```ts
import "@testing-library/jest-dom";
```

**Prerequisites:** From `app/`, run `npm install` once. Most tests mock the database, auth, and external services; CI and optional local DB workflows use PostgreSQL (see [CI integration](#ci-integration) and optional scripts below).

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

The project currently has **115** test files (`*.test.ts` / `*.test.tsx`) under `app/src/` (co-located with source) and `app/tests/` (shared unit/integration suites).

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

---

## Writing new tests

### File naming and placement

| Pattern | Location | Typical use |
|---------|----------|-------------|
| `*.test.ts` / `*.test.tsx` next to source | `app/src/**` | API routes, hooks, components, server modules |
| `*.test.ts` / `*.test.tsx` | `app/tests/unit/` | Pure logic, schemas, repositories (mocked DB) |
| `*.test.ts` | `app/tests/integration/` | Multi-module flows, auth guards, API behavior |

Use the `.test.ts` or `.test.tsx` suffix (not `.spec.*`).

### Conventions

- Import from `vitest`: `describe`, `it`, `expect`, `vi`, and lifecycle hooks (`beforeEach`, etc.).
- Mock dependencies with `vi.mock("module-path", () => ({ ... }))` before importing the module under test. See `app/tests/integration/auth-workspace-access.test.ts` and `app/tests/integration/campaign-crud.test.ts` for repository and auth patterns.
- Use `@/` imports for application code (resolved via Vitest config).
- React components: `@testing-library/react` plus jest-dom matchers from setup.
- Env validation tests live in `app/tests/unit/env-validation.test.ts` and `app/src/server/validation/env.test.ts`; keep required env shapes consistent with `app/.env.example`.

### Unit vs integration

| Type | Directory | Approach |
|------|-----------|----------|
| **Unit** | `tests/unit/`, many `src/**/*.test.ts` | Mock `db`, storage, AI, and auth; assert logic in isolation |
| **Integration** | `tests/integration/`, some `src/app/api/**/*.test.ts` | Exercise wiring between modules; still often use `vi.mock` for DB and externals |

There is no shared `tests/helpers` module; copy mocking patterns from tests in the same layer (unit vs integration).

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
| Typecheck | `cd app && npm run typecheck` |
| Migrations | `cd app && npx drizzle-kit migrate` with `DATABASE_URL=postgres://test:test@localhost:5432/adscale_test` |
| **Tests** | `cd app && npm test -- --run` with `DATABASE_URL` and `NODE_ENV=test` |
| Build | `cd app && npm run build` (with test env vars for auth, OpenAI, R2, Inngest) |

CI does not run `test:db:setup`; it relies on the GitHub Actions Postgres service and `DATABASE_URL` on port **5432**, while local Docker setup from `test:db:setup` defaults to port **5433**.

---

## Next steps

- [GETTING-STARTED.md](./GETTING-STARTED.md) — prerequisites, env, and first run  
- [DEVELOPMENT.md](./DEVELOPMENT.md) — scripts, lint, and workflow  
- [CONFIGURATION.md](./CONFIGURATION.md) — environment variables used at runtime and in tests  
- `app/README.md` — focused test command for billing/auth changes  
