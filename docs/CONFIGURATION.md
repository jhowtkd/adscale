<!-- generated-by: gsd-doc-writer -->

# Configuration

Environment variables, validation, and deployment-related settings for the ADScale Next.js app (`app/`). Copy `app/.env.example` to `app/.env.local` for local development. Production on Render is defined in the repository root `render.yaml`.

## Environment variables

Runtime secrets and service URLs are read from `process.env`. The canonical list for local setup is `app/.env.example`. At runtime, server code imports validated values from `app/src/server/validation/env.ts` (`envSchema`).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (validated as URL). Used by Drizzle, migrations, and scripts. |
| `BETTER_AUTH_SECRET` | Yes | — | Session signing secret; minimum 32 characters. |
| `BETTER_AUTH_URL` | Yes | — | Public base URL for Better Auth (must match how users reach the app). |
| `APP_URL` | Yes | — | Canonical app URL (trusted origin, emails, redirects). |
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
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key; must start with `sk_` or `rk_`. |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook secret; must start with `whsec_`. |
| `STRIPE_STARTER_PRICE_ID` | Yes | — | Stripe Price ID for Starter; must start with `price_`. |
| `STRIPE_GROWTH_PRICE_ID` | Yes | — | Stripe Price ID for Growth; must start with `price_`. |
| `STRIPE_SCALE_PRICE_ID` | Yes | — | Stripe Price ID for Scale; must start with `price_`. |
| `STRIPE_SUCCESS_URL` | Yes | — | Redirect after successful checkout (URL). |
| `STRIPE_CANCEL_URL` | Yes | — | Redirect after cancelled checkout (URL). |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID; both ID and secret required to enable Google login. |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret. |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth client ID; both ID and secret required to enable GitHub login. |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret. |
| `ZEP_API_KEY` | No | — | Zep Cloud API key; required when brand memory is enabled. |
| `ZEP_ENABLED` | No | — | Set to `true` with `ZEP_API_KEY` to enable Zep brand memory. |
| `ZEP_GRAPH_PREFIX` | No | `adscale_workspace` (in code) | Prefix for Zep graph IDs per workspace. |
| `TEST_DATABASE_URL` | No (tests) | `postgres://test:test@localhost:5433/adscale_test` | Integration DB URL; used by Vitest and `npm run test:db:setup`. |
| `NODE_ENV` | No | Node default | `development`, `production`, or `test`; affects auth email verification, rate limiting, Sentry sampling, and console stripping. |
| `NEXT_TELEMETRY_DISABLED` | No | — | Set to `1` in `render.yaml` to disable Next.js telemetry. |
| `SENTRY_DSN` | No | — | Sentry DSN; when set, enables error reporting via `app/src/instrumentation.ts`. |
| `SENTRY_ORG` | No | — | Sentry org slug for source map upload (`next.config.ts`). |
| `SENTRY_PROJECT` | No | — | Sentry project slug for source map upload. |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token (pair with URL). |
| `NOTIFICATION_WEBHOOK_SECRET` | No | — | Shared secret for `POST /api/notifications/webhook` (not in Zod schema). |
| `NEXT_PUBLIC_APP_URL` | No | — | Optional public URL for share links (`app/src/lib/share-token.ts`). |
| `DEV_ADMIN_EMAIL` | No | — | Default email for `scripts/seed-dev-admin.ts` when CLI `--email` is omitted. |
| `ANALYZE` | No | — | Set to `true` to enable bundle analyzer (`npm run analyze`). |

Variables in `.env.example` but **not** in `envSchema` still matter for tooling (e.g. `TEST_DATABASE_URL`, `SENTRY_*`). Variables used in code but absent from `.env.example` should be added to `.env.local` when you need that feature.

## Env validation (Zod)

Validation lives in `app/src/server/validation/env.ts`:

- `envSchema` — `z.object({ ... })` with the rules in the table above (formats, prefixes, and min lengths).
- `env` — parsed once at module load via `envSchema.safeParse(process.env)`.
- On failure, accessing `env.<KEY>` throws: `Env validation failed for <KEY>: <message>` (except in `NODE_ENV=test`, where missing keys return `undefined` from the proxy).

Import `env` from `@/server/validation/env` in server modules (database, auth, billing, storage, AI, jobs, email). Do not read validated secrets directly from `process.env` in those paths.

CLI scripts that import `env` before other modules should import `app/scripts/load-env.ts` first so `app/.env.local` is loaded:

```ts
import "./load-env";
import { env } from "@/server/validation/env";
```

