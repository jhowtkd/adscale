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
| `MINIMAX_API_KEY` | Yes | — | MiniMax chat-model API key; required by the assistant orchestrator (`app/src/server/assistant/model/minimax-client.ts`). Zod-validated as non-empty. |
| `MINIMAX_MODEL` | No | `MiniMax-M3` | MiniMax chat model identifier; defaults to `MiniMax-M3` if unset. |
| `R2_ACCOUNT_ID` | Yes | — | Cloudflare R2 account ID. |
| `R2_ACCESS_KEY_ID` | Yes | — | R2 access key ID. |
| `R2_SECRET_ACCESS_KEY` | Yes | — | R2 secret access key. |
| `R2_BUCKET` | Yes | — | R2 bucket name. |
| `R2_PUBLIC_BASE_URL` | Yes | — | Public HTTPS base URL for R2 assets (also used for Next.js `images.remotePatterns`). |
| `SOURCE_DATABASE_URL` | No (import script) | — | Source Postgres URL for one-off curated inspiration import (`npm run catalog:import-inspirations`). Not in `envSchema`. |
| `SOURCE_R2_ACCOUNT_ID` | No (import script) | — | Source Cloudflare R2 account ID for curated inspiration import. Not in `envSchema`. |
| `SOURCE_R2_ACCESS_KEY_ID` | No (import script) | — | Source R2 access key ID for curated inspiration import. Not in `envSchema`. |
| `SOURCE_R2_SECRET_ACCESS_KEY` | No (import script) | — | Source R2 secret access key for curated inspiration import. Not in `envSchema`. |
| `SOURCE_R2_BUCKET` | No (import script) | — | Source R2 bucket for curated inspiration import. Not in `envSchema`. |
| `CURATED_TARGET_WORKSPACE_ID` | No (import script) | — | Destination workspace UUID that receives imported curated inspirations. Not in `envSchema`. |
| `INNGEST_EVENT_KEY` | Yes | — | Inngest event key (`local` is fine for local dev). |
| `INNGEST_SIGNING_KEY` | Yes | — | Inngest signing key. `local` disables signature verification and is dev-only — the `inngestSigningKeySchema` rejects `local` when `NODE_ENV=production`. |
| `INNGEST_DEV` | No | — | Set to disable Inngest signature verification in non-production (`app/src/server/jobs/client.ts`, `app/src/app/api/inngest/route.ts`). The app hard-throws if set while `NODE_ENV=production`. Not in `.env.example` or `envSchema`. |
| `RESEND_API_KEY` | Yes | — | Resend API key; must start with `re_`. |
| `EMAIL_FROM` | Yes | — | Default transactional email sender (min. 3 characters). |
| `RESEND_WAITLIST_SEGMENT_ID` | No (prod: Yes) | — | Resend Audiences segment ID for waitlist contact sync (`app/src/server/services/resend-contacts.ts`). Example: `seg_abc123`. Optional in development (sync skipped when unset); required in production for marketing waitlist sync. Not in `envSchema`. |
| `APP_URL` | Yes | — | Canonical app URL (trusted origin, emails, redirects, Inngest serve URL). |
| `MARKETING_URL` | No | — | Public marketing landing URL. Optional in `envSchema` (must be a valid URL if set). Read via `process.env` in `app/src/proxy.ts`; unauthenticated `/` redirects here when set. Locally typically `http://localhost:3000/hi` (proxied marketing). |
| `MARKETING_UPSTREAM_URL` | No | `https://adscale-marketing.onrender.com` | Upstream static marketing site proxied at `/hi` via Next.js rewrites (`app/next.config.ts`). Locally typically `http://localhost:5173`. Not in `envSchema`. |
| `MARKETING_ALLOWED_ORIGINS` | No (prod: Yes) | — | Comma-separated CORS origins for `POST /api/waitlist` from the marketing site (`app/src/lib/cors-marketing.ts`). Example: `http://localhost:5173,https://adscale.jhonatansoares.com`. Not in `envSchema`. |
| `E2E_DISABLE_RATE_LIMIT` | No | — | Set to `true`, `1`, or `yes` to skip API rate limits during E2E/TestSprite runs. Not in `envSchema`. |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key; must start with `sk_` or `rk_`. Use `sk_live_` / `rk_live_` in production. |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook signing secret; must start with `whsec_`. Must match the endpoint registered in the Stripe Dashboard. |
| `STRIPE_STARTER_PRICE_ID` | Yes | — | Stripe Price ID for Starter; must start with `price_`. Maps to 30 credits/month (`app/src/server/billing/plans.ts`). |
| `STRIPE_GROWTH_PRICE_ID` | Yes | — | Stripe Price ID for Growth; must start with `price_`. Maps to 120 credits/month. |
| `STRIPE_SCALE_PRICE_ID` | Yes | — | Stripe Price ID for Scale; must start with `price_`. Maps to 360 credits/month. |
| `STRIPE_SUCCESS_URL` | Yes | — | Redirect after successful checkout (URL). Should share origin with `APP_URL`. |
| `STRIPE_CANCEL_URL` | Yes | — | Redirect after cancelled checkout (URL). Should share origin with `APP_URL`. |
| `BETA_ACCESS_CODES` | No | — | Comma-separated beta invite codes; each workspace redeems once (10 ads, no Stripe). Optional in `envSchema`; read via `process.env` in `app/src/server/billing/beta.ts`. |
| `DEV_ADMIN_EMAIL` | No | — | Comma-separated dev admin emails; skips email verification and credit debits for owner workspaces (`app/src/server/auth/dev-admin.ts`). Also grants platform-owner access. Not in `envSchema`. |
| `PLATFORM_OWNER_EMAILS` | No | — | Comma-separated platform owner emails for admin-only routes (`app/src/server/auth/platform-owner.ts`). Not in `.env.example` or `envSchema`. |
| `MEM0_API_KEY` | No | — | Mem0 Platform API key; required when brand memory is enabled. Optional in `envSchema`; not in `.env.example`. |
| `MEM0_ENABLED` | No | — | Set to `true` with `MEM0_API_KEY` to enable Mem0 brand memory (`app/src/server/memory/mem0-client.ts`). Optional in `envSchema`. |
| `MEM0_USER_PREFIX` | No | `adscale_workspace` | Prefix for Mem0 `user_id` scope per workspace. Optional in `envSchema`; default applied in `mem0-client.ts` when unset. |
| `MEM0_ORGANIZATION_ID` | No | — | Optional Mem0 organization scope (`envSchema`). |
| `MEM0_PROJECT_ID` | No | — | Optional Mem0 project scope (`envSchema`). |
| `NODE_ENV` | No | Node default | `development`, `production`, or `test`; affects auth email verification, rate limiting, Sentry sampling, and console stripping. |
| `NEXT_TELEMETRY_DISABLED` | No | — | Set to `1` in `render.yaml` to disable Next.js telemetry. |
| `SENTRY_DSN` | No | — | Sentry DSN; when set, enables error reporting via `app/src/instrumentation.ts`. Listed in `.env.example` (empty by default). |
| `SENTRY_ORG` | No | — | Sentry org slug for source map upload (`next.config.ts`). Listed in `.env.example`. |
| `SENTRY_PROJECT` | No | — | Sentry project slug for source map upload. Listed in `.env.example`. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | — | Client-side Sentry DSN for feedback diagnostics (`app/src/lib/feedback/diagnostic-collector.ts`). |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token (pair with URL). |
| `NOTIFICATION_WEBHOOK_SECRET` | No | — | Shared secret for `POST /api/notifications/webhook`. Optional in `envSchema` (must be ≥16 characters if set). |
| `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS` | No | — | Comma-separated workspace IDs labeled `synthetic_fixture` during human-quality auto-capture (`app/src/server/human-quality/source-label.ts`). All other workspaces default to `real_customer`. Not in `envSchema` or `.env.example`. |
| `NEXT_PUBLIC_APP_URL` | No | — | Optional public URL for share links and approval packages (`app/src/lib/share-token.ts`). |
| `NEXT_PUBLIC_APP_VERSION` | No | `unknown` | App version string for feedback diagnostics. |
| `NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE` | No | — | Set to `true`, `1`, or `yes` to show the auto-retry badge on derivation cards (`app/src/lib/derivation-display.ts`). Off when unset. |
| `DEMO_WORKSPACE_SLUG` | No | — | Workspace slug (e.g. `adscale-demo`) treated as the public demo surface; fixture campaigns render for this workspace (`app/src/lib/demo-gating.ts`). Not in `envSchema` or `.env.example`. |
| `DEMO_USER_EMAIL` | No | — | Demo account email; enables a "Demo" badge and restore affordance for that user (`app/src/lib/demo-gating.ts`). Not in `envSchema` or `.env.example`. |
| `ANALYZE` | No | — | Set to `true` to enable bundle analyzer (`npm run analyze`). |
| `LOG_LEVEL` | No | `info` | Minimum log level: `debug`, `info`, `warn`, or `error` (`app/src/lib/logger.ts`). |
| `INNGEST_SERVE_URL` | No | `APP_URL` / `BETTER_AUTH_URL` | Override Inngest function sync URL in `app/scripts/start-with-inngest-sync.mjs`. |
| `DB_MIGRATE_ATTEMPTS` | No | `5` | Retry count for `npm run db:migrate` (`app/scripts/migrate-with-retry.mjs`). |
| `DB_MIGRATE_DELAY_MS` | No | `8000` | Delay between migration retries (ms). |
| `E2E_BASE_URL` | No | `http://localhost:3000` | Playwright base URL (`app/playwright.config.ts`). |
| `E2E_EMAIL` / `E2E_PASSWORD` | No | — | Credentials for verification scripts (e.g. `app/scripts/verify-preview-fix.mjs`). Not in `envSchema`. |
| `PORT` | No | `3000` | HTTP port for production start script. |
| `RENDER_GIT_COMMIT` | No | — | Injected by Render at deploy time; primary source for `GET /api/build-id`. |
| `VERCEL_GIT_COMMIT_SHA` | No | — | Fallback build ID on Vercel (`app/src/app/api/build-id/route.ts`). |
| `BUILD_ID` | No | — | Generic build ID fallback when Render/Vercel commit vars are unset. |

