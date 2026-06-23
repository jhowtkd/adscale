<!-- generated-by: gsd-doc-writer -->

# ADScale

AI-powered creative derivation platform for marketing teams. Upload a base creative, define a campaign brief, receive a structured creative plan, and generate platform-ready ad variations—with quality gates, review workflows, and production Stripe billing (v12.0).

## Features

### Creative workflow

- **Campaign management** — Organize campaigns with structured briefs (audience, platforms, tone, constraints).
- **AI creative planning** — Generate strategy, angles, hooks, and CTAs from briefs via OpenAI text models.
- **Image derivations** — Produce art variations, native format adaptations (Meta/Google aspect ratios), and **restyling** from style-reference assets with adjustable intensity (`soft` / `medium` / `strong`). Restyle requests enqueue Inngest `derivation.generate` jobs via `POST /api/campaigns/[id]/restyle`.
- **Creative contract** — Shared contract across prompts, scoring, and QA so generation modes stay consistent end-to-end.
- **Hard quality gate** — Automatic `invalid` / `improvable` / `acceptable` verdicts block approval of failing derivations.
- **Review UI** — Verdict badges on derivation cards, review modal, and **regenerate with fixes** flow for improvable outputs.
- **Persona simulation** — Preview how target personas might react to a creative before committing to a full derivation batch.
- **Campaign load errors** — Typed error taxonomy (`session`, `workspace`, `not_found`, `timeout`, `server`) with dedicated UI states.
- **Export & delivery** — Download approved sets as ZIP archives; assets stored on Cloudflare R2.
- **Workspaces & i18n** — Multi-tenant workspace isolation; English and Brazilian Portuguese (`next-intl`).

### Monetization & billing (v12.0)

- **Stripe subscriptions** — Starter (30 credits/mo), Growth (120), and Scale (360) plans with a **14-day free trial** via Stripe Checkout.
- **Subscription lifecycle** — Webhook-driven state sync (`checkout.session.completed`, subscription updates, `invoice.paid`, `invoice.payment_failed`). Monthly credit grants on `invoice.paid`; grants suspended while `past_due` until payment recovers.
- **Credit-gated AI** — Spend enforcement on derivations, creative plans, diagnosis, and copy variants; existing balance remains spendable during `past_due`.
- **In-product conversion gates** — Blocked paid actions return HTTP **402** with contextual CTAs (checkout, Stripe Customer Portal, or billing settings) via `ConversionCta`.
- **Billing account UI** — Settings tabs for plans, subscription status, credit balance, grant history, and usage forecast (EN + PT-BR).
- **Production preflight** — `npm run preflight:stripe` validates Stripe env vars, price IDs, and webhook events before go-live.

### Cockpit & analytics

