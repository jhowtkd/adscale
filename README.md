<!-- generated-by: gsd-doc-writer -->

# ADScale

AI-powered creative derivation platform for marketing teams. Upload a base creative, define a campaign brief, receive a structured creative plan, and generate platform-ready ad variations—with quality gates, review workflows, and credit-gated billing.

## Features

- **Campaign management** — Organize campaigns with structured briefs (audience, platforms, tone, constraints).
- **AI creative planning** — Generate strategy, angles, hooks, and CTAs from briefs via OpenAI text models.
- **Image derivations** — Produce art variations, native format adaptations (Meta/Google aspect ratios), and restyling from reference creatives.
- **Creative contract** — Shared contract across prompts, scoring, and QA so generation modes stay consistent end-to-end.
- **Hard quality gate** — Automatic `invalid` / `improvable` / `acceptable` verdicts block approval of failing derivations.
- **Review UI** — Verdict badges on derivation cards, review modal, and **regenerate with fixes** flow for improvable outputs.
- **Campaign load errors** — Typed error taxonomy (`session`, `workspace`, `not_found`, `timeout`, `server`) with dedicated UI states.
- **Export & delivery** — Download approved sets as ZIP archives; assets stored on Cloudflare R2.
- **Credit-gated AI** — Usage limits integrated with Stripe subscriptions (Starter, Growth, Scale).
- **Workspaces & i18n** — Multi-tenant workspace isolation; English and Brazilian Portuguese (`next-intl`).

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
| Payments | [Stripe](https://stripe.com/) |
| State | [TanStack Query](https://tanstack.com/query), [Zustand](https://github.com/pmndrs/zustand) |
| Testing | [Vitest](https://vitest.dev/) (614+ tests), Testing Library |

The runnable application lives in **`app/`** (not the repository root). API routes are under `app/src/app/api/`.

## Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 16+ (local, Docker, or Neon)
- Credentials for **OpenAI**, **Cloudflare R2**, **Stripe**, and **Inngest** (or local Inngest dev server)

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

For Stripe webhooks, Docker, and billing smoke tests, see [`app/README.md`](app/README.md).

## Usage examples

### Typical campaign workflow

1. **Create a campaign** — Set client, product, objective, audience, platforms, and tone in the dashboard.
2. **Upload a base creative** — Attach the source image asset to the campaign.
3. **Generate a creative plan** — AI proposes strategy, angles, hooks, and CTAs from the brief.
4. **Run derivations** — Choose a mode (`art_variation`, `format_adaptation`, or `restyling`), enqueue jobs via Inngest, then review verdicts and approve or regenerate with fixes.
5. **Export** — Download approved derivations individually or as a ZIP.

### Run tests

From `app/`:

```bash
npm test
```

CI runs lint, migrations, tests, and production build on push/PR to `main` (see `.github/workflows/ci.yml`).

## Documentation

| Resource | Description |
|----------|-------------|
| [`app/README.md`](app/README.md) | Local env, Stripe test mode, verification commands |
| [`app/.env.example`](app/.env.example) | Environment variable reference |
| [`app/DOCKER.md`](app/DOCKER.md) | Docker Compose for Postgres + optional Inngest |
| [`render.yaml`](render.yaml) | Render deployment blueprint (`rootDir: app`) |

## Project structure

```
ADScale_2/
├── app/                    # Next.js application (package.json, src/, tests/)
│   ├── src/app/            # App Router pages and API routes
│   ├── src/server/         # Auth, AI, billing, jobs, repositories
│   ├── tests/              # Vitest unit and integration suites
│   └── drizzle/            # SQL migrations
├── render.yaml             # Render.com deploy config
└── README.md               # This file
```

## Deployment

Production deploys target **Render** using [`render.yaml`](render.yaml):

- **Root directory:** `app`
- **Build:** `npm ci && npm run build`
- **Pre-deploy:** `npm run db:migrate`
- **Health check:** `/api/health`

<!-- VERIFY: Production URL matches your Render service name if not adscale-app.onrender.com -->

## License

Private, proprietary project. All rights reserved. Unauthorized use, distribution, or modification is prohibited.
