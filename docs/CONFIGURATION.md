<!-- generated-by: gsd-doc-writer -->

# Configuration

Environment variables, validation, and deployment-related settings for the ADScale Next.js app (`app/`). Copy `app/.env.example` to `app/.env.local` for local development. Production on Render is defined in the repository root `render.yaml`.

## Environment variables

Runtime secrets and service URLs are read from `process.env`. The canonical list for local setup is `app/.env.example`. At runtime, server code imports validated values from `app/src/server/validation/env.ts` (`envSchema`).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (validated as URL). Used by Drizzle, migrations, and scripts. |
| `TEST_DATABASE_URL` | No (tests) | `postgres://test:test@localhost:5433/adscale_test` | Integration DB URL; used by Vitest and `npm run test:db:setup`. Not in `envSchema`. |
| `BETTER_AUTH_SECRET` | Yes | — | Session signing secret; minimum 32 characters. |
| `BETTER_AUTH_URL` | Yes | — | Public base URL for Better Auth (must match how users reach the app). |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID; both ID and secret required to enable Google login. |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret. |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth client ID; both ID and secret required to enable GitHub login. |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret. |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key; must start with `sk-`. |
| `OPENAI_TEXT_MODEL` | No | `gpt-5-mini` | Text model for AI features. |
| `OPENAI_IMAGE_MODEL` | No | `gpt-image-2-2026-04-21` | Image model for AI features. |
| `R2_ACCOUNT_ID` | Yes | — | Cloudflare R2 account ID. |
| `R2_ACCESS_KEY_ID` | Yes | — | R2 access key ID. |
| `R2_SECRET_ACCESS_KEY` | Yes | — | R2 secret access key. |
| `R2_BUCKET` | Yes | — | R2 bucket name. |
| `R2_PUBLIC_BASE_URL` | Yes | — | Public HTTPS base URL for R2 assets (also used for Next.js `images.remotePatterns`). |
| `INNGEST_EVENT_KEY` | Yes | — | Inngest event key (`local` is fine for local dev). |
| `INNGEST_SIGNING_KEY` | Yes | — | Inngest signing key (`local` is fine for local dev). |
| `RESEND_API_KEY` | Yes | — | Resend API key; must start with `re_`. |
| `EMAIL_FROM` | Yes | — | Default transactional email sender (min. 3 characters). |
| `RESEND_WAITLIST_SEGMENT_ID` | No (prod: Yes) | — | Resend Audiences segment ID for waitlist contact sync (`app/src/server/services/resend-contacts.ts`). Example: `seg_abc123`. Optional in development (sync skipped when unset); required in production. Not in `envSchema`. |
| `APP_URL` | Yes | — | Canonical app URL (trusted origin, emails, redirects, Inngest serve URL). |
| `MARKETING_URL` | No | — | Public marketing site URL. Unauthenticated visits to `/` redirect here when set (`app/middleware.ts`). Must be a valid URL if provided. |
| `MARKETING_ALLOWED_ORIGINS` | No (prod: Yes) | — | Comma-separated CORS origins for `POST /api/waitlist` from the marketing site (`app/src/lib/cors-marketing.ts`). Example: `http://localhost:5173,https://www.adscale.com.br`. Not in `envSchema`. |
| `E2E_DISABLE_RATE_LIMIT` | No | — | Set to `true`, `1`, or `yes` to skip API rate limits during E2E/TestSprite runs. Not in `envSchema`. |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key; must start with `sk_` or `rk_`. |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook secret; must start with `whsec_`. |
| `STRIPE_STARTER_PRICE_ID` | Yes | — | Stripe Price ID for Starter; must start with `price_`. |
| `STRIPE_GROWTH_PRICE_ID` | Yes | — | Stripe Price ID for Growth; must start with `price_`. |
| `STRIPE_SCALE_PRICE_ID` | Yes | — | Stripe Price ID for Scale; must start with `price_`. |
| `STRIPE_SUCCESS_URL` | Yes | — | Redirect after successful checkout (URL). |
| `STRIPE_CANCEL_URL` | Yes | — | Redirect after cancelled checkout (URL). |
| `BETA_ACCESS_CODES` | No | — | Comma-separated beta invite codes; each workspace redeems once (10 ads, no Stripe). Parsed in `app/src/server/billing/beta.ts`. |
| `DEV_ADMIN_EMAIL` | No | — | Comma-separated dev admin emails; skips email verification and credit debits for owner workspaces (`app/src/server/auth/dev-admin.ts`). Also grants platform-owner access. |
| `PLATFORM_OWNER_EMAILS` | No | — | Comma-separated platform owner emails for admin-only routes (`app/src/server/auth/platform-owner.ts`). Not in `.env.example` or `envSchema`. |
| `ZEP_API_KEY` | No | — | Zep Cloud API key; required when brand memory is enabled. Not in `.env.example` but supported in `envSchema`. |
| `ZEP_ENABLED` | No | — | Set to `true` with `ZEP_API_KEY` to enable Zep brand memory. |
| `ZEP_GRAPH_PREFIX` | No | `adscale_workspace` (in code) | Prefix for Zep graph IDs per workspace. |
| `NODE_ENV` | No | Node default | `development`, `production`, or `test`; affects auth email verification, rate limiting, Sentry sampling, and console stripping. |
| `NEXT_TELEMETRY_DISABLED` | No | — | Set to `1` in `render.yaml` to disable Next.js telemetry. |
| `SENTRY_DSN` | No | — | Sentry DSN; when set, enables error reporting via `app/src/instrumentation.ts`. |
| `SENTRY_ORG` | No | — | Sentry org slug for source map upload (`next.config.ts`). |
| `SENTRY_PROJECT` | No | — | Sentry project slug for source map upload. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | — | Client-side Sentry DSN for feedback diagnostics (`app/src/lib/feedback/diagnostic-collector.ts`). |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token (pair with URL). |
| `NOTIFICATION_WEBHOOK_SECRET` | No | — | Shared secret for `POST /api/notifications/webhook` (not in Zod schema). |
| `NEXT_PUBLIC_APP_URL` | No | — | Optional public URL for share links and approval packages (`app/src/lib/share-token.ts`). |
| `NEXT_PUBLIC_APP_VERSION` | No | `unknown` | App version string for feedback diagnostics. |
| `ANALYZE` | No | — | Set to `true` to enable bundle analyzer (`npm run analyze`). |
| `INNGEST_SERVE_URL` | No | `APP_URL` / `BETTER_AUTH_URL` | Override Inngest function sync URL in `app/scripts/start-with-inngest-sync.mjs`. |
| `DB_MIGRATE_ATTEMPTS` | No | `5` | Retry count for `npm run db:migrate` (`app/scripts/migrate-with-retry.mjs`). |
| `DB_MIGRATE_DELAY_MS` | No | `8000` | Delay between migration retries (ms). |
| `E2E_BASE_URL` | No | `http://localhost:3000` | Playwright base URL (`app/playwright.config.ts`). |
| `PORT` | No | `3000` | HTTP port for production start script. |

