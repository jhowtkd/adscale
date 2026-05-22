# ADScale

AI-powered creative derivation platform for marketing teams. Upload a base creative, fill a campaign brief, receive an AI-generated creative plan, and generate multiple platform-ready ad variations — all in minutes.

## Features

- **Campaign Management** — Create, organize, and track campaigns with structured briefs.
- **AI Creative Planning** — Generate structured creative plans from campaign briefs using OpenAI.
- **Image Derivations** — Produce multiple visually consistent ad variations from a single base creative.
- **Review & Approval** — Gallery view with preview, compare, approve, and regenerate workflows.
- **Export & Delivery** — Export individual derivations or download approved sets as ZIP archives.
- **Restyling & Templates** — Apply style transfers and reuse creative templates across campaigns.
- **Credit-Gated AI Usage** — Usage is controlled via a credit system integrated with Stripe billing.
- **Multi-language** — Full internationalization support (English and Brazilian Portuguese).
- **Workspace Isolation** — All data is scoped to workspaces with strict membership-based access control.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js](https://nextjs.org/) 16 (App Router) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| UI | [React](https://react.dev/) 19, [Tailwind CSS](https://tailwindcss.com/) 4, [shadcn/ui](https://ui.shadcn.com/) |
| State & Data | [TanStack Query](https://tanstack.com/query), [Zustand](https://github.com/pmndrs/zustand) |
| ORM & Database | [Drizzle ORM](https://orm.drizzle.team/), PostgreSQL |
| Auth | [Better Auth](https://www.better-auth.com/) |
| Payments | [Stripe](https://stripe.com/) |
| AI / LLM | [OpenAI](https://openai.com/) (GPT text + image models via AI SDK) |
| Background Jobs | [Inngest](https://www.inngest.com/) |
| Storage | Cloudflare R2 (S3-compatible object storage) |
| i18n | [next-intl](https://next-intl-docs.vercel.app/) |
| Testing | [Vitest](https://vitest.dev/), Testing Library, jsdom |
| Linting | ESLint (Next.js config) |

## Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 16+ (or a Neon database for cloud development)
- **Cloudflare R2** bucket (for creative asset storage)
- **OpenAI API key** (for AI planning and image generation)
- **Stripe account** (for billing and subscriptions)
- **Inngest account** (or local Inngest dev server for background jobs)

## Quick Start

1. **Clone the repository:**

   ```bash
   git clone <repo-url>
   cd ADScale_2/app
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env.local
   ```

   Fill in all required values in `.env.local` (see [Environment Variables](#environment-variables)).

4. **Run database migrations:**

   ```bash
   npm run db:migrate
   ```

5. **Start the development server:**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

   > This command also wires up the local Inngest dev server for background jobs.

## Environment Variables

The app validates environment variables at server startup using Zod. Missing values will cause tests, builds, or route execution to fail.

### Core

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret key for auth token signing |
| `BETTER_AUTH_URL` | Public URL of the app (used by Better Auth) |
| `APP_URL` | Public application URL |

### AI / OpenAI

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_TEXT_MODEL` | Text model for creative planning (e.g., `gpt-5-mini`) |
| `OPENAI_IMAGE_MODEL` | Image model for derivations (e.g., `gpt-image-2-2026-04-21`) |

### Storage (R2)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | Public CDN base URL for assets |

### Background Jobs (Inngest)

| Variable | Description |
|----------|-------------|
| `INNGEST_EVENT_KEY` | Inngest event key |
| `INNGEST_SIGNING_KEY` | Inngest signing key |

### Billing (Stripe)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret |
| `STRIPE_STARTER_PRICE_ID` | Price ID for Starter plan |
| `STRIPE_GROWTH_PRICE_ID` | Price ID for Growth plan |
| `STRIPE_SCALE_PRICE_ID` | Price ID for Scale plan |
| `STRIPE_SUCCESS_URL` | Redirect URL after successful checkout |
| `STRIPE_CANCEL_URL` | Redirect URL after cancelled checkout |

### Email (Resend)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `EMAIL_FROM` | Default sender email address |

## Development Commands

All commands should be run from the `app/` directory.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server with Inngest wiring |
| `npm run dev:next` | Start Next.js dev server only |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema changes (dev only) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run inngest:dev` | Start local Inngest dev server |

## Testing

Tests are written with **Vitest** and **Testing Library**.

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests once |
| `npx vitest --config config/vitest.config.ts` | Run tests in watch mode |

Test suites cover:
- Environment validation and Zod schemas
- Repository and database logic
- Prompt parsing and AI utilities
- R2 storage key generation
- Integration flows (auth, workspace creation, campaign CRUD, upload, plan generation, derivation jobs, review, export)

## Docker Usage

A Docker Compose setup is available for local development with PostgreSQL and optional Inngest.

```bash
# Build and run app + PostgreSQL
docker-compose up --build

# With Inngest dev server
docker-compose --profile dev up --build
```

- App: `http://localhost:3000`
- Inngest Dev UI: `http://localhost:8288`
- PostgreSQL: `localhost:5432`

> For details, see [`app/DOCKER.md`](app/DOCKER.md).

## Deployment

The app is configured for deployment on **Render** via [`render.yaml`](render.yaml) at the repository root.

- **Root directory:** `app`
- **Build command:** `npm ci && npm run build`
- **Pre-deploy command:** `npm run db:migrate`
- **Start command:** `npm start`
- **Health check:** `/api/health`

Render environment variables should map to the variables listed above. Sensitive values (API keys, secrets) should be configured as encrypted environment variables in the Render dashboard.

## Project Structure

```
ADScale_2/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # App Router
│   │   │   ├── (dashboard)/      # Dashboard routes (campaigns, settings, templates, restyling)
│   │   │   ├── api/              # API routes (auth, billing, campaigns, derivations, exports, etc.)
│   │   │   ├── login/            # Login page
│   │   │   ├── signup/           # Signup page
│   │   │   ├── layout.tsx        # Root layout
│   │   │   └── globals.css       # Global styles
│   │   ├── components/           # React components
│   │   ├── lib/                  # Client utilities, hooks
│   │   ├── server/               # Server-only code
│   │   │   ├── ai/               # AI prompt builders and model clients
│   │   │   ├── auth/             # Auth configuration and helpers
│   │   │   ├── billing/          # Stripe integration
│   │   │   ├── db/               # Drizzle schema and connection
│   │   │   ├── jobs/             # Inngest background job handlers
│   │   │   ├── repositories/     # Data access layer
│   │   │   ├── services/         # Business logic services
│   │   │   ├── storage/          # R2 / S3 storage utilities
│   │   │   └── validation/       # Zod schemas and env validation
│   │   ├── i18n.ts               # i18n configuration
│   │   └── middleware.ts         # Next.js middleware (auth, i18n)
│   ├── tests/                    # Test suites (unit + integration)
│   ├── messages/                 # Translation files (en.json, pt-BR.json)
│   ├── config/                   # Tooling configs (Vitest, etc.)
│   ├── docker/                   # Docker entrypoint and DB init scripts
│   ├── drizzle/                  # Migration files
│   ├── scripts/                  # Dev and utility scripts
│   ├── Dockerfile                # Production Docker image
│   ├── docker-compose.yml        # Local Docker orchestration
│   ├── drizzle.config.ts         # Drizzle Kit configuration
│   └── package.json
├── .planning/                    # Project planning and requirements
├── docs/                         # Additional documentation
├── render.yaml                   # Render deployment blueprint
└── README.md                     # This file
```

## License

This is a **private, proprietary project**. All rights reserved. Unauthorized use, distribution, or modification is strictly prohibited.