Variables in `.env.example` but **not** in `envSchema` still matter for tooling and middleware (e.g. `TEST_DATABASE_URL`, `MARKETING_UPSTREAM_URL`, `MARKETING_ALLOWED_ORIGINS`, `RESEND_WAITLIST_SEGMENT_ID`, `SENTRY_*`, `E2E_DISABLE_RATE_LIMIT`, `DEV_ADMIN_EMAIL`). Variables used in code but absent from `.env.example` (e.g. `MEM0_*`, `PLATFORM_OWNER_EMAILS`, `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS`, `DEMO_WORKSPACE_SLUG`, `DEMO_USER_EMAIL`, `INNGEST_DEV`, `NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE`) should be added to `.env.local` when you need that feature.

## Env validation (Zod)

Validation lives in `app/src/server/validation/env.ts`:

- `envSchema` — `z.object({ ... })` with the rules in the table above (formats, prefixes, min lengths, and optional fields such as `MARKETING_URL`, `BETA_ACCESS_CODES`, OAuth, and Mem0 keys).
- `env` — parsed once at module load via `envSchema.safeParse(process.env)`.
- On failure, accessing `env.<KEY>` throws: `Env validation failed for <KEY>: <message>` (except in `NODE_ENV=test`, where missing keys return `undefined` from the proxy).

