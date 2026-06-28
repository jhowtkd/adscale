<!-- generated-by: gsd-doc-writer -->

# Development

Day-to-day workflow for the ADScale Next.js application in `app/`. For first-time machine setup, prerequisites, and Docker Postgres, see [GETTING-STARTED.md](./GETTING-STARTED.md). For environment variables, see [CONFIGURATION.md](./CONFIGURATION.md). For test patterns and CI details, see [TESTING.md](./TESTING.md).

All commands below are run from the `app/` directory unless noted otherwise.

## Local setup

1. **Clone and install** (from repository root):

   ```bash
   git clone https://github.com/jhowtkd/adscale.git
   cd adscale/app   # local clone may be named ADScale_2
   npm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env.local
   ```

   Fill in credentials in `.env.local`. The app validates required variables at startup via Zod (`src/server/validation/env.ts`); missing values can break dev, build, and tests.

3. **Start PostgreSQL** (recommended: Docker Compose in `app/`):

   ```bash
   docker compose up postgres -d
   ```

   Default connection (matches `docker-compose.yml`):

   `postgresql://adscale:adscale123@localhost:5432/adscale_db?sslmode=disable`

   Set `DATABASE_URL` in `.env.local` accordingly.

4. **Apply migrations:**

   ```bash
   npm run db:migrate
   ```

5. **Start development** (Next.js + Inngest dev server):

   ```bash
   npm run dev
   ```

   Open **http://localhost:3000**. Inngest Dev UI: **http://localhost:8288**.

For Stripe webhooks, billing smoke tests, and the full Docker stack, see [`app/README.md`](../app/README.md) and [GETTING-STARTED.md](./GETTING-STARTED.md).

## Build commands

