# Deployment Guide

This document describes how to deploy the ADScale application to production and run it locally via Docker. It covers the Render Blueprint workflow, Docker multi-stage builds, database migrations, background job configuration, health checks, and rollback procedures.

---

## Table of Contents

- [Deployment Overview](#deployment-overview)
- [Docker Deployment](#docker-deployment)
  - [Local Docker Stack](#local-docker-stack)
  - [Docker Production Notes](#docker-production-notes)
- [Render Deployment](#render-deployment)
  - [Blueprint Overview](#blueprint-overview)
  - [Step-by-Step Deploy](#step-by-step-deploy)
  - [Environment Variables on Render](#environment-variables-on-render)
- [Database Migration Strategy](#database-migration-strategy)
- [Pre-Deploy and Post-Deploy Steps](#pre-deploy-and-post-deploy-steps)
- [Environment Variable Setup for Production](#environment-variable-setup-for-production)
- [Background Jobs in Production](#background-jobs-in-production)
- [Health Checks](#health-checks)
- [Rollback Strategy](#rollback-strategy)
- [Monitoring and Logging](#monitoring-and-logging)

---

## Deployment Overview

ADScale is a Next.js 16 application built as a **standalone output** (`output: 'standalone'` in `next.config.ts`). It is designed to run as a containerized Node.js service or on Render's native Node runtime.

**Primary deploy targets:**

| Target | Runtime | Database | Use Case |
|--------|---------|----------|----------|
| **Render** | Node.js native | Managed PostgreSQL 16 (Render) | Primary production host |
| **Docker** | Node.js 20 (Alpine) | PostgreSQL 16 (container or external) | Local development, self-hosted production |

<!-- VERIFY: The project can also be deployed to Neon-managed PostgreSQL for production if not using Render's managed database. The render.yaml Blueprint is configured for Render-managed Postgres by default. -->

**Key deployment characteristics:**

- **Build output:** Next.js standalone server (`server.js`)
- **Port:** `3000`
- **Host:** `0.0.0.0`
- **Non-root user:** `nextjs` (UID 1001) in Docker
- **Migrations:** Drizzle Kit, applied at container start or via Render `preDeployCommand`
- **Background jobs:** Inngest
- **Env validation:** Zod schema (`src/server/validation/env.ts`) — the app will refuse to start if any required variable is missing or invalid

---

## Docker Deployment

### Local Docker Stack

The repository includes a `docker-compose.yml` that spins up the full local stack:

```bash
cd app

# App + PostgreSQL only
docker compose up --build

# App + PostgreSQL + Inngest dev server
docker compose --profile dev up --build
```

**Services:**

1. **`postgres`** — PostgreSQL 16 (Alpine)
   - User: `adscale` / Password: `adscale123` / DB: `adscale_db`
   - Port `5432` mapped to host
   - Persistent volume: `postgres_data`
   - Initialization script: `docker/postgres/init.sql` creates the `adscale_app` schema
   - Healthcheck: `pg_isready`

2. **`app`** — Next.js standalone build
   - Built from the multi-stage `Dockerfile`
   - Port `3000`
   - Loads env vars from `.env.docker`
   - Depends on `postgres` being healthy
   - Healthcheck: `wget --spider http://localhost:3000/`

3. **`inngest`** *(profile `dev` only)* — Inngest dev server
   - Image: `inngest/inngest:latest`
   - Connects to `http://app:3000/api/inngest`
   - Port `8288`

**Useful commands:**

```bash
# Follow app logs
docker compose logs -f app

# Run migrations manually inside the container
docker compose exec app npx drizzle-kit migrate

# Access the database
docker compose exec postgres psql -U adscale -d adscale_db

# Destroy data and reset
docker compose down -v
docker compose up --build
```

### Dockerfile

Multi-stage build (`app/Dockerfile`):

- **Builder stage** (`node:20-alpine`)
  - Installs dependencies with `npm ci`
  - Runs `next build` to produce standalone output
  - Disables telemetry (`NEXT_TELEMETRY_DISABLED=1`)

- **Runner stage** (`node:20-alpine`)
  - Creates non-root user `nextjs` (UID 1001)
  - Copies standalone output, static assets, public files, and Drizzle artifacts
  - Installs production dependencies plus `drizzle-kit` for migrations
  - Entrypoint: `docker/entrypoint.sh`
  - Exposes port `3000`

### `docker/entrypoint.sh`

```text
1. Wait for PostgreSQL on postgres:5432 (via nc)
2. Run npx drizzle-kit migrate
3. Start node server.js
```

### Docker Production Notes

For a self-hosted production deployment:

1. Replace the local PostgreSQL service with an external database (e.g., Neon, AWS RDS, or a dedicated Postgres instance).
2. Update `DATABASE_URL` in `.env.docker` to point to the external database.
3. Remove or disable the `inngest` dev server service. Connect to **Inngest Cloud** instead.
4. Ensure `NODE_ENV=production` is set.
5. Build and run:

   ```bash
   docker compose -f docker-compose.yml up --build -d
   ```

<!-- VERIFY: For production Docker deployments, you must supply your own production-grade PostgreSQL and Inngest Cloud credentials. The included compose file is optimized for local development. -->

---

## Render Deployment

### Blueprint Overview

The `render.yaml` Blueprint at the repository root defines two resources:

- **`adscale-app`** — Node.js web service
- **`adscale-postgres`** — Managed PostgreSQL 16 database

**Service configuration:**

| Setting | Value |
|---------|-------|
| Runtime | Node |
| Plan | free (upgrade as needed) |
| Region | oregon |
| Root Directory | `app` |
| Branch | `main` |
| Auto Deploy | On commit |
| Build Command | `npm ci && npm run build` |
| Pre-Deploy Command | `npm run db:migrate` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

**Database configuration:**

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 16 |
| Plan | free |
| Database Name | `adscale_db` |
| User | `adscale` |
| IP Allow List | All (`[]`) |

### Step-by-Step Deploy

1. **Commit and push** `render.yaml` to your Git remote.

2. **Open the Render Blueprint wizard:**

   ```text
   https://dashboard.render.com/blueprint/new?repo=https://github.com/<your-org>/<your-repo>
   ```

3. **Fill in all `sync: false` secrets** in the Blueprint creation screen (see [Environment Variables on Render](#environment-variables-on-render)).

4. **Apply the Blueprint.** Render will:
   - Provision the managed PostgreSQL database.
   - Build the Next.js app.
   - Run `npm run db:migrate` before starting the service.
   - Start the app and begin health checks.

5. **Verify the deploy:**

   ```bash
   curl https://<your-service-name>.onrender.com/api/health
   ```

   Expected response:

   ```json
   {"ok":true,"service":"adscale-app","timestamp":"..."}
   ```

### Environment Variables on Render

**Auto-generated / auto-populated:**

| Variable | Source |
|----------|--------|
| `NODE_ENV` | `production` (hardcoded) |
| `NEXT_TELEMETRY_DISABLED` | `1` (hardcoded) |
| `DATABASE_URL` | Injected from `adscale-postgres` connection string |
| `BETTER_AUTH_SECRET` | Auto-generated by Render |

**Must be set manually** (marked `sync: false` in `render.yaml`):

| Variable | Example / Note |
|----------|----------------|
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2-2026-04-21` |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret |
| `R2_BUCKET` | `adscale` |
| `R2_PUBLIC_BASE_URL` | `https://pub-xxx.r2.dev` |
| `INNGEST_EVENT_KEY` | From Inngest Cloud dashboard |
| `INNGEST_SIGNING_KEY` | From Inngest Cloud dashboard |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `ADScale <onboarding@resend.dev>` |
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_STARTER_PRICE_ID` | `price_...` |
| `STRIPE_GROWTH_PRICE_ID` | `price_...` |
| `STRIPE_SCALE_PRICE_ID` | `price_...` |

**URL-dependent variables** (update if Render assigns a different URL or you add a custom domain):

| Variable | Default in Blueprint |
|----------|----------------------|
| `BETTER_AUTH_URL` | `https://adscale-app.onrender.com` |
| `APP_URL` | `https://adscale-app.onrender.com` |
| `STRIPE_SUCCESS_URL` | `https://adscale-app.onrender.com/settings?tab=billing&checkout=success` |
| `STRIPE_CANCEL_URL` | `https://adscale-app.onrender.com/settings?tab=plans&checkout=cancel` |

<!-- VERIFY: Production domain `https://adscale-app.onrender.com` and associated redirect URLs assume the default Render service name. Changing the service name or adding a custom domain requires updating `BETTER_AUTH_URL`, `APP_URL`, and Stripe redirect URLs. -->

---

## Database Migration Strategy

The project uses **Drizzle Kit** for schema migrations.

- **Schema file:** `src/server/db/schema.ts`
- **Migrations directory:** `./drizzle`
- **Target schema:** `adscale_app`
- **Migrations applied to:** `public` schema (per `drizzle.config.ts`)

### Migration Workflow

1. **Generate migrations** (developer machine):

   ```bash
   npm run db:generate
   ```

   This creates new SQL files in `./drizzle/`.

2. **Commit migration files** to version control.

3. **Apply migrations** automatically at deploy time:
   - **Render:** `preDeployCommand: npm run db:migrate`
   - **Docker:** `entrypoint.sh` runs `npx drizzle-kit migrate` before starting the server

### Rollback Considerations

Drizzle Kit does not provide automatic down-migrations out of the box. If a migration needs to be reverted:

1. Write a new forward migration that reverses the schema change.
2. Generate and apply it:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

3. For critical data-loss scenarios, restore from a database backup instead.

<!-- VERIFY: Render's free managed PostgreSQL plan does not guarantee automated backups. For production workloads, upgrade to a paid plan with automated backup retention or configure manual pg_dump schedules. -->

---

## Pre-Deploy and Post-Deploy Steps

### Pre-Deploy Checklist

- [ ] All required environment variables are set in the target platform.
- [ ] `BETTER_AUTH_SECRET` is at least 32 characters.
- [ ] `DATABASE_URL` points to the correct database and the `adscale_app` schema exists.
- [ ] Stripe webhook endpoints are registered and pointing to the new deployment URL.
- [ ] Inngest Cloud is configured to send events to `https://<your-url>/api/inngest`.
- [ ] R2 bucket and access credentials are active.
- [ ] Resend API key is valid and the sending domain is verified (for production email deliverability).
- [ ] Migration files are committed and pushed.
- [ ] Build passes locally: `npm ci && npm run build`.

### Post-Deploy Verification

1. **Health check:**

   ```bash
   curl https://<your-url>/api/health
   ```

2. **Smoke test pages:**
   - Home page (`/`)
   - Login / signup flow
   - Dashboard (`/campaigns`)

3. **Test a background job:**
   - Create a campaign and trigger a derivation.
   - Verify the job appears in Inngest Cloud and completes successfully.

4. **Verify external integrations:**
   - Stripe webhook delivery logs
   - Resend email delivery
   - R2 asset uploads and public URLs

---

## Environment Variable Setup for Production

The app validates all environment variables at runtime via Zod (`src/server/validation/env.ts`). **Missing or invalid values will cause the process to crash on startup.**

### Quick Production Env Checklist

```bash
# Required
DATABASE_URL="postgresql://..."
BETTER_AUTH_SECRET="<32+ random chars>"
BETTER_AUTH_URL="https://your-domain.com"
APP_URL="https://your-domain.com"
OPENAI_API_KEY="sk-..."
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="adscale"
R2_PUBLIC_BASE_URL="https://..."
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."
RESEND_API_KEY="re_..."
EMAIL_FROM="ADScale <noreply@yourdomain.com>"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_STARTER_PRICE_ID="price_..."
STRIPE_GROWTH_PRICE_ID="price_..."
STRIPE_SCALE_PRICE_ID="price_..."
STRIPE_SUCCESS_URL="https://your-domain.com/settings?tab=billing&checkout=success"
STRIPE_CANCEL_URL="https://your-domain.com/settings?tab=plans&checkout=cancel"

# Optional (have defaults)
OPENAI_TEXT_MODEL="gpt-5-mini"
OPENAI_IMAGE_MODEL="gpt-image-2-2026-04-21"
NODE_ENV="production"
NEXT_TELEMETRY_DISABLED="1"
```

### Generating a Secure `BETTER_AUTH_SECRET`

```bash
openssl rand -base64 32
```

---

## Background Jobs in Production

The application uses **Inngest** for background job processing. The primary job is `derivationJob`, which handles AI image generation.

- **Inngest client:** `src/server/jobs/client.ts`
- **Job handler:** `src/server/jobs/derivation.ts`
- **HTTP endpoint:** `/api/inngest` (`src/app/api/inngest/route.ts`)

### Local Development

```bash
# Automatic (recommended)
npm run dev

# Manual
npm run dev:next       # Terminal 1
npm run inngest:dev    # Terminal 2
```

The dev server UI is available at `http://localhost:8288`.

### Production Setup

<!-- VERIFY: The repository only includes the Inngest dev server for local use. For production, you must create an account on Inngest Cloud (inngest.com), create an app, and configure the event key and signing key. -->

1. **Create an app** in [Inngest Cloud](https://www.inngest.com/).
2. **Copy the Event Key and Signing Key** into `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
3. **Register the endpoint** in Inngest Cloud:

   ```text
   https://<your-production-url>/api/inngest
   ```

4. **Verify connectivity** in the Inngest Cloud dashboard.

---

## Health Checks

### Application Health Endpoint

- **Path:** `GET /api/health`
- **Response:**

  ```json
  {
    "ok": true,
    "service": "adscale-app",
    "timestamp": "2026-05-22T14:00:00.000Z"
  }
  ```

### Platform Health Checks

| Platform | Config | Behavior |
|----------|--------|----------|
| **Render** | `healthCheckPath: /api/health` | Render polls this path before marking the deploy as live. If it returns non-2xx, the deploy is considered unhealthy. |
| **Docker Compose** | `wget --spider http://localhost:3000/` | Docker restarts the container if the check fails 3 times. |
| **PostgreSQL (Docker)** | `pg_isready` | The `app` service waits for `postgres` to be healthy before starting. |

---

## Rollback Strategy

### Render Rollback

Render does not provide one-click rollback for Node services, but you can roll back by:

1. **Reverting the commit** that introduced the issue:

   ```bash
   git revert <bad-commit>
   git push origin main
   ```

   Render will auto-deploy the revert.

2. **Manual deploy of a previous commit** via the Render dashboard:
   - Go to the service → **Manual Deploy** → **Deploy a specific commit**.

<!-- VERIFY: Render's native rollback capabilities depend on your service plan. Verify rollback features in the Render dashboard for your specific plan tier. -->

### Database Rollback

- **Before risky migrations:** take a manual backup:

  ```bash
  pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
  ```

- **After a bad migration:** restore from backup:

  ```bash
  psql $DATABASE_URL < backup-file.sql
  ```

- **Schema-only rollback:** write a new forward migration that undoes the change, generate it, and deploy.

### Docker Rollback

```bash
# Rebuild from a specific git commit
git checkout <stable-commit>
docker compose up --build -d
```

---

## Monitoring and Logging

### Built-in Observability

- **Health endpoint:** `/api/health` — suitable for uptime monitoring.
- **Console logging:** Application errors are logged to `stdout`/`stderr`.
- **Inngest Cloud:** Job execution logs, retry counts, and failure traces are visible in the Inngest dashboard.

### Recommended External Monitoring

<!-- VERIFY: The repository does not include explicit APM, error tracking, or structured logging integrations. The following are common recommendations for Next.js production deployments. -->

| Tool | Purpose | Integration Point |
|------|---------|-------------------|
| **Uptime monitor** (e.g., UptimeRobot, Pingdom) | Alert if `/api/health` fails | `GET https://<your-url>/api/health` |
| **Log aggregation** (e.g., Datadog, Logtail, Papertrail) | Centralize Render/Docker logs | Render native integrations or Docker log driver |
| **Error tracking** (e.g., Sentry) | Capture frontend and API exceptions | Next.js SDK or custom API error middleware |
| **Database monitoring** | Query performance and connection health | Render Postgres metrics or Neon dashboard |

### Render Logs

Access logs via the Render dashboard or CLI:

```bash
render logs --service adscale-app
```

### Docker Logs

```bash
# Follow all services
docker compose logs -f

# Follow only the app
docker compose logs -f app
```

## Build Pipeline

The project uses a **CI-only GitHub Actions workflow** (`.github/workflows/ci.yml`). There is no automated deploy step in CI — Render deployments are triggered by the Blueprint's `autoDeployTrigger: commit`.

### CI Workflow

**Triggers:**

- Push to `main`
- Pull request to `main`

**Job:** `test` running on `ubuntu-latest`

**Steps:**

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4` |
| Setup Node.js 20 | `actions/setup-node@v4` with npm cache (`cache-dependency-path: app/package-lock.json`) |
| Install dependencies | `cd app && npm ci` |
| Lint | `cd app && npm run lint` |
| Type check | `cd app && npm run typecheck` |
| Run migrations | `cd app && npx drizzle-kit migrate` |
| Run tests | `cd app && npm test -- --run` |
| Build | `cd app && npm run build` |

**Test database service:**

A PostgreSQL 16 (Alpine) container is started as a service for the migration and test steps:

| Setting | Value |
|---------|-------|
| Image | `postgres:16-alpine` |
| Database | `adscale_test` |
| User / Password | `test` / `test` |
| Port | `5432` |

**Build environment variables:**

The `npm run build` step runs with mock values so the Next.js standalone build can complete without production secrets:

| Variable | Mock Value |
|----------|------------|
| `DATABASE_URL` | `postgres://test:test@localhost:5432/adscale_test` |
| `BETTER_AUTH_SECRET` | `01234567890123456789012345678901` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `APP_URL` | `http://localhost:3000` |
| `OPENAI_API_KEY` | `sk-test1234567890123456789012345678901234567890` |
| `OPENAI_TEXT_MODEL` | `gpt-4o` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` |
| `R2_ACCOUNT_ID` | `test` |
| `R2_ACCESS_KEY_ID` | `test` |
| `R2_SECRET_ACCESS_KEY` | `test` |
| `R2_BUCKET` | `test` |
| `R2_PUBLIC_BASE_URL` | `https://test.example.com` |
| `INNGEST_EVENT_KEY` | `test` |
| `INNGEST_SIGNING_KEY` | `test` |

<!-- VERIFY: The CI workflow does not include a deploy or release job. Render handles deployment separately via the Blueprint auto-deploy trigger. -->

---

## Related Documentation

- [`CONFIGURATION.md`](./CONFIGURATION.md) — Full environment variable reference and validation rules
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture and data flow
- [`render-deployment.md`](./render-deployment.md) — Render-specific quick-start
- [`DOCKER.md`](../app/DOCKER.md) — Docker-specific quick-start (Portuguese)