Import `env` from `@/server/validation/env` in server modules (database, auth, billing, storage, AI, jobs, email). Do not read validated secrets directly from `process.env` in those paths.

Some features read `process.env` directly even when a key exists in `envSchema` (e.g. `BETA_ACCESS_CODES` in `beta.ts`, `MARKETING_URL` in `proxy.ts`, `MEM0_*` keys). Others are outside `envSchema` entirely (`DEV_ADMIN_EMAIL`, `MARKETING_UPSTREAM_URL` in `next.config.ts`, `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS`, `DEMO_WORKSPACE_SLUG`, `DEMO_USER_EMAIL`, `INNGEST_DEV`, rate-limit flags). Those variables are optional, test-only, or evaluated before the validated `env` object is needed.

CLI scripts that import `env` before other modules should import `app/scripts/load-env.ts` first so `app/.env.local` is loaded:

```ts
import "./load-env";
import { env } from "@/server/validation/env";
```

Next.js loads `.env.local` automatically for `next dev` / `next start`; standalone scripts use `load-env.ts` or explicit `dotenv` (see `app/scripts/check-db.ts`, migration scripts).

Unit tests for validation patterns: `app/tests/unit/env-validation.test.ts`, `app/src/server/validation/env.test.ts`.

## Stripe billing and subscriptions

