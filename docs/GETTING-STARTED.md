<!-- generated-by: gsd-doc-writer -->

# Getting Started

Set up the ADScale Next.js application (`app/`) on your machine: install dependencies, configure environment variables from `app/.env.example`, run database migrations, configure Stripe test-mode billing, and start the dev server with Inngest for background jobs.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20.19+ (CI and Docker use Node 20; Next.js 16 also supports 22.12+ and 24+) | Run Next.js, Vitest, and Drizzle |
| **npm** | Bundled with Node | Install dependencies (`app/package-lock.json`) |
| **PostgreSQL** | 16+ recommended | App database (`DATABASE_URL`) |
| **Git** | Any recent version | Clone the repository |

**External services** (credentials required for a full local run; see [Environment setup](#environment-setup)):

- **OpenAI** — text and image generation (`OPENAI_API_KEY`)
- **MiniMax** — assistant chat model (`MINIMAX_API_KEY`, required by `envSchema`; `MINIMAX_MODEL` defaults to `MiniMax-M3`)
- **Cloudflare R2** — asset storage (S3-compatible keys in `.env.example`)
- **Stripe** — test-mode secret key (`sk_test_...`), three Price IDs, and webhook signing secret
- **Resend** — transactional email (`RESEND_API_KEY`, `EMAIL_FROM`)
- **Inngest** — background jobs; use `local` for `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` during local dev

**Recommended for billing flows:**

- **Stripe CLI** — forward webhooks to `localhost:3000/api/billing/webhook` so checkout and subscription events update credit balances locally ([Billing setup](#billing-setup))

**Optional:**

- **Google / GitHub OAuth** — leave `GOOGLE_*` and `GITHUB_*` empty to use email/password only
- **Docker** — `app/docker-compose.yml` provides PostgreSQL 16 (and optional full stack); see [Common setup issues](#common-setup-issues)
- **Marketing site** — `MARKETING_UPSTREAM_URL` in `.env.example` points at a separate Vite landing (`site-adscale` repo on port 5173), proxied at `/hi` when `MARKETING_URL` is set
- **Mem0 brand memory** — set `MEM0_ENABLED=true` and `MEM0_API_KEY` (optional; not in `.env.example`)

## Installation steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/jhowtkd/adscale.git
   cd adscale
   ```

   If your checkout is named differently (for example `ADScale_2`), `cd` into that folder instead.

2. **Install application dependencies**

   All runnable scripts live under `app/` (the repository root only holds shared tooling such as `cross-env`):

   ```bash
   cd app
   npm install
   ```

3. **Create local environment file**

   ```bash
   cp .env.example .env.local
   ```

   Edit `app/.env.local` with real values. Next.js loads `.env.local` for `npm run dev`; project scripts load the same file via `app/scripts/load-env.ts`.

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

Replace placeholder secrets before starting the app—values like `replace-with-a-strong-random-secret` pass Zod length checks but must be unique random strings in real use.

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
| `MINIMAX_API_KEY` | MiniMax chat-model key required by the assistant orchestrator (`app/src/server/assistant/model/minimax-client.ts`); fails Zod validation if unset |

**Stripe (required for billing UI and credit gates)**

| Variable | Notes |
|----------|--------|
| `STRIPE_SECRET_KEY` | Test key (`sk_test_...`); must start with `sk_` or `rk_` |
| `STRIPE_WEBHOOK_SECRET` | From Stripe CLI or Dashboard; must start with `whsec_` |
| `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` | Real Stripe Price IDs (`price_...`) for Starter (30 credits/mo), Growth (120), Scale (360)—placeholders like `price_replace_starter` pass validation but fail against the Stripe API |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Defaults in `.env.example` point at localhost settings routes |

**Optional in `.env.example`**

- `MARKETING_URL` — public marketing landing URL; unauthenticated `/` redirects here when set (`app/src/proxy.ts`). Locally typically `http://localhost:3000/hi` (proxied marketing). Leave unset for local-only work (redirect falls back to `/login`).
- `MARKETING_UPSTREAM_URL` — upstream static site proxied at `/hi` via Next.js rewrites; locally `http://localhost:5173` (falls back to `https://adscale-marketing.onrender.com` when unset)
- `MARKETING_ALLOWED_ORIGINS` — CORS origins for `POST /api/waitlist` from the marketing site
- `RESEND_WAITLIST_SEGMENT_ID` — Resend Audiences segment for waitlist sync (optional in dev)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — OAuth
- `BETA_ACCESS_CODES` — comma-separated beta invite codes (10 ads per workspace, no Stripe checkout)
- `DEV_ADMIN_EMAIL` — comma-separated dev admin emails; skips email verification and credit debits for owner workspaces
- `MEM0_API_KEY`, `MEM0_ENABLED`, `MEM0_USER_PREFIX`, `MEM0_ORGANIZATION_ID`, `MEM0_PROJECT_ID` — optional Mem0 brand memory (supported in `envSchema`, not in `.env.example`)
- `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` — error reporting
- `TEST_DATABASE_URL` — integration tests (default `postgres://test:test@localhost:5433/adscale_test`; use `npm run test:db:setup` to start a dedicated test Postgres container on port 5433)

For the full variable list, defaults, and validation rules, see [CONFIGURATION.md](CONFIGURATION.md).

## Billing setup

Local billing (v12.0) requires Stripe **test mode** credentials and a webhook forwarder so checkout and subscription events sync credit balances.

### 1. Get Stripe test keys

1. Open the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) in **test mode**.
2. Copy the **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY` in `.env.local`.

### 2. Create subscription prices

Create three **recurring** Prices in the Stripe Dashboard (test mode) and map them to env vars:

| Plan | Env var | Credits/month |
|------|---------|-----------------|
| Starter | `STRIPE_STARTER_PRICE_ID` | 30 |
| Growth | `STRIPE_GROWTH_PRICE_ID` | 120 |
| Scale | `STRIPE_SCALE_PRICE_ID` | 360 |

There is no script to auto-create these prices—you must create them in Stripe and paste the `price_...` IDs into `.env.local`.

### 3. Forward webhooks with Stripe CLI

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then in a separate terminal:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the emitted `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.local`. Keep the CLI running while testing checkout.

The app expects these webhook events (see `app/scripts/preflight-stripe-billing.ts`):

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

### 4. Validate configuration

Offline env check (no Stripe API calls):

```bash
npm run preflight:stripe -- --offline
```

Live API check (verifies price IDs and webhook endpoint):

```bash
npm run preflight:stripe
```

### 5. Manual billing smoke (optional)

With `npm run dev` and Stripe CLI forwarding active:

1. Sign up or log in.
2. Confirm Settings → Billing shows no active plan or zero credits.
3. Try a paid generation and confirm it is blocked before enqueue.
4. Go to Settings → Plans and select a paid plan.
5. Complete Stripe Checkout with test card `4242 4242 4242 4242`.
6. Confirm webhook logs process checkout/subscription/invoice events.
7. Confirm Settings → Billing shows active plan and credits.
8. Trigger a generation and confirm credits decrease.
9. Open Customer Portal from Settings → Billing.

For focused billing test commands, see [`app/README.md`](../app/README.md).

## First run

From `app/`:

```bash
npm run dev
```

This runs `scripts/dev-with-inngest.mjs`, which starts:

- **Next.js** — `next dev --webpack --hostname 0.0.0.0 --port 3000`
- **Inngest dev** — `inngest-cli dev -u http://localhost:3000/api/inngest`

Open **http://localhost:3000**, sign up, and create a workspace and campaign.

**Local billing shortcut (optional)**

To exercise AI generation without completing Stripe Checkout, seed a dev admin workspace after migrations:

```bash
npm run seed:dev-admin -- --create --email=you@example.com --password='YourSecurePassword123!'
```

Set `DEV_ADMIN_EMAIL=you@example.com` in `.env.local` so the account skips credit debits. The app must be reachable at `BETTER_AUTH_URL` when using `--create` (start `npm run dev` first, or sign up manually and run with `--email` only).

To attach a real Stripe test customer and subscription for checkout/portal E2E flows (requires real test Price IDs in `.env.local`):

```bash
npm run seed:stripe -- --email=you@example.com
```

This runs `scripts/seed-stripe-real.ts`: it creates a Stripe test customer, attaches a test card, and subscribes the workspace to the Scale plan. It does **not** create Stripe products or prices. Run `seed:dev-admin` first if the user does not exist.

**Alternatives**

| Command | What it does |
|---------|----------------|
| `npm run dev:next` | Next.js only (no Inngest dev server; background jobs will not run locally) |
| `npm run inngest:dev` | Inngest dev server only (if Next.js is already running) |
| `npm run build` then `npm run start` | Production Next.js server (no Inngest sync) |
| `npm run start:prod` | Production server with Inngest sync (`scripts/start-with-inngest-sync.mjs`) |

## Common setup issues

### Missing or invalid environment variables

Server modules validate env via Zod (`app/src/server/validation/env.ts`). Typical failures:

- `BETTER_AUTH_SECRET` shorter than 32 characters
- `OPENAI_API_KEY` not starting with `sk-`
- `RESEND_API_KEY` not starting with `re_`
- `STRIPE_WEBHOOK_SECRET` not starting with `whsec_`
- Stripe Price IDs not starting with `price_`, or still set to `price_replace_*` placeholders

Fix the named variable in `.env.local` and restart `npm run dev`.

### Database connection refused or wrong database

- Confirm Postgres is running and `DATABASE_URL` matches host, port, user, password, and database name.
- If using `docker compose up -d postgres`, use the `adscale` / `adscale123` / `adscale_db` URL above—not the generic placeholder from `.env.example` unless you created that database manually.
- After changing `DATABASE_URL`, run `npm run db:migrate` again.

### Port 3000 already in use

Another process is bound to port 3000. Stop it or change the Next.js port in `package.json` scripts (`dev:next` / `dev-with-inngest.mjs`) and align `APP_URL`, `BETTER_AUTH_URL`, and Inngest’s `-u` URL.

### Inngest jobs not running

Use `npm run dev` (not `dev:next` alone). Ensure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set (`local` is fine). The dev UI is served by `inngest-cli` alongside Next.js.

### Stripe webhooks not updating billing state locally

1. Confirm `stripe listen --forward-to localhost:3000/api/billing/webhook` is running.
2. Set `STRIPE_WEBHOOK_SECRET` to the `whsec_...` value from the CLI output (not a Dashboard secret from a different endpoint).
3. Restart `npm run dev` after changing the webhook secret.
4. Run `npm run preflight:stripe` to verify price IDs and webhook configuration.

### Unauthenticated `/` redirects to a dead marketing URL

If `MARKETING_URL` is set (for example `http://localhost:3000/hi`) but `MARKETING_UPSTREAM_URL` (`http://localhost:5173`) is unreachable, visitors hitting `/` while logged out get redirected to a broken proxy. For local app-only work, remove `MARKETING_URL` from `.env.local`, or run the separate `site-adscale` landing on port 5173.

### Migration errors on an existing database

The Drizzle journal may be out of sync if migrations were applied manually. See the migration note in `app/README.md` before re-running `npm run db:migrate`.

## Next steps

- **[README.md](../README.md)** — Product overview, v12.0 billing features, and quick usage
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Components, data flow, and directory layout
- **[CONFIGURATION.md](CONFIGURATION.md)** — Complete environment and config reference
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Day-to-day dev workflow, scripts, lint, and PR process
- **[TESTING.md](TESTING.md)** — Running Vitest (~2200 tests across **495** test files; both numbers grow with the codebase) and database test setup
- **`app/README.md`** — Stripe test mode, focused billing test commands, and Docker notes (`app/DOCKER.md`)