Next.js loads `.env.local` automatically for `next dev` / `next start`; standalone scripts use `load-env.ts` or explicit `dotenv` (see `app/scripts/check-db.ts`, migration scripts).

Unit tests for validation patterns: `app/tests/unit/env-validation.test.ts`.

## Required vs optional settings

**Startup will fail** (when server code touches `env`) if any Zod-required variable is missing or invalid. That includes database, auth, OpenAI, R2, Inngest, Resend, Stripe, and core URL variables.

**Optional behavior:**

- OAuth providers — omitted unless both client ID and secret are set (`app/src/server/auth/index.ts`).
- Zep brand memory — off unless `ZEP_ENABLED === "true"` and `ZEP_API_KEY` is set.
- Sentry — disabled when `SENTRY_DSN` is unset (`silent: !process.env.SENTRY_DSN` in `app/next.config.ts`).
- Upstash rate limiting — if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are unset, production uses an in-memory limiter with a warning (`app/src/lib/rate-limit.ts`).
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
| Sentry `tracesSampleRate` | `0.1` production, `1.0` otherwise | `app/src/instrumentation.ts` |

Example local values from `app/.env.example`: `BETTER_AUTH_URL` and `APP_URL` default to `http://localhost:3000`; Inngest keys use `local`.

## Config file format

### `app/.env.example` / `app/.env.local`

Dotenv-style `KEY=value` pairs. Use `.env.local` for secrets (gitignored). Never commit real API keys.

### `render.yaml` (repository root)

Render Blueprint for production:

| Resource | Name | Notes |
|----------|------|--------|
| Web service | `adscale-app` | `rootDir: app`, `buildCommand: npm ci && npm run build`, `startCommand: npm run db:migrate && npm run start:prod`, health check `/api/health` |
| Database | `adscale-postgres` | PostgreSQL 16, database `adscale_db`, user `adscale` |

Injected or fixed env vars include `NODE_ENV=production`, `DATABASE_URL` from the managed DB, generated `BETTER_AUTH_SECRET`, and public URLs. Secrets marked `sync: false` must be set in the Render Dashboard. See also `docs/render-deployment.md`.

Production URL placeholders in the blueprint (update if your service URL differs):

- `BETTER_AUTH_URL`, `APP_URL`: `https://adscale-app.onrender.com`
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`: paths under that host

<!-- VERIFY: Confirm the live Render service URL and custom domain in the Render Dashboard; update BETTER_AUTH_URL, APP_URL, and Stripe redirect URLs if they differ from render.yaml -->

### `app/drizzle.config.ts`

Drizzle Kit config: schema `app/src/server/db/schema.ts`, migrations under `app/drizzle`, PostgreSQL dialect, `schemaFilter: ["adscale_app"]`, credentials from `process.env.DATABASE_URL` (not validated through `env` at CLI time—must be set in the shell).

### `app/next.config.ts`

Next.js 16 config: `output: 'standalone'`, `next-intl` plugin, Sentry wrapper, optional bundle analyzer when `ANALYZE=true`. Reads `R2_PUBLIC_BASE_URL`, `SENTRY_*`, and `NODE_ENV` from the environment at build time.

### Docker (optional local stack)

`app/docker-compose.yml`, `app/Dockerfile`, and `app/DOCKER.md` describe a containerized Postgres + app (+ optional Inngest dev profile). Env for Compose is separate from `.env.local`; see `app/DOCKER.md` for `.env.docker` and service-specific variables.

## Per-environment overrides

| Environment | How config is supplied |
|-------------|-------------------------|
| **Local dev** | `app/.env.local` (from `.env.example`). Run `npm run dev` in `app/` (starts Next.js and Inngest dev server). Auth URLs typically `http://localhost:3000`. |
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
| `npm run db:migrate` | Apply Drizzle migrations (Render `preDeployCommand`) |
| `npm run db:generate` | Generate migration SQL |
| `npm run db:push` | Push schema (dev convenience) |
| `npm run db:studio` | Drizzle Studio |
| `npm run test` | Vitest (`config/vitest.config.ts`) |
| `npm run test:db:setup` / `test:db:teardown` | Docker test Postgres on port 5433 |
| `npm run analyze` | Bundle analyzer (`ANALYZE=true`) |

Root `package.json` only adds `cross-env` for monorepo tooling; application scripts live in `app/package.json`.

## Related documentation

- `docs/GETTING-STARTED.md` — first-time clone and run
- `docs/DEPLOYMENT.md` — deployment targets and CI
- `docs/render-deployment.md` — Render secrets checklist and URL updates