Stripe configuration is entirely environment-driven except for trial length and credit grants, which are hardcoded in application code.

### Plan mapping

| Plan key | Env var | Monthly credits | Source |
|----------|---------|-----------------|--------|
| `starter` | `STRIPE_STARTER_PRICE_ID` | 30 | `app/src/server/billing/plans.ts` |
| `growth` | `STRIPE_GROWTH_PRICE_ID` | 120 | `app/src/server/billing/plans.ts` |
| `scale` | `STRIPE_SCALE_PRICE_ID` | 360 | `app/src/server/billing/plans.ts` |

Price IDs must exist in Stripe as **recurring monthly** prices. The preflight script verifies this when run against the live API.

### Trial period

New subscriptions created via Checkout include a **14-day trial** (`trial_period_days: 14` in `app/src/server/billing/sessions.ts`). This is not configurable via environment variables. Trial status is tracked as `trialing` in Stripe and normalized in `app/src/server/billing/access.ts`.

### Checkout and portal URLs

- Success redirect: `STRIPE_SUCCESS_URL` (local example: `http://localhost:3000/settings?tab=billing&checkout=success`)
- Cancel redirect: `STRIPE_CANCEL_URL` (local example: `http://localhost:3000/settings?tab=plans&checkout=cancel`)
- Billing portal return URL uses `STRIPE_SUCCESS_URL`

Origins of success/cancel URLs must match `APP_URL` in production. Run `npm run preflight:stripe` to validate alignment.

### Webhooks

Register in the Stripe Dashboard:

- **Endpoint:** `POST {APP_URL}/api/billing/webhook` <!-- VERIFY: Confirm endpoint URL and signing secret in the Stripe Dashboard match production `APP_URL` -->
- **Signing secret:** copy to `STRIPE_WEBHOOK_SECRET`

Required webhook events (see `app/scripts/preflight-stripe-billing.ts`):

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The handler verifies the `stripe-signature` header with `env.STRIPE_WEBHOOK_SECRET` (`app/src/app/api/billing/webhook/route.ts`).

### Production Stripe keys

Use live-mode keys in production (`sk_live_` or `rk_live_` prefix). Test keys (`sk_test_`) are for local development only. All six `STRIPE_*` variables are marked `sync: false` in `render.yaml` and must be set manually in the Render Dashboard.

### Preflight checklist

Before go-live, run from `app/`:

```bash
npm run preflight:stripe          # live API checks
npm run preflight:stripe -- --offline   # env/schema/URL checks only
```

The script validates env presence, Zod schema, plan-to-price alignment, URL origins, and (when not offline) Stripe price and billing-portal configuration.

## Required vs optional settings

**Startup will fail** (when server code touches `env`) if any Zod-required variable is missing or invalid. That includes database, auth, OpenAI, R2, Inngest, Resend, Stripe, and core URL variables.

**Optional behavior:**