### Development, build, and lint

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server + Inngest dev CLI (see [Inngest development](#inngest-development)) |
| `npm run dev:next` | Next.js dev only (`localhost:3000`) |
| `npm run build` | Production build (`next build --webpack`); runs `postbuild` (`scripts/prepare-standalone.mjs`) |
| `npm run start` | Serve production build |
| `npm run start:prod` | Production start with Inngest sync (`scripts/start-with-inngest-sync.mjs`) |
| `npm run analyze` | Production build with bundle analyzer (`ANALYZE=true`) |
| `npm run analyze:ci` | CI-oriented bundle analysis (`scripts/analyze-bundle.mjs`) |
| `npm run lint` | ESLint (`eslint`) |
| `npm run inngest:dev` | Inngest dev server only (app must be running) |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Vitest single run (`config/vitest.config.ts`) |
| `npm run test:e2e` | Playwright E2E tests (`tests/e2e/*.spec.ts`; requires running app + Inngest) |
| `npm run test:visual-release` | Playwright visual/a11y release specs (`playwright.release.config.ts`) |
| `npm run test:db:setup` | Start Docker Postgres for tests (port 5433) |
| `npm run test:db:teardown` | Stop/remove test Postgres container |

### Database and seeds

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Drizzle migration from schema |
| `npm run db:migrate` | Apply Drizzle migrations (`scripts/migrate-with-retry.mjs`) |
| `npm run db:push` | Push schema to database (no migration file) |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed:dev-admin` | Seed a dev admin user (`scripts/seed-dev-admin.ts`) |
| `npm run seed:stripe` | Seed Stripe products/prices for local billing (`scripts/seed-stripe-real.ts`) |
| `npm run preflight:stripe` | Offline/live Stripe billing preflight (`scripts/preflight-stripe-billing.ts`) |
| `npm run seed:testsprite` | Seed data for TestSprite workflows (`scripts/seed-testsprite.ts`) |

### Release gates and evidence

These scripts orchestrate phase release checks and write evidence JSON under `.planning/phases/`. Use when working on quality gates or milestone sign-off — not part of everyday feature development.

| Command | Description |
|---------|-------------|
| `npm run release-gate` | Full release gate: unit tests, lint, build, visual release, evidence check |
| `npm run creative-release-gate` | Creative validation release gate (phase 123) |
| `npm run output-learning-release-gate` | Output-learning release gate |
| `npm run real-quality-release-gate` | Real-quality release gate |
| `npm run operational-quality-release-gate` | Operational-quality release gate |
| `npm run validate:creative` | Check creative validation evidence (final stage) |
| `npm run validate:creative:live` | Run live creative validation (`scripts/run-creative-validation.ts`) |
| `npm run score-calibration-evidence` | Score calibration evidence check |
| `npm run learning-impact-evidence` | Learning impact evidence check |
| `npm run quality-improvement-evidence` | Quality improvement evidence check (phase 132) |
| `npm run real-quality-release-evidence` | Real-quality release evidence check (phase 133) |
| `npm run operational-quality-release-evidence` | Operational-quality release evidence check (phase 137) |
| `npm run olhar-release-evidence` | Olhar/Cenbrap release evidence check (phase 142) |
| `npm run olhar-release-evidence:build` | Build Olhar release evidence JSON from calibration data |
| `npm run sample-coverage-evidence` | Sample coverage evidence across workspaces |
| `npm run quality-trend-evidence` | Quality trend evidence across workspaces |

## Billing development

Production Stripe billing (v12.0) lives under:

| Area | Path | Role |
|------|------|------|
| Server domain | `src/server/billing/` | Plans, credits, gates, webhooks, Stripe client, entitlements |
| API routes | `src/app/api/billing/` | Checkout, portal, webhook, status, history, beta redeem |
| Client helpers | `src/lib/billing/` | Conversion gate and client contracts |
| UI | `src/components/billing/`, `src/components/settings/BillingTab.tsx` | Conversion CTAs and account billing UI |

**Local Stripe setup**

1. Copy test-mode keys and Price IDs into `.env.local` (see [CONFIGURATION.md](./CONFIGURATION.md)).
2. Optionally seed catalog data: `npm run seed:stripe`.
3. Forward webhooks while the app is running:

   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

   Use the emitted `whsec_...` value as `STRIPE_WEBHOOK_SECRET`.

**Preflight before go-live**

```bash
npm run preflight:stripe -- --offline          # env + plan config only
npm run preflight:stripe -- --app-url=https://...  # optional live Stripe checks
```

**Focused billing regression subset** (after broader changes, run the full suite):

```bash
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts tests/integration/auth-workspace-access.test.ts
```

The v12.0 billing regression gate is the full Vitest suite (`npm test` — current count in [TESTING.md](./TESTING.md)). Manual Stripe smoke steps are in [`app/README.md`](../app/README.md#manual-stripe-smoke).

## Database migrations

Schema is managed with **Drizzle ORM** and **drizzle-kit**. Configuration lives in `app/drizzle.config.ts` (schema: `src/server/db/schema.ts`, migrations output: `app/drizzle/`, PostgreSQL schema `adscale_app`).

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Apply pending SQL migrations to the database pointed at by `DATABASE_URL` |
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:push` | Push schema directly to the database (dev prototyping; prefer migrations for shared environments) |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL` |

**Typical schema change workflow:**

1. Edit `src/server/db/schema.ts`.
2. `npm run db:generate` — review the new file under `drizzle/`.
3. `npm run db:migrate` — apply locally.
4. Commit migration SQL and journal updates with your feature.

**Checks:**

```bash
npx drizzle-kit check
```

Migrations `0008`–`0013` include idempotent guards (`IF NOT EXISTS` / duplicate-object handling). If `__drizzle_migrations` has stale checksums for those versions, reconcile before running `migrate` (see [`app/README.md`](../app/README.md)).

Ensure `DATABASE_URL` is set when running any `db:*` command (loaded from `.env.local` by your shell or tooling; drizzle-kit reads `process.env.DATABASE_URL`).

## Inngest development

Background jobs (derivations, scoring, billing side effects, etc.) run through **Inngest**. The Next.js serve endpoint is at `/api/inngest`.

### Combined dev (recommended)

`npm run dev` runs `scripts/dev-with-inngest.mjs`, which starts:

1. **Next.js** — `next dev --webpack --hostname 0.0.0.0 --port 3000`
2. **Inngest CLI** — `inngest-cli dev -u http://localhost:3000/api/inngest`

Stopping one process (Ctrl+C) tears down both.

### Next.js only

```bash
npm run dev:next
```

Background jobs will not execute unless you start Inngest separately:

```bash
npm run inngest:dev
```

(`inngest-cli dev -u http://localhost:3000/api/inngest`)

### Local Inngest credentials

For local dev, `.env.example` uses:

- `INNGEST_EVENT_KEY=local`
- `INNGEST_SIGNING_KEY=local`

### Docker full stack

With `docker compose --profile dev`, the Inngest container targets `http://app:3000/api/inngest` and exposes the dev UI on port **8288**. Docker uses `.env.docker`, not `.env.local` — see [`app/DOCKER.md`](../app/DOCKER.md).

## Code style

| Tool | Location | How to run |
|------|----------|------------|
| **ESLint** | `app/eslint.config.mjs` | `npm run lint` |
| **TypeScript** | `app/tsconfig.json` (strict) | `npx tsc --noEmit` |

ESLint 9 uses flat config with `eslint-config-next` (`core-web-vitals` + `typescript` presets). No Prettier, Biome, or `.editorconfig` is configured in this repository. Follow existing patterns in neighboring files (imports, `@/` path alias, server vs client component boundaries).

CI (`.github/workflows/ci.yml`) enforces **lint**, **typecheck**, **migrations**, **tests**, and **build** on pushes and pull requests to `main`. The workflow runs `npm run typecheck`, but `app/package.json` does not define that script yet — use `npx tsc --noEmit` locally until a `typecheck` script is added (for example `"typecheck": "tsc --noEmit"`).

## Lint and tests

### Lint

```bash
npm run lint
```

### TypeScript

```bash
npx tsc --noEmit
```

### Unit and integration tests

**Vitest** with jsdom and Testing Library (`config/vitest.config.ts`, setup: `tests/setup.ts`):

```bash
npm test
```

Equivalent:

```bash
npx vitest run --config config/vitest.config.ts --passWithNoTests
```

**Integration / DB tests** — optional Docker Postgres on port **5433**:

```bash
npm run test:db:setup
npm test
npm run test:db:teardown
```

Set `TEST_DATABASE_URL` in `.env.local` (see `.env.example`) when using the test container.

**Watch mode** (not a package script; invoke Vitest directly):

```bash
npx vitest --config config/vitest.config.ts
```

### E2E tests (Playwright)

Playwright config: `app/playwright.config.ts`. Tests live in `app/tests/e2e/` (`*.spec.ts`).

```bash
npm run test:e2e
```

Visual release specs use `playwright.release.config.ts` and run via `npm run test:visual-release` (also invoked by `npm run release-gate`).

E2E cases expect a running server (typically `npm run start` or production build) with Inngest dev up and `E2E_DISABLE_RATE_LIMIT=true`. See `playwright.config.ts` for `E2E_BASE_URL` and timeout settings.

Focused billing/auth examples are listed in [Billing development](#billing-development) and [`app/README.md`](../app/README.md#verification). Full test layout and CI steps: [TESTING.md](./TESTING.md).

### Pre-push checklist

```bash
npm run lint
npx tsc --noEmit
npm run db:migrate   # when schema changed
npm test
npm run build
```

When touching billing or Stripe config, also run `npm run preflight:stripe -- --offline` and the focused billing test subset above.

## Branch conventions

Default branch: **`main`**.

No branch naming convention is documented in `CONTRIBUTING.md` or pull request templates. Recent branches use prefixes such as `feat/`, `feature/`, `pr/`, `codex/`, and `cursor/`. Prefer short, descriptive names tied to the change (for example `feat/waitlist` or `pr/v12.5-133-release-gate`).

## Pull request process

There is no `.github/PULL_REQUEST_TEMPLATE.md` in this repository. Before opening a PR:

- Target **`main`**.
- Run lint, TypeScript check, tests, and build from `app/` (see [Lint and tests](#lint-and-tests)).
- Include migration files when schema changes (`drizzle/` + `npm run db:migrate` verified locally).
- Describe user-visible behavior, API changes, and any new or required env vars (update `app/.env.example` when adding configuration).
- For billing changes, note Stripe webhook/event impact and whether `seed:stripe` or `preflight:stripe` was run.

Reviewers typically expect green CI: install → lint → typecheck → `npx drizzle-kit migrate` against CI Postgres → test → build (`.github/workflows/ci.yml`). Open issues via GitHub Issues; no issue templates are checked in under `.github/ISSUE_TEMPLATE/`.

## Related docs

- [GETTING-STARTED.md](./GETTING-STARTED.md) — Prerequisites, env setup, first run
- [CONFIGURATION.md](./CONFIGURATION.md) — Environment variable reference
- [TESTING.md](./TESTING.md) — Vitest layout, patterns, coverage, CI
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System structure and data flow
- [`app/README.md`](../app/README.md) — Stripe test mode, verification commands, migration notes
