# Configuration Guide

This document describes all configuration options, environment variables, and infrastructure setup for the ADScale application.

---

## Table of Contents

- [Environment Variables](#environment-variables)
  - [Required](#required-variables)
  - [Optional / With Defaults](#optional--with-defaults)
- [Configuration Files](#configuration-files)
- [Docker Configuration](#docker-configuration)
- [Database Configuration](#database-configuration)
- [Environment-Specific Setup](#environment-specific-setup)
  - [Development](#development)
  - [Testing](#testing)
  - [Production](#production)
- [Common Configuration Pitfalls](#common-configuration-pitfalls)

---

## Environment Variables

All runtime configuration is provided via environment variables. The app validates them at startup using `src/server/validation/env.ts` (Zod schema). **Missing or invalid variables will throw at runtime.**

### Required Variables

| Variable | Description | Validation |
|----------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection string | Must be a valid URL (`postgresql://...`) |
| `BETTER_AUTH_SECRET` | Random secret for Better-Auth session signing | Min. 32 characters |
| `BETTER_AUTH_URL` | Public URL where the auth API is hosted | Must be a valid URL |
| `OPENAI_API_KEY` | OpenAI API key | Must start with `sk-` |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | Non-empty string |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID | Non-empty string |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key | Non-empty string |
| `R2_BUCKET` | R2 bucket name | Non-empty string |
| `R2_PUBLIC_BASE_URL` | Public base URL for R2 assets | Must be a valid URL |
| `INNGEST_EVENT_KEY` | Inngest event key | Non-empty string |
| `INNGEST_SIGNING_KEY` | Inngest signing key | Non-empty string |
| `RESEND_API_KEY` | Resend email API key | Must start with `re_` |
| `EMAIL_FROM` | Default sender address for transactional emails | Min. 3 characters |
| `APP_URL` | Canonical public URL of the application | Must be a valid URL |
| `STRIPE_SECRET_KEY` | Stripe secret key | Must start with `sk_` or `rk_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret | Must start with `whsec_` |
| `STRIPE_STARTER_PRICE_ID` | Stripe Price ID for the Starter plan | Must start with `price_` |
| `STRIPE_GROWTH_PRICE_ID` | Stripe Price ID for the Growth plan | Must start with `price_` |
| `STRIPE_SCALE_PRICE_ID` | Stripe Price ID for the Scale plan | Must start with `price_` |
| `STRIPE_SUCCESS_URL` | Redirect URL after successful Stripe checkout | Must be a valid URL |
| `STRIPE_CANCEL_URL` | Redirect URL after cancelled Stripe checkout | Must be a valid URL |

### Optional / With Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` | OpenAI text generation model |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2-2026-04-21` | OpenAI image generation model |
| `NODE_ENV` | — | `development`, `test`, or `production` |
| `NEXT_TELEMETRY_DISABLED` | — | Set to `1` to disable Next.js telemetry |
| `INNGEST_DEV` | — | URL of the Inngest dev server (used in Docker) |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration. Sets `output: 'standalone'` for containerized deploys, disables image optimization (`unoptimized: true`), and wires `next-intl` via `withNextIntl`. |
| `drizzle.config.ts` | Drizzle Kit configuration. Points to `src/server/db/schema.ts`, outputs migrations to `./drizzle`, targets PostgreSQL, filters the `adscale_app` schema, and applies migrations against the `public` schema. |
| `tsconfig.json` | TypeScript compiler options. Uses `bundler` module resolution, strict mode, and path alias `@/*` → `./src/*`. |
| `eslint.config.mjs` | ESLint flat config extending Next.js core-web-vitals and TypeScript presets. |
| `postcss.config.mjs` | PostCSS config for Tailwind CSS v4 (`@tailwindcss/postcss` plugin). |
| `config/vitest.config.ts` | Vitest test runner config. Uses `jsdom` environment, global APIs, and `@/...` alias resolution. Setup file: `tests/setup.ts`. |
| `components.json` | shadcn/ui registry config. Style: `base-nova`, RSC enabled, Tailwind CSS variables, icon library: `lucide`. |
| `src/i18n.ts` | next-intl request configuration. Loads messages from `messages/{locale}.json`, resolves locale priority: cookie → Accept-Language header → default (`pt-BR`). Hardcodes timezone to `America/Sao_Paulo`. |
| `src/i18n/config.ts` | Locale constants: supported locales are `pt-BR` and `en`; default is `pt-BR`. |
| `src/middleware.ts` | Next.js middleware. Handles locale cookie assignment and session-based route protection for `/`, `/campaigns/*`, and `/settings/*`. |
| `middleware.ts` (root) | Simplified middleware variant used in some builds; performs auth check only (no i18n cookie handling). |
| `render.yaml` | Render Blueprint. Defines the web service (`adscale-app`) and managed PostgreSQL database (`adscale-postgres`). |

---

## Docker Configuration

### `docker-compose.yml`

Defines three services:

1. **`postgres`** — PostgreSQL 16 (Alpine)
   - User: `adscale` / Password: `adscale123` / DB: `adscale_db`
   - Exposes port `5432`
   - Persistent volume: `postgres_data`
   - Initialization script mounted at `docker/postgres/init.sql`
   - Healthcheck via `pg_isready`

2. **`app`** — The Next.js application
   - Built from `Dockerfile`
   - Exposes port `3000`
   - Loads env vars from `.env.docker`
   - Sets `NODE_ENV=production` and `INNGEST_DEV=http://inngest:8288`
   - Depends on `postgres` being healthy
   - Healthcheck polls `http://localhost:3000/`

3. **`inngest`** — Inngest dev server
   - Image: `inngest/inngest:latest`
   - Connects to the app's Inngest endpoint at `http://app:3000/api/inngest`
   - Exposes port `8288`
   - Only started with profile `dev` (`docker compose --profile dev up`)

### `Dockerfile`

Multi-stage build:

- **Builder stage** (`node:20-alpine`)
  - Installs dependencies with `npm ci`
  - Builds the app with `next build`
  - Disables Next.js telemetry (`NEXT_TELEMETRY_DISABLED=1`)

- **Runner stage** (`node:20-alpine`)
  - Runs as non-root user `nextjs` (UID 1001)
  - Copies standalone output, static assets, public files, and drizzle artifacts
  - Installs production dependencies plus `drizzle-kit` for migrations
  - Entrypoint: `docker/entrypoint.sh`
  - Listens on `0.0.0.0:3000`

### `docker/entrypoint.sh`

1. Waits for PostgreSQL on `postgres:5432` using `nc`.
2. Runs `npx drizzle-kit migrate`.
3. Starts the Next.js standalone server (`node server.js`).

### `docker/postgres/init.sql`

```sql
CREATE SCHEMA IF NOT EXISTS adscale_app;
GRANT ALL ON SCHEMA adscale_app TO adscale;
```

---

## Database Configuration

- **ORM:** Drizzle ORM (`drizzle-orm`)
- **Dialect:** PostgreSQL
- **Driver:** `pg` (native) for Node; `@neondatabase/serverless` for serverless/edge
- **Schema file:** `src/server/db/schema.ts`
- **Migrations directory:** `./drizzle`
- **Target schema:** `adscale_app`
- **Migrations applied to:** `public` schema (per `drizzle.config.ts`)

### CLI Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `db:generate` | `drizzle-kit generate` | Generate migration files from schema changes |
| `db:migrate` | `drizzle-kit migrate` | Apply pending migrations |
| `db:push` | `drizzle-kit push` | Push schema changes directly (dev only) |
| `db:studio` | `drizzle-kit studio` | Launch Drizzle Studio GUI |

---

## Environment-Specific Setup

### Development

**Prerequisites:** Node.js 20+, local PostgreSQL or Docker.

1. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and fill in real values for all keys marked `replace-me`.

2. Start PostgreSQL (if not using Docker):
   ```bash
   # Or use docker compose for the full stack
   docker compose up postgres -d
   ```

3. Run database migrations:
   ```bash
   npm run db:migrate
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```
   This runs `scripts/dev-with-inngest.mjs`, which launches both Next.js (`next dev`) and the Inngest dev server (`inngest-cli dev`) concurrently.

**Dev-specific notes:**
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` can both be set to `local`.
- Stripe keys can use test-mode values (`sk_test_...`).
- The Inngest dev server UI is available at `http://localhost:8288`.

### Testing

Run the test suite:

```bash
npm test
```

- Uses Vitest with `jsdom` environment.
- Config located at `config/vitest.config.ts`.
- Global test utilities loaded from `tests/setup.ts` (includes `@testing-library/jest-dom`).

### Production

#### Render (Recommended)

The project includes a `render.yaml` Blueprint for one-click deployment.

<!-- VERIFY: Render dashboard plan, region, and auto-deploy settings are managed in the Render web UI and may differ from the Blueprint defaults. -->

**Service:** `adscale-app`
- **Runtime:** Node
- **Plan:** free (upgrade as needed)
- **Region:** oregon
- **Build:** `npm ci && npm run build`
- **Pre-deploy:** `npm run db:migrate`
- **Start:** `npm start`
- **Healthcheck:** `/api/health`

**Database:** `adscale-postgres`
- **Engine:** PostgreSQL 16
- **Plan:** free
- **Database name:** `adscale_db`
- **User:** `adscale`

**Environment variables on Render:**
- `BETTER_AUTH_SECRET` is auto-generated by Render.
- `DATABASE_URL` is auto-populated from the managed database connection string.
- Sensitive values (`OPENAI_API_KEY`, `R2_*`, `INNGEST_*`, `RESEND_API_KEY`, `STRIPE_*`) are marked `sync: false` and must be set manually in the Render dashboard.

<!-- VERIFY: Production domain `https://adscale-app.onrender.com` and associated redirect URLs in render.yaml assume the default Render service name. Changing the service name in the dashboard requires updating `BETTER_AUTH_URL`, `APP_URL`, and Stripe redirect URLs accordingly. -->

#### Docker Production

```bash
docker compose up --build -d
```

- The `app` service runs in production mode (`NODE_ENV=production`).
- Migrations run automatically on container start via `entrypoint.sh`.
- Inngest dev server is **not** started by default (it requires `--profile dev`).

<!-- VERIFY: For production Inngest, you must connect to Inngest Cloud (inngest.com) and update `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` with cloud credentials. The local dev server is not suitable for production workloads. -->

---

## Common Configuration Pitfalls

### 1. `BETTER_AUTH_SECRET` too short
The Zod schema enforces a minimum of 32 characters. Generate a strong random secret, e.g.:
```bash
openssl rand -base64 32
```

### 2. `DATABASE_URL` schema mismatch
Drizzle applies migrations to the `public` schema but your tables live in `adscale_app`. Ensure `schemaFilter` in `drizzle.config.ts` and your schema definitions align. The init script creates `adscale_app` and grants privileges automatically for Docker setups; external databases may need manual setup.

### 3. Missing `R2_PUBLIC_BASE_URL`
Assets uploaded to R2 will not be served correctly if this URL is missing or invalid. It must be the public-facing endpoint for your bucket (e.g., `https://pub-xxx.r2.dev` or a custom domain).

### 4. Stripe key prefixes
- `STRIPE_SECRET_KEY` must start with `sk_` or `rk_`. Publishable keys (`pk_`) will fail validation.
- `STRIPE_WEBHOOK_SECRET` must start with `whsec_`.
- `STRIPE_*_PRICE_ID` values must start with `price_`.

### 5. Auth redirect loops in middleware
`src/middleware.ts` reads `better-auth.session_token` and `__Secure-better-auth.session_token`. If `BETTER_AUTH_URL` does not match the actual public URL, cookies may not be set correctly, causing infinite redirects on protected routes.

### 6. Inngest dev server not running
The `npm run dev` script starts the Inngest dev server automatically. If you run `npm run dev:next` directly, background jobs will not be processed locally unless you also run `npm run inngest:dev` in another terminal.

### 7. `.env.local` vs `.env.docker`
- `.env.local` is used by Next.js in local development.
- `.env.docker` is loaded by the `app` service in `docker-compose.yml`.
Keep both in sync when adding new variables.

### 8. Render `sync: false` variables
Variables marked `sync: false` in `render.yaml` are **not** auto-created. You must manually add them in the Render dashboard before the first deploy, or the application will crash on startup due to missing env validation.

### 9. Image optimization disabled
`next.config.ts` sets `images.unoptimized: true`. This is required for standalone output on some platforms, but means you lose Next.js built-in image optimization. Ensure your image sources (R2/CDN) handle resizing if needed.

### 10. Timezone hardcoded
`src/i18n.ts` hardcodes `timeZone: "America/Sao_Paulo"`. If your user base spans multiple timezones, you may need to make this dynamic.
