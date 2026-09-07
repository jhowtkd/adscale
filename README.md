<!-- generated-by: gsd-doc-writer -->

# ADScale

AI-powered creative production for performance ads. Operators work in the **Estúdio**: one **Trabalho** under an active brand, a **Protocolo** (variations, single piece, format adaptation, restyle, carousel), review, and delivery.

Campaign / briefing / creative-plan / cockpit copy below is **historical**. The canonical glossary is [`CONTEXT.md`](CONTEXT.md). Agents: [`docs/agents/source-of-truth.md`](docs/agents/source-of-truth.md). Frozen: Landing Page generator and Persona Simulation ([ADR 0013](docs/adr/0013-trabalho-criativo-first.md)).

## Features

The live operator surface is the **Estúdio**. Campaign is optional grouping, not a required destination. Prefer [`CONTEXT.md`](CONTEXT.md) when this list disagrees.

### Estúdio (canonical)

- **Trabalho** — One resumable creative work under an active brand: request, references, protocol, review, select, and export.
- **Protocolos** — Variations, Peça única, format adaptation, restyle, and carousel. Switching protocol keeps the previous draft instead of converting it.
- **Optional campaign** — A Trabalho may be linked to a campaign; generating does not require one.
- **Creative contract and quality gate** — Shared contract across prompts, scoring, and QA. Automatic verdicts can block approval of failing pieces.
- **Export & delivery** — Download selected pieces; assets stored on Cloudflare R2.
- **Workspaces & i18n** — Multi-tenant workspace isolation; English and Brazilian Portuguese (`next-intl`).
- **Owner analytics** — Funnel of selected and delivered unique pieces, origin/protocol segments, human-quality corpus, and CSV export.
- **Beta operator sessions** — Session-scoped grouping for operator runbooks and analytics correlation.
- **Persona simulation** — Frozen (ADR 0013). Do not unfreeze without a new ADR.

### Historical campaign cockpit (legacy adapter)

Do not add new primary destinations here.

- **Campaign management** — Organize campaigns with structured briefs (audience, platforms, tone, constraints).
- **AI creative planning** — Generate strategy, angles, hooks, and CTAs from briefs via OpenAI text models.
- **Image derivations** — Produce art variations, native format adaptations, and restyling from style-reference assets (`POST /api/campaigns/[id]/restyle`).
- **Review UI** — Verdict badges on derivation cards, review modal, and regenerate-with-fixes for improvable outputs.
- **Campaign load errors** — Typed error taxonomy (`session`, `workspace`, `not_found`, `timeout`, `server`) with dedicated UI states.
- **Cockpit instrumentation** — Beta analytics across the historical cockpit (preview funnel, guided briefing, stage enter/complete/abandon).
- **Readiness override** — Operators can override false-positive readiness blocks in the cockpit.
- **Credit estimate transparency** — Batch and preview credit estimates before approving generation.
- **Mission resume UX** — Dashboard mission path with deep links into blocked or in-progress cockpit stages.

### Monetization & billing (v12.0)

- **Stripe subscriptions** — Starter (30 credits/mo), Growth (120), and Scale (360) plans with a **14-day free trial** via Stripe Checkout.
- **Subscription lifecycle** — Webhook-driven state sync (`checkout.session.completed`, subscription updates, `invoice.paid`, `invoice.payment_failed`). Monthly credit grants on `invoice.paid`; grants suspended while `past_due` until payment recovers.
- **Credit-gated AI** — Spend enforcement on derivations, creative plans, diagnosis, and copy variants; existing balance remains spendable during `past_due`.
- **In-product conversion gates** — Blocked paid actions return HTTP **402** with contextual CTAs (checkout, Stripe Customer Portal, or billing settings) via `ConversionCta`.
- **Billing account UI** — Settings tabs for plans, subscription status, credit balance, grant history, and usage forecast (EN + PT-BR).
- **Production preflight** — `npm run preflight:stripe` validates Stripe env vars, price IDs, and webhook events before go-live.

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
| Testing | [Vitest](https://vitest.dev/), Testing Library, [Playwright](https://playwright.dev/) (E2E) |

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
4. Open **http://localhost:3000**, sign up, create a workspace, pick a brand, and start a Trabalho in the Estúdio.

For Stripe webhooks, Docker, billing smoke tests, and production preflight, see [`app/README.md`](app/README.md).

## Usage examples

### Typical Estúdio workflow

1. **Pick a brand** — Active client profile is required before a Trabalho starts.
2. **State the request** — Protocol, offer, and audience come from the request and brand; do not re-ask facts already present.
3. **Prepare and generate** — The composer prepares a plan, then dispatches image jobs (heavy work on `adscale-image-worker` when cut over).
4. **Select and export** — Approving a Peça and downloading the original version is delivered value; regenerations are a new version.

### Historical campaign workflow (legacy adapter)

The campaign cockpit (brief → plan → derivation batch → ZIP) still exists in the codebase. Do not add new primary destinations there. Persona simulation stays frozen.

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

The test suite spans **900+ Vitest test files** across billing lifecycle, derivation jobs, access policy, conversion surfaces, and account UI. Playwright E2E specs (`npm run test:e2e`) cover browser-only flows such as restyle file uploads. CI runs lint, typecheck, migrations, tests, and production build on push/PR to `main` (see `.github/workflows/ci.yml`).

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