- OAuth providers — omitted unless both client ID and secret are set (`app/src/server/auth/index.ts`).
- Marketing redirect — when `MARKETING_URL` is unset, unauthenticated `/` visitors go to `/login` instead of the marketing site.
- Marketing proxy — `/hi` rewrites to `MARKETING_UPSTREAM_URL` (defaults to `https://adscale-marketing.onrender.com` when unset).
- Beta access — off unless `BETA_ACCESS_CODES` lists at least one code.
- Dev admins — no special treatment unless `DEV_ADMIN_EMAIL` lists one or more addresses. Hard-gated behind `NODE_ENV`: `parseDevAdminEmails()` returns an empty set in production regardless of the env var (`app/src/server/auth/dev-admin.ts`).
- Platform owners — `PLATFORM_OWNER_EMAILS` entries can access owner-only admin routes (`app/src/server/auth/platform-owner.ts`).
- Mem0 brand memory — off unless `env.MEM0_ENABLED === "true"` and `env.MEM0_API_KEY` is set (`mem0-client.ts`).
- Human-quality source labels — auto-capture defaults to `real_customer`; workspaces listed in `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS` are labeled `synthetic_fixture`.
- Sentry — disabled when `SENTRY_DSN` is unset (`silent: !process.env.SENTRY_DSN` in `app/next.config.ts`).
- Upstash rate limiting — if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are unset, production uses an in-memory limiter with a warning (`app/src/lib/rate-limit.ts`).
- E2E rate limits — set `E2E_DISABLE_RATE_LIMIT=true` on the server during parallel browser tests.
- Notification webhook — if `NOTIFICATION_WEBHOOK_SECRET` is unset, webhook auth checks may not match any caller-supplied secret.
- Waitlist sync — skipped when `RESEND_WAITLIST_SEGMENT_ID` is unset or `RESEND_API_KEY` is a test key.

**Development-only:**

- `requireEmailVerification` is `false` when `NODE_ENV !== "production"` (`app/src/server/auth/index.ts`).
- Trusted auth origins include `http://localhost:3000` and `http://127.0.0.1:3000` in development.

## Defaults

Defaults enforced by Zod (applied when the variable is unset or empty at parse time):

| Variable | Default |
|----------|---------|
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2-2026-04-21` |
| `MINIMAX_MODEL` | `MiniMax-M3` |

Code defaults not in Zod:

| Variable | Default | Location |
|----------|---------|----------|
| `MEM0_USER_PREFIX` | `adscale_workspace` | `app/src/server/memory/mem0-client.ts` (`env.MEM0_USER_PREFIX` or fallback) |
| `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS` | empty (no synthetic workspaces) | `app/src/server/human-quality/source-label.ts` |
| `MARKETING_UPSTREAM_URL` | `https://adscale-marketing.onrender.com` | `app/next.config.ts` |
| `LOG_LEVEL` | `info` | `app/src/lib/logger.ts` |
| `TEST_DATABASE_URL` | `postgres://test:test@localhost:5433/adscale_test` | `app/scripts/setup-test-db.ts` |
| `NEXT_PUBLIC_APP_VERSION` | `unknown` | `app/src/lib/feedback/diagnostic-collector.ts` |
| `DB_MIGRATE_ATTEMPTS` | `5` | `app/scripts/migrate-with-retry.mjs` |
| `DB_MIGRATE_DELAY_MS` | `8000` | `app/scripts/migrate-with-retry.mjs` |
| `E2E_BASE_URL` | `http://localhost:3000` | `app/playwright.config.ts` |
| `PORT` | `3000` | `app/scripts/start-with-inngest-sync.mjs` |
| Checkout trial | `14` days | `app/src/server/billing/sessions.ts` |
| Sentry `tracesSampleRate` | `0.1` production, `1.0` otherwise | `app/src/instrumentation.ts` |

Example local values from `app/.env.example`: `BETTER_AUTH_URL` and `APP_URL` default to `http://localhost:3000`; `MARKETING_URL` defaults to `http://localhost:3000/hi`; `MARKETING_UPSTREAM_URL` defaults to `http://localhost:5173`; Inngest keys use `local`.

## Config file format

### `app/.env.example` / `app/.env.local`