Variables in `.env.example` but **not** in `envSchema` still matter for tooling and middleware (e.g. `TEST_DATABASE_URL`, `SENTRY_*`, `E2E_DISABLE_RATE_LIMIT`, `DEV_ADMIN_EMAIL`). Variables used in code but absent from `.env.example` should be added to `.env.local` when you need that feature.

## Env validation (Zod)

Validation lives in `app/src/server/validation/env.ts`:

- `envSchema` — `z.object({ ... })` with the rules in the table above (formats, prefixes, min lengths, and optional URL fields).
- `env` — parsed once at module load via `envSchema.safeParse(process.env)`.
- On failure, accessing `env.<KEY>` throws: `Env validation failed for <KEY>: <message>` (except in `NODE_ENV=test`, where missing keys return `undefined` from the proxy).

Import `env` from `@/server/validation/env` in server modules (database, auth, billing, storage, AI, jobs, email). Do not read validated secrets directly from `process.env` in those paths.

Some features read `process.env` directly instead of `env` (e.g. `BETA_ACCESS_CODES`, `DEV_ADMIN_EMAIL`, `MARKETING_URL` in middleware, rate-limit flags). Those variables are either optional, test-only, or evaluated before the validated `env` object is needed.

CLI scripts that import `env` before other modules should import `app/scripts/load-env.ts` first so `app/.env.local` is loaded:

```ts
import "./load-env";
import { env } from "@/server/validation/env";
```

Next.js loads `.env.local` automatically for `next dev` / `next start`; standalone scripts use `load-env.ts` or explicit `dotenv` (see `app/scripts/check-db.ts`, migration scripts).

