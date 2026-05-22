# Getting Started

This guide walks you through setting up ADScale on your local machine for development. By the end, you will have a running Next.js dev server, a local PostgreSQL database, and a working Inngest dev server for background jobs.

For architecture and configuration reference, see:

- [`README.md`](../README.md) — Project overview and tech stack
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — System architecture and data flow
- [`docs/CONFIGURATION.md`](CONFIGURATION.md) — Full environment variable reference

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone and Install](#clone-and-install)
3. [Environment Setup](#environment-setup)
4. [Database Setup](#database-setup)
5. [Running the Dev Server](#running-the-dev-server)
6. [First-Time Setup](#first-time-setup)
7. [Verifying the Installation](#verifying-the-installation)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Runtime and package manager |
| **npm** | 10+ | Dependency management (ships with Node) |
| **Docker** | Latest | Local PostgreSQL and optional Inngest container |
| **Docker Compose** | Latest | Orchestrates local services |

Verify your versions:

```bash
node --version   # v20.x.x or higher
npm --version    # 10.x.x or higher
docker --version
docker compose version
```

### External Service Accounts

ADScale integrates with several third-party services. You need active accounts and API keys for local development.

| Service | What You Need | Free Tier Available |
|---------|---------------|---------------------|
| **OpenAI** | API key (`sk-...`) | Yes — usage-based |
| **Cloudflare R2** | Account ID, access key, secret key, bucket | Yes — 10 GB/month |
| **Stripe** | Test-mode secret key (`sk_test_...`) | Yes — test mode is free |
| **Resend** | API key (`re_...`) | Yes — 100 emails/day |
| **Inngest** | Event key and signing key | Local dev server is free |

> **Tip:** For purely local development, you can set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to the literal string `local`. Stripe keys can use test-mode values (`sk_test_...`).

---

## Clone and Install

1. **Clone the repository:**

   ```bash
   git clone <repo-url>
   cd ADScale_2/app
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   This installs Next.js, Drizzle ORM, Better Auth, Stripe SDK, Inngest, and all other runtime and dev dependencies.

---

## Environment Setup

The application validates every environment variable at startup using Zod. **If any required variable is missing or invalid, the app will crash immediately** — even during `npm run build` or when running tests.

1. **Copy the example environment file:**

   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local`** and replace all placeholder values. The table below explains each variable and how to obtain it.

### Required Variables

| Variable | How to Set It |
|----------|---------------|
| `DATABASE_URL` | `postgresql://adscale:adscale123@localhost:5432/adscale_db?sslmode=disable` (matches the Docker Postgres setup) |
| `BETTER_AUTH_SECRET` | Run `openssl rand -base64 32` to generate a strong random secret. Must be **at least 32 characters**. |
| `BETTER_AUTH_URL` | `http://localhost:3000` for local development |
| `APP_URL` | `http://localhost:3000` for local development |
| `OPENAI_API_KEY` | From [OpenAI Platform](https://platform.openai.com/api-keys) — must start with `sk-` |
| `R2_ACCOUNT_ID` | From your Cloudflare R2 dashboard |
| `R2_ACCESS_KEY_ID` | Created in R2 "Manage R2 API Tokens" |
| `R2_SECRET_ACCESS_KEY` | Created alongside the access key |
| `R2_BUCKET` | Name of your R2 bucket (e.g., `adscale`) |
| `R2_PUBLIC_BASE_URL` | Public CDN endpoint for the bucket (e.g., `https://pub-xxx.r2.dev`) |
| `INNGEST_EVENT_KEY` | `local` (dev only) or from Inngest Cloud |
| `INNGEST_SIGNING_KEY` | `local` (dev only) or from Inngest Cloud |
| `RESEND_API_KEY` | From [Resend](https://resend.com/api-keys) — must start with `re_` |
| `EMAIL_FROM` | Sender address, e.g., `ADScale <onboarding@resend.dev>` |
| `STRIPE_SECRET_KEY` | From Stripe Dashboard → Developers → API keys — must start with `sk_` or `rk_` |
| `STRIPE_WEBHOOK_SECRET` | See [Stripe Webhook Setup](#stripe-webhook-setup) below |
| `STRIPE_STARTER_PRICE_ID` | Stripe Price ID for the Starter plan — must start with `price_` |
| `STRIPE_GROWTH_PRICE_ID` | Stripe Price ID for the Growth plan — must start with `price_` |
| `STRIPE_SCALE_PRICE_ID` | Stripe Price ID for the Scale plan — must start with `price_` |
| `STRIPE_SUCCESS_URL` | `http://localhost:3000/settings?tab=billing&checkout=success` |
| `STRIPE_CANCEL_URL` | `http://localhost:3000/settings?tab=plans&checkout=cancel` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` | Text model for creative planning |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2-2026-04-21` | Image model for derivations |

### Stripe Webhook Setup

For billing webhooks to work locally:

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Forward events to your local app:

   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

3. The CLI will output a webhook signing secret (`whsec_...`). Copy it into `STRIPE_WEBHOOK_SECRET`.

> If you do not need to test billing flows, you can temporarily use a dummy value like `whsec_dummy` for local server startup, but Stripe webhook verification will fail.

---

## Database Setup

You have two options for the database: **Docker PostgreSQL** (recommended for local dev) or an external PostgreSQL instance (e.g., Neon).

### Option A: Docker PostgreSQL (Recommended)

The repository includes a Docker Compose configuration that starts PostgreSQL 16 with the correct schema initialization.

1. **Start the database:**

   ```bash
   docker compose up postgres -d
   ```

   This creates:
   - Database: `adscale_db`
   - User: `adscale` / Password: `adscale123`
   - Schema: `adscale_app` (initialized automatically via `docker/postgres/init.sql`)
   - Port: `5432`

2. **Run migrations:**

   ```bash
   npm run db:migrate
   ```

   This applies all pending Drizzle migrations in the `drizzle/` directory.

3. **Verify the schema:**

   ```bash
   npx drizzle-kit check
   ```

### Option B: External PostgreSQL (Neon, etc.)

If you prefer a cloud database:

1. Create a PostgreSQL 16+ database.
2. Manually create the application schema:

   ```sql
   CREATE SCHEMA IF NOT EXISTS adscale_app;
   ```

3. Update `DATABASE_URL` in `.env.local` with your connection string.
4. Run `npm run db:migrate`.

### Migration Hygiene Note

Migrations `0008` through `0013` were made idempotent with `IF NOT EXISTS` guards. They are safe to re-run on databases where they may have been manually applied. If your `__drizzle_migrations` table contains old checksums for these migrations, reconcile those rows before running `migrate`.

---

## Running the Dev Server

### Standard Dev Mode (Recommended)

```bash
npm run dev
```

This command runs `scripts/dev-with-inngest.mjs`, which starts **two processes concurrently:**

1. **Next.js dev server** on `http://localhost:3000`
2. **Inngest dev server** on `http://localhost:8288`

The Inngest dev server is required for background jobs (derivation generation, scoring, etc.) to execute.

### Dev Mode Without Inngest

If you only need the web server:

```bash
npm run dev:next
```

> ⚠️ **Background jobs will not run** unless you also start the Inngest dev server in another terminal:
> ```bash
> npm run inngest:dev
> ```

### Docker Dev Mode (Full Stack)

To run the entire stack — app, PostgreSQL, and Inngest — in Docker:

```bash
# App + PostgreSQL only
docker compose up --build

# App + PostgreSQL + Inngest dev server
docker compose --profile dev up --build
```

| Service | URL |
|---------|-----|
| App | `http://localhost:3000` |
| Inngest Dev UI | `http://localhost:8288` |
| PostgreSQL | `localhost:5432` |

> Docker mode uses `.env.docker` (not `.env.local`). See [`app/DOCKER.md`](../app/DOCKER.md) for details.

---

## First-Time Setup

### 1. Create Your First User

ADScale uses **Better Auth** with email/password authentication. There is no seed script for an admin user — simply sign up through the UI:

1. Open `http://localhost:3000`.
2. Click **Cadastrar** (Sign up) and fill in your email and password.
3. A verification email will be sent via Resend. If you are using the Resend test domain (`onboarding@resend.dev`), check the Resend dashboard for the email.
4. Verify your email and log in.

On signup, a database hook automatically creates:
- A **personal workspace** for the user
- A **workspace_members** record with role `owner`

### 2. Configure Stripe Plans (for Billing Testing)

To test the billing flow end-to-end:

1. In your Stripe test dashboard, create three recurring Prices:
   - **Starter** (e.g., 30 credits/month)
   - **Growth** (e.g., 120 credits/month)
   - **Scale** (e.g., 360 credits/month)
2. Copy each Price ID into the corresponding `STRIPE_*_PRICE_ID` variable.
3. Ensure the Stripe CLI is forwarding webhooks (see [Stripe Webhook Setup](#stripe-webhook-setup)).

### 3. Manual Stripe Smoke Test

Follow this checklist to verify billing integration:

1. Start the app and Inngest locally.
2. Start Stripe CLI forwarding to `/api/billing/webhook`.
3. Sign up or log in.
4. Go to **Settings → Billing** — confirm no active plan or zero credits.
5. Try a paid generation and confirm it is blocked before enqueue.
6. Go to **Settings → Plans** and select a paid plan.
7. Complete Stripe Checkout with a [test card](https://stripe.com/docs/testing#cards) (e.g., `4242 4242 4242 4242`).
8. Confirm webhook logs process `checkout.session.completed` and `invoice.paid` events.
9. Confirm **Settings → Billing** shows the active plan and credited balance.
10. Trigger a generation and confirm credits decrease.
11. Open the Customer Portal from **Settings → Billing**.

---

## Verifying the Installation

### 1. Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "adscale-app",
  "timestamp": "2026-05-22T..."
}
```

### 2. Run the Test Suite

```bash
npm test
```

This runs Vitest with the configuration at `config/vitest.config.ts`. Tests cover:
- Environment validation and Zod schemas
- Repository and database logic
- Prompt parsing and AI utilities
- R2 storage key generation
- Integration flows (auth, workspace creation, campaign CRUD, upload, plan generation, derivation jobs, review, export)

### 3. Run Focused Billing/Auth Tests

```bash
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts tests/integration/auth-workspace-access.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts
```

### 4. Lint and Build

```bash
npm run lint
npm run build
```

A successful build means all TypeScript compiles and environment variables pass validation.

### 5. Verify Key Features in the Browser

| Feature | How to Verify |
|---------|---------------|
| Auth | Sign up, verify email, log in/out |
| Workspace | Check that dashboard loads with your personal workspace |
| Campaigns | Create a campaign, fill a brief, upload a reference asset |
| AI Planning | Generate a creative plan from the campaign brief |
| Derivations | Request derivations and confirm they process via Inngest |
| Billing | Subscribe to a test plan and confirm credits are granted |
| i18n | Switch locale between Portuguese (pt-BR) and English (en) |

---

## Troubleshooting

### App crashes on startup with "Env validation failed"

**Cause:** A required environment variable is missing or does not match the Zod schema.

**Fix:** Check the error message for the exact variable name, then verify it in `.env.local`. Common issues:

- `BETTER_AUTH_SECRET` is shorter than 32 characters.
- `OPENAI_API_KEY` does not start with `sk-`.
- `RESEND_API_KEY` does not start with `re_`.
- `STRIPE_SECRET_KEY` uses a publishable key (`pk_`) instead of a secret key (`sk_` or `rk_`).
- `STRIPE_WEBHOOK_SECRET` does not start with `whsec_`.
- `STRIPE_*_PRICE_ID` values do not start with `price_`.

### Database connection errors

**Cause:** PostgreSQL is not running or `DATABASE_URL` is incorrect.

**Fix:**

```bash
# Check if Postgres container is running
docker compose ps

# Start it if needed
docker compose up postgres -d

# Verify connectivity
docker compose exec postgres pg_isready -U adscale -d adscale_db
```

If using an external database, ensure the connection string includes the correct host, port, and SSL settings.

### Schema mismatch / missing tables

**Cause:** Migrations have not been applied.

**Fix:**

```bash
npm run db:migrate
```

If you see checksum conflicts for migrations `0008–0013`, reconcile the `__drizzle_migrations` table or reset the database:

```bash
# Docker only — DESTROYS DATA
docker compose down -v
docker compose up postgres -d
npm run db:migrate
```

### Background jobs never complete

**Cause:** The Inngest dev server is not running.

**Fix:**
- If using `npm run dev`, check that port `8288` is not occupied by another process.
- If using `npm run dev:next`, start Inngest manually in a second terminal:
  ```bash
  npm run inngest:dev
  ```
- Open the Inngest Dev UI at `http://localhost:8288` to inspect queued events.

### Auth redirect loops after login

**Cause:** `BETTER_AUTH_URL` does not match the actual public URL, so cookies are not set correctly.

**Fix:** Ensure `BETTER_AUTH_URL` and `APP_URL` both exactly match the URL you visit in the browser (e.g., `http://localhost:3000`, including the port).

### R2 uploads fail or images don't display

**Cause:** Missing or incorrect `R2_PUBLIC_BASE_URL`.

**Fix:**
- Verify `R2_PUBLIC_BASE_URL` points to the public endpoint of your bucket (e.g., `https://pub-xxx.r2.dev` or a custom domain).
- Ensure the bucket CORS policy allows `PUT` and `GET` from `http://localhost:3000`.
- Check that `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` have permission to read/write the bucket.

### Stripe webhooks not received locally

**Cause:** Stripe CLI is not forwarding events.

**Fix:**

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the emitted `whsec_...` secret into `STRIPE_WEBHOOK_SECRET` and restart the dev server.

### Port already in use

```bash
# Find process on port 3000
lsof -ti:3000
kill -9 <PID>

# Or use a different port with Next.js (requires updating .env URLs)
```

### Docker: app container exits immediately

**Cause:** The app container depends on Postgres being healthy. If Postgres fails its healthcheck, the app will not start.

**Fix:**

```bash
docker compose logs postgres
```

Ensure the `init.sql` mounted at `/docker-entrypoint-initdb.d/init.sql` runs without errors.

---

*Last updated: 2026-05-22*