- **Cockpit instrumentation** — Beta analytics events across the creative cockpit: preview funnel, strategy recipe/tradeoff selection, guided briefing abandon, and stage enter/complete/abandon signals.
- **Readiness override** — Operators can override false-positive readiness blocks and continue to derivation when preflight is overly strict.
- **Credit estimate transparency** — Batch and preview credit estimates with upfront breakdown before approving generation.
- **Mission resume UX** — Dashboard mission path with deep links back into blocked or in-progress cockpit stages.
- **Owner analytics** — Feedback dashboard with cockpit funnel, credit surprise signals, briefing abandon by step, human-quality corpus (calibration, coverage, trends, learning impact), and CSV export.
- **Beta operator sessions** — Session-scoped grouping for operator runbooks and analytics correlation.

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js](https://nextjs.org/) 16.2 (App Router) |
| UI | [React](https://react.dev/) 19, [Tailwind CSS](https://tailwindcss.com/) 4, Base UI |
| Language | TypeScript 5 |
| Data | [Drizzle ORM](https://orm.drizzle.team/), PostgreSQL |
| Auth | [Better Auth](https://www.better-auth.com/) |
| Jobs | [Inngest](https://www.inngest.com/) |
| AI | [OpenAI](https://openai.com/) (text + image models) |
| Storage | Cloudflare R2 (S3-compatible) |
| Payments | [Stripe](https://stripe.com/) (Checkout, Customer Portal, webhooks) |
| Email | [Resend](https://resend.com/) |
| Monitoring | [Sentry](https://sentry.io/) (`@sentry/nextjs`) |
| State | [TanStack Query](https://tanstack.com/query), [Zustand](https://github.com/pmndrs/zustand) |
| Testing | [Vitest](https://vitest.dev/) (2204 tests), Testing Library, [Playwright](https://playwright.dev/) (E2E) |

The runnable application lives in **`app/`** (not the repository root). API routes are under `app/src/app/api/`.

## Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 16+ (local, Docker, or Neon)
- Credentials for **OpenAI**, **Cloudflare R2**, **Stripe**, **Resend**, and **Inngest** (or local Inngest dev server)

See `app/.env.example` for the full variable list.

## Installation

```bash
git clone https://github.com/jhowtkd/adscale.git
cd adscale/app   # repository folder may be ADScale_2 locally
npm install
cp .env.example .env.local
# Edit .env.local with your credentials
npm run db:migrate
```

## Quick start

1. Install dependencies and copy env (see [Installation](#installation)).
2. Run migrations: `npm run db:migrate` (from `app/`).
3. Start dev (Next.js + Inngest wiring): `npm run dev`.
4. Open **http://localhost:3000**, sign up, create a workspace and campaign.

For Stripe webhooks, Docker, billing smoke tests, and production preflight, see [`app/README.md`](app/README.md).

## Usage examples

### Typical campaign workflow

1. **Create a campaign** — Set client, product, objective, audience, platforms, and tone in the dashboard.
2. **Upload a base creative** — Attach the source image asset to the campaign.
3. **Run readiness preflight** — Review readiness score; override if a false positive blocks progress.
4. **Generate a creative plan** — AI proposes strategy, angles, hooks, and CTAs from the brief.
5. **Choose a strategy recipe** — Pick a recipe, review credit estimates, and generate a preview batch.
6. **Run derivations** — Choose a mode (`art_variation`, `format_adaptation`, or `restyling`), enqueue jobs via Inngest, then review verdicts and approve or regenerate with fixes. For restyling, upload a style-reference asset and call `POST /api/campaigns/{id}/restyle` with optional `styleIntensity`.
7. **Export** — Download approved derivations individually or as a ZIP.

### Subscribe and manage billing

1. **Choose a plan** — Settings → Plans; select Starter, Growth, or Scale (14-day trial on first checkout).
2. **Complete checkout** — Stripe Checkout redirects back to Settings → Billing on success.
3. **Monitor usage** — Billing tab shows credit balance, subscription status, grant history, and spend forecast.
4. **Recover from past due** — In-product 402 gates route to Stripe Customer Portal to update payment method.

### Run tests

From `app/`:

```bash
npm test
```

The test suite runs **2204 Vitest tests** across billing lifecycle, derivation jobs, access policy, conversion surfaces, and account UI. Playwright E2E specs (`npm run test:e2e`) cover browser-only flows such as restyle file uploads. CI runs lint, migrations, tests, and production build on push/PR to `main` (see `.github/workflows/ci.yml`).

## Documentation

| Resource | Description |
|----------|-------------|
| [`app/README.md`](app/README.md) | Local env, Stripe test mode, webhook setup, verification commands |
| [`app/.env.example`](app/.env.example) | Environment variable reference |
| [`app/DOCKER.md`](app/DOCKER.md) | Docker Compose for Postgres + optional Inngest |
| [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) | Prerequisites, first run, billing setup |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Dev scripts, lint, branch conventions |
| [`docs/TESTING.md`](docs/TESTING.md) | Vitest, Playwright E2E, coverage, CI |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, data flow, billing model |
| [`docs/API.md`](docs/API.md) | HTTP API overview |
| [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) | Environment variables and defaults |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Render deployment and rollback |
| [`render.yaml`](render.yaml) | Render deployment blueprint (`rootDir: app`) |

### Billing scripts (from `app/`)

| Command | Description |
|---------|-------------|
| `npm run preflight:stripe` | Validate Stripe env, prices, and webhook config before production go-live |
| `npm run preflight:stripe -- --offline` | Env-only checks without live Stripe API calls |
| `npm run seed:stripe` | Seed test-mode Stripe products/prices (test keys only) |

## Project structure

```
ADScale_2/
├── app/                    # Next.js application (package.json, src/, tests/)
│   ├── src/app/            # App Router pages and API routes
│   ├── src/server/         # Auth, AI, billing, jobs, repositories
│   ├── tests/              # Vitest unit/integration suites; Playwright E2E
│   └── drizzle/            # SQL migrations
├── docs/                   # Architecture, API, deployment, and dev guides
├── render.yaml             # Render.com deploy config
└── README.md               # This file
```

## Deployment

Production deploys target **Render** using [`render.yaml`](render.yaml):

- **Root directory:** `app`
- **Build:** `npm ci && npm run build`
- **Start:** `npm run db:migrate && npm run start:prod`
- **Health check:** `/api/health`
- **Production URL:** https://adscale.jhonatansoares.com

Stripe production secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs) are configured as Render env vars with `sync: false`. Run `npm run preflight:stripe` from a Render shell or locally with production `.env` before enabling live billing.

## License

Private, proprietary project. All rights reserved. Unauthorized use, distribution, or modification is prohibited.