Unit tests for validation patterns: `app/tests/unit/env-validation.test.ts`, `app/src/server/validation/env.test.ts`.

## Required vs optional settings

**Startup will fail** (when server code touches `env`) if any Zod-required variable is missing or invalid. That includes database, auth, OpenAI, R2, Inngest, Resend, Stripe, and core URL variables.

**Optional behavior:**

- OAuth providers — omitted unless both client ID and secret are set (`app/src/server/auth/index.ts`).
- Marketing redirect — when `MARKETING_URL` is unset, unauthenticated `/` visitors go to `/login` instead of the marketing site.
- Beta access — off unless `BETA_ACCESS_CODES` lists at least one code.
- Dev admins — no special treatment unless `DEV_ADMIN_EMAIL` lists one or more addresses.
- Platform owners — `PLATFORM_OWNER_EMAILS` plus any `DEV_ADMIN_EMAIL` entries can access owner-only admin routes.
- Zep brand memory — off unless `ZEP_ENABLED === "true"` and `ZEP_API_KEY` is set.
- Sentry — disabled when `SENTRY_DSN` is unset (`silent: !process.env.SENTRY_DSN` in `app/next.config.ts`).
- Upstash rate limiting — if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are unset, production uses an in-memory limiter with a warning (`app/src/lib/rate-limit.ts`).
- E2E rate limits — set `E2E_DISABLE_RATE_LIMIT=true` on the server during parallel browser tests.
- Notification webhook — if `NOTIFICATION_WEBHOOK_SECRET` is unset, webhook auth checks may not match any caller-supplied secret.

**Development-only:**

- `requireEmailVerification` is `false` when `NODE_ENV !== "production"` (`app/src/server/auth/index.ts`).
- Trusted auth origins include `http://localhost:3000` and `http://127.0.0.1:3000` in development.

## Defaults

Defaults enforced by Zod (applied when the variable is unset or empty at parse time):

| Variable | Default |
|----------|---------|
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2-2026-04-21` |

Code defaults not in Zod:

| Variable | Default | Location |
|----------|---------|----------|
| `ZEP_GRAPH_PREFIX` | `adscale_workspace` | `app/src/server/memory/zep-client.ts` |
| `TEST_DATABASE_URL` | `postgres://test:test@localhost:5433/adscale_test` | `app/scripts/setup-test-db.ts` |
| `NEXT_PUBLIC_APP_VERSION` | `unknown` | `app/src/lib/feedback/diagnostic-collector.ts` |
| `DB_MIGRATE_ATTEMPTS` | `5` | `app/scripts/migrate-with-retry.mjs` |
| `DB_MIGRATE_DELAY_MS` | `8000` | `app/scripts/migrate-with-retry.mjs` |
| `E2E_BASE_URL` | `http://localhost:3000` | `app/playwright.config.ts` |
| `PORT` | `3000` | `app/scripts/start-with-inngest-sync.mjs` |
| Sentry `tracesSampleRate` | `0.1` production, `1.0` otherwise | `app/src/instrumentation.ts` |

Example local values from `app/.env.example`: `BETTER_AUTH_URL` and `APP_URL` default to `http://localhost:3000`; `MARKETING_URL` defaults to `http://localhost:5173`; Inngest keys use `local`.

## Config file format

### `app/.env.example` / `app/.env.local`

Dotenv-style `KEY=value` pairs. Use `.env.local` for secrets (gitignored). Never commit real API keys. Commented lines in `.env.example` document optional features (`BETA_ACCESS_CODES`, `DEV_ADMIN_EMAIL`, `E2E_DISABLE_RATE_LIMIT`).

### `render.yaml` (repository root)

Render Blueprint for production:

| Resource | Name | Notes |
|----------|------|--------|
| Web service | `adscale-app` | `rootDir: app`, `buildCommand: npm ci && npm run build`, `startCommand: npm run db:migrate && npm run start:prod`, health check `/api/health` |
| Database | `adscale-postgres` | PostgreSQL 16, database `adscale_db`, user `adscale` |

Injected or fixed env vars include `NODE_ENV=production`, `DATABASE_URL` from the managed DB, generated `BETTER_AUTH_SECRET`, and public URLs. Secrets marked `sync: false` must be set in the Render Dashboard. See also `docs/render-deployment.md`.