Dotenv-style `KEY=value` pairs. Use `.env.local` for secrets (gitignored). Never commit real API keys. Commented lines document optional features (`BETA_ACCESS_CODES`, `DEV_ADMIN_EMAIL`, `E2E_DISABLE_RATE_LIMIT`). `SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present but empty by default.

### `render.yaml` (repository root)

Render Blueprint for production:

| Resource | Name | Notes |
|----------|------|--------|
| Web service | `adscale-app` | `rootDir: app`, `buildCommand: npm ci --include=dev && npm run build && npm prune --omit=dev`, `startCommand: npm run db:migrate && npm run start:prod`, health check `/api/health` |
| Database | `adscale-postgres` | PostgreSQL 16, database `adscale_db`, user `adscale` |

Injected or fixed env vars include `NODE_ENV=production`, `DATABASE_URL` from the managed DB, generated `BETTER_AUTH_SECRET`, and public URLs. Secrets marked `sync: false` must be set in the Render Dashboard. See also `docs/render-deployment.md`.

Production URLs in the committed blueprint:

| Variable | Value |
|----------|-------|
| `BETTER_AUTH_URL`, `APP_URL` | `https://adscale.jhonatansoares.com` |
| `MARKETING_URL` | `https://adscale.jhonatansoares.com/hi` |
| `MARKETING_UPSTREAM_URL` | `https://adscale-marketing.onrender.com` |
| `MARKETING_ALLOWED_ORIGINS` | `https://adscale.jhonatansoares.com` |
| `STRIPE_SUCCESS_URL` | `https://adscale.jhonatansoares.com/settings?tab=billing&checkout=success` |
| `STRIPE_CANCEL_URL` | `https://adscale.jhonatansoares.com/settings?tab=plans&checkout=cancel` |
| `PLATFORM_OWNER_EMAILS` | `jhonatan.marcela@gmail.com` |

<!-- VERIFY: Confirm the live Render service URL and custom domain in the Render Dashboard; update BETTER_AUTH_URL, APP_URL, MARKETING_*, and Stripe redirect URLs in render.yaml if they differ -->

`sync: false` secrets to set in the Dashboard before first deploy:

- `OPENAI_API_KEY`, R2 (`R2_*`), Inngest (`INNGEST_*`), Resend (`RESEND_API_KEY`, `RESEND_WAITLIST_SEGMENT_ID`, `EMAIL_FROM`)
- All Stripe vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID`

### `app/drizzle.config.ts`

Drizzle Kit config: schema `app/src/server/db/schema.ts`, migrations under `app/drizzle`, PostgreSQL dialect, `schemaFilter: ["adscale_app"]`, credentials from `process.env.DATABASE_URL` (not validated through `env` at CLI time—must be set in the shell). In production, appends `uselibpqcompat=true&sslmode=require` when `sslmode` is absent.

### `app/next.config.ts`

Next.js 16 config: `output: 'standalone'`, `next-intl` plugin, Sentry wrapper, optional bundle analyzer when `ANALYZE=true`. Reads `R2_PUBLIC_BASE_URL`, `MARKETING_UPSTREAM_URL`, `SENTRY_*`, and `NODE_ENV` from the environment at build time. Proxies `/hi` paths to the marketing upstream.

### Docker (optional local stack)

`app/docker-compose.yml`, `app/Dockerfile`, and `app/DOCKER.md` describe a containerized Postgres + app (+ optional Inngest dev profile). Env for Compose is separate from `.env.local`; see `app/DOCKER.md` for `.env.docker` and service-specific variables.

## Per-environment overrides

| Environment | How config is supplied |
|-------------|-------------------------|
| **Local dev** | `app/.env.local` (from `.env.example`). Run `npm run dev` in `app/` (starts Next.js and Inngest dev server). Auth URLs typically `http://localhost:3000`; marketing upstream typically `http://localhost:5173` proxied at `/hi`. |
| **Tests** | `TEST_DATABASE_URL`; Vitest passes it through via `app/config/vitest.config.ts` (which also forces `E2E_DISABLE_RATE_LIMIT=true` in the test env). `NODE_ENV=test` relaxes `env` proxy throws. Setup: `npm run test:db:setup` / teardown: `npm run test:db:teardown`. |
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
| `npm run preflight:stripe` | Validate Stripe billing env, URLs, and (optionally) live API |
| `npm run seed:stripe` | Seed Stripe test products/prices (test mode only) |
| `npm run seed:dev-admin` | Seed dev admin user (`DEV_ADMIN_EMAIL` or `--email`) |
| `npm run seed:testsprite` | Seed TestSprite fixtures (`TESTSPRITE_*` env overrides in script) |

Root `package.json` only adds `cross-env` for monorepo tooling; application scripts live in `app/package.json`.

## Related documentation

- `docs/GETTING-STARTED.md` — first-time clone and run
- `docs/DEPLOYMENT.md` — deployment targets and CI
- `docs/render-deployment.md` — Render secrets checklist and URL updates
