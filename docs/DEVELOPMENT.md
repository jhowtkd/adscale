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

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server + Inngest dev CLI (see [Inngest development](#inngest-development)) |
| `npm run dev:next` | Next.js dev only (`localhost:3000`) |
| `npm run build` | Production build (`next build --webpack`) |
| `npm run start` | Serve production build |
| `npm run start:prod` | Production start with Inngest sync (`scripts/start-with-inngest-sync.mjs`) |
| `npm run analyze` | Production build with bundle analyzer (`ANALYZE=true`) |
| `npm run analyze:ci` | CI-oriented bundle analysis (`scripts/analyze-bundle.mjs`) |
| `npm run lint` | ESLint |
| `npm test` | Vitest single run |
| `npm run test:e2e` | Playwright E2E tests (`tests/e2e/*.spec.ts`; requires running app + Inngest) |
| `npm run test:db:setup` | Start Docker Postgres for tests (port 5433) |
| `npm run test:db:teardown` | Stop/remove test Postgres container |
| `npm run inngest:dev` | Inngest dev server only (app must be running) |
| `npm run db:generate` | Generate Drizzle migration from schema |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:push` | Push schema to database (no migration file) |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed:dev-admin` | Seed a dev admin user (`scripts/seed-dev-admin.ts`) |
| `npm run seed:stripe` | Seed Stripe products/prices for local billing (`scripts/seed-stripe-real.ts`) |
| `npm run seed:testsprite` | Seed data for TestSprite workflows (`scripts/seed-testsprite.ts`) |

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

ESLint 9 uses `eslint-config-next` (core-web-vitals + TypeScript). No Prettier, Biome, or root `.editorconfig` is configured in this repository. Follow existing patterns in neighboring files (imports, `@/` path alias, server vs client component boundaries).

CI (`.github/workflows/ci.yml`) enforces **lint**, **typecheck**, **tests**, and **build** on pushes and pull requests to `main`. The workflow runs `npm run typecheck`, but `app/package.json` does not define that script yet — use `npx tsc --noEmit` locally until a `typecheck` script is added (for example `"typecheck": "tsc --noEmit"`).

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

E2E cases expect a running server (typically `npm run start` or production build) with Inngest dev up and `E2E_DISABLE_RATE_LIMIT=true`. See `playwright.config.ts` for `E2E_BASE_URL` and timeout settings.

Focused billing/auth examples are listed in [`app/README.md`](../app/README.md#verification). Full test layout and CI steps: [TESTING.md](./TESTING.md).

### Pre-push checklist

```bash
npm run lint
npx tsc --noEmit
npm run db:migrate   # when schema changed
npm test
npm run build
```

## Branch conventions

Default branch: **`main`**.

No branch naming convention is documented in `CONTRIBUTING.md` or pull request templates. Recent branches use prefixes such as `feat/`, `codex/`, `cursor/`, and `feature/`. Prefer short, descriptive names tied to the change (for example `feat/art-variation-extreme`).

## Pull request process

There is no `.github/PULL_REQUEST_TEMPLATE.md` in this repository. Before opening a PR:

- Target **`main`**.
- Run lint, TypeScript check, tests, and build from `app/` (see [Lint and tests](#lint-and-tests)).
- Include migration files when schema changes (`drizzle/` + `npm run db:migrate` verified locally).
- Describe user-visible behavior, API changes, and any new or required env vars (update `app/.env.example` when adding configuration).

Reviewers typically expect green CI: install → lint → typecheck → migrate against CI Postgres → test → build (`.github/workflows/ci.yml`). Open issues via GitHub Issues; no issue templates are checked in under `.github/ISSUE_TEMPLATE/`.

## Related docs

- [GETTING-STARTED.md](./GETTING-STARTED.md) — Prerequisites, env setup, first run
- [CONFIGURATION.md](./CONFIGURATION.md) — Environment variable reference
- [TESTING.md](./TESTING.md) — Vitest layout, patterns, coverage, CI
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System structure and data flow
- [`app/README.md`](../app/README.md) — Stripe test mode, verification commands, migration notes