Production URLs in the committed blueprint:

- `BETTER_AUTH_URL`, `APP_URL`: `https://adscale.jhonatansoares.com`
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`: paths under that host

<!-- VERIFY: Confirm the live Render service URL and custom domain in the Render Dashboard; update BETTER_AUTH_URL, APP_URL, and Stripe redirect URLs in render.yaml if they differ -->

`MARKETING_URL` is not set in `render.yaml`; add it in the Dashboard if unauthenticated `/` should redirect to a separate marketing site in production.

### `app/drizzle.config.ts`

Drizzle Kit config: schema `app/src/server/db/schema.ts`, migrations under `app/drizzle`, PostgreSQL dialect, `schemaFilter: ["adscale_app"]`, credentials from `process.env.DATABASE_URL` (not validated through `env` at CLI time—must be set in the shell). In production, appends `sslmode=require` when `sslmode` is absent.

### `app/next.config.ts`

Next.js 16 config: `output: 'standalone'`, `next-intl` plugin, Sentry wrapper, optional bundle analyzer when `ANALYZE=true`. Reads `R2_PUBLIC_BASE_URL`, `SENTRY_*`, and `NODE_ENV` from the environment at build time.

### Docker (optional local stack)

`app/docker-compose.yml`, `app/Dockerfile`, and `app/DOCKER.md` describe a containerized Postgres + app (+ optional Inngest dev profile). Env for Compose is separate from `.env.local`; see `app/DOCKER.md` for `.env.docker` and service-specific variables.

## Per-environment overrides

| Environment | How config is supplied |
|-------------|-------------------------|
| **Local dev** | `app/.env.local` (from `.env.example`). Run `npm run dev` in `app/` (starts Next.js and Inngest dev server). Auth URLs typically `http://localhost:3000`; marketing site typically `http://localhost:5173`. |
| **Tests** | `TEST_DATABASE_URL`; Vitest may pass it via `app/config/vitest.config.ts`. `NODE_ENV=test` relaxes `env` proxy throws. Setup: `npm run test:db:setup` / teardown: `npm run test:db:teardown`. |
| **Production (Render)** | `render.yaml` + Dashboard secrets (`sync: false` keys). `DATABASE_URL` from managed Postgres. |

External integrations must use the same public base URL as `APP_URL` / `BETTER_AUTH_URL`:

- Inngest serve URL: `{APP_URL}/api/inngest` <!-- VERIFY: Register this URL in the Inngest Cloud dashboard for production -->
- Stripe webhooks: `{APP_URL}/api/billing/webhook` <!-- VERIFY: Endpoint URL and signing secret in the Stripe Dashboard -->

There are no committed `.env.development` or `.env.production` files; use `.env.local` locally and Render env groups in production.

## Package scripts (configuration-related)

Run from the `app/` directory:

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server + Inngest dev (`scripts/dev-with-inngest.mjs`) |
| `npm run dev:next` | Next.js only on port 3000 |
| `npm run inngest:dev` | Inngest CLI pointed at `http://localhost:3000/api/inngest` |
| `npm run build` / `npm run start:prod` | Production build and server with Inngest function sync (Render `startCommand`) |
| `npm run db:migrate` | Apply Drizzle migrations with retries (first step in Render `startCommand`) |
| `npm run db:generate` | Generate migration SQL |
| `npm run db:push` | Push schema (dev convenience) |
| `npm run db:studio` | Drizzle Studio |
| `npm run test` | Vitest (`config/vitest.config.ts`) |
| `npm run test:e2e` | Playwright (`E2E_BASE_URL` optional) |
| `npm run test:db:setup` / `test:db:teardown` | Docker test Postgres on port 5433 |
| `npm run analyze` | Bundle analyzer (`ANALYZE=true`) |
| `npm run seed:dev-admin` | Seed dev admin user (`DEV_ADMIN_EMAIL` or `--email`) |
| `npm run seed:testsprite` | Seed TestSprite fixtures (`TESTSPRITE_*` env overrides in script) |

Root `package.json` only adds `cross-env` for monorepo tooling; application scripts live in `app/package.json`.

## Related documentation

- `docs/GETTING-STARTED.md` — first-time clone and run
- `docs/DEPLOYMENT.md` — deployment targets and CI
- `docs/render-deployment.md` — Render secrets checklist and URL updates
