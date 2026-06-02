<!-- generated-by: gsd-doc-writer -->

# Getting Started

Set up the ADScale Next.js application (`app/`) on your machine: install dependencies, configure environment variables from `app/.env.example`, run database migrations, and start the dev server with Inngest for background jobs.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ (Docker and CI use Node 20) | Run Next.js, Vitest, and Drizzle |
| **npm** | Bundled with Node | Install dependencies (`app/package-lock.json`) |
| **PostgreSQL** | 16+ recommended | App database (`DATABASE_URL`) |
| **Git** | Any recent version | Clone the repository |

**External services** (credentials required for a full local run; see [Environment setup](#environment-setup)):

- **OpenAI** — text and image generation (`OPENAI_API_KEY`)
- **Cloudflare R2** — asset storage (S3-compatible keys in `.env.example`)
- **Stripe** — test-mode keys and three Price IDs for subscription plans
- **Resend** — transactional email (`RESEND_API_KEY`, `EMAIL_FROM`)
- **Inngest** — background jobs; use `local` for `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` during local dev

**Optional:**

- **Google / GitHub OAuth** — leave `GOOGLE_*` and `GITHUB_*` empty to use email/password only
- **Stripe CLI** — forward webhooks to `localhost:3000` for billing flows
- **Docker** — `app/docker-compose.yml` provides PostgreSQL 16 (and optional full stack); see [Common setup issues](#common-setup-issues)

## Installation steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/jhowtkd/adscale.git
   cd adscale
   ```

   If your checkout is named differently (for example `ADScale_2`), `cd` into that folder instead.

2. **Install application dependencies**

   All runnable scripts live under `app/`:

   ```bash
   cd app
   npm install
   ```

3. **Create local environment file**

   ```bash
   cp .env.example .env.local
   ```

   Edit `app/.env.local` with real values. Next.js and project scripts load `.env.local` (not `.env.example`).

4. **Start PostgreSQL** (if not using a hosted database)

   With Docker Compose from `app/`:

   ```bash
   docker compose up -d postgres
   ```

   Default container credentials (`app/docker-compose.yml`): user `adscale`, password `adscale123`, database `adscale_db`, port `5432`. Point `DATABASE_URL` at:

   ```text
   postgresql://adscale:adscale123@localhost:5432/adscale_db?sslmode=disable
   ```

   The placeholder in `.env.example` (`postgresql://user:password@localhost:5432/adscale`) is a template—update it to match your actual Postgres instance.

5. **Apply database migrations**

   ```bash
   npm run db:migrate
   ```

   Other database scripts: `npm run db:generate`, `npm run db:push`, `npm run db:studio`.

## Environment setup

Copy `app/.env.example` to `app/.env.local` and set at least the variables validated in `app/src/server/validation/env.ts`. Missing or invalid values throw at runtime when server code reads `env` (for example `Env validation failed for BETTER_AUTH_SECRET: ...`).

**Core (required for local dev)**

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | PostgreSQL URL (see [Installation steps](#installation-steps)) |
| `BETTER_AUTH_SECRET` | Random secret, **minimum 32 characters** |
| `BETTER_AUTH_URL` | `http://localhost:3000` for local dev |
| `APP_URL` | `http://localhost:3000` (must match how you open the app) |
| `OPENAI_API_KEY` | Must start with `sk-` |
| `OPENAI_TEXT_MODEL` | Default in example: `gpt-5-mini` |
| `OPENAI_IMAGE_MODEL` | Default in example: `gpt-image-2-2026-04-21` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Cloudflare R2; public base must be a valid HTTPS URL |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Use `local` for both when running the Inngest dev server locally |
| `RESEND_API_KEY` | Must start with `re_` |
| `EMAIL_FROM` | Sender string (example: `ADScale <onboarding@resend.dev>`) |

**Stripe (required for billing UI and credit gates)**

| Variable | Notes |
|----------|--------|
| `STRIPE_SECRET_KEY` | Test key; must start with `sk_` or `rk_` |
| `STRIPE_WEBHOOK_SECRET` | From Stripe CLI or Dashboard; must start with `whsec_` |
| `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` | Stripe Price IDs (`price_...`) |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Defaults in `.env.example` point at localhost settings routes |

**Optional in `.env.example`**

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — OAuth
- `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` — error reporting
- `TEST_DATABASE_URL` — integration tests (default `postgres://test:test@localhost:5433/adscale_test`)

For the full variable list, defaults, and validation rules, see [CONFIGURATION.md](CONFIGURATION.md).

## First run

From `app/`:

```bash
npm run dev
```

This runs `scripts/dev-with-inngest.mjs`, which starts:

- **Next.js** — `next dev --webpack --hostname 0.0.0.0 --port 3000`
- **Inngest dev** — `inngest-cli dev -u http://localhost:3000/api/inngest`

Open **http://localhost:3000**, sign up, and create a workspace and campaign.

**Alternatives**

| Command | What it does |
|---------|----------------|
| `npm run dev:next` | Next.js only (no Inngest dev server; background jobs will not run locally) |
| `npm run inngest:dev` | Inngest dev server only (if Next.js is already running) |
| `npm run start` | Production server after `npm run build` |

## Common setup issues

### Missing or invalid environment variables

Server modules validate env via Zod (`app/src/server/validation/env.ts`). Typical failures:

- `BETTER_AUTH_SECRET` shorter than 32 characters
- `OPENAI_API_KEY` not starting with `sk-`
- `RESEND_API_KEY` not starting with `re_`
- `STRIPE_WEBHOOK_SECRET` not starting with `whsec_`
- Stripe Price IDs not starting with `price_`

Fix the named variable in `.env.local` and restart `npm run dev`.

### Database connection refused or wrong database

- Confirm Postgres is running and `DATABASE_URL` matches host, port, user, password, and database name.
- If using `docker compose up -d postgres`, use the `adscale` / `adscale123` / `adscale_db` URL above—not the generic placeholder from `.env.example` unless you created that database manually.
- After changing `DATABASE_URL`, run `npm run db:migrate` again.

### Port 3000 already in use

Another process is bound to port 3000. Stop it or change the Next.js port in `package.json` scripts (`dev:next` / `dev-with-inngest.mjs`) and align `APP_URL`, `BETTER_AUTH_URL`, and Inngest’s `-u` URL.

### Inngest jobs not running

Use `npm run dev` (not `dev:next` alone). Ensure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set ( `local` is fine). The dev UI is served by `inngest-cli` alongside Next.js.

### Stripe webhooks not updating billing state locally

Forward events to the app webhook:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Set `STRIPE_WEBHOOK_SECRET` to the `whsec_...` value from the CLI. See `app/README.md` for the event list and a manual billing smoke checklist.

### Migration errors on an existing database

The Drizzle journal may be out of sync if migrations were applied manually. See the migration note in `app/README.md` before re-running `npm run db:migrate`.

## Next steps

- **[README.md](../README.md)** — Product overview, features, and quick usage
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Components, data flow, and directory layout
- **[CONFIGURATION.md](CONFIGURATION.md)** — Complete environment and config reference
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Day-to-day dev workflow, scripts, lint, and PR process
- **[TESTING.md](TESTING.md)** — Running Vitest and database test setup
- **`app/README.md`** — Stripe test mode, focused test commands, and Docker notes (`app/DOCKER.md`)
