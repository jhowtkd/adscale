# ADScale_2 Architecture

> Comprehensive architecture documentation for the ADScale_2 SaaS application — an AI-powered advertising creative generation platform.

---

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Frontend Architecture](#frontend-architecture)
6. [Backend Architecture](#backend-architecture)
7. [Data Layer](#data-layer)
8. [Authentication & Authorization](#authentication--authorization)
9. [Background Job Processing](#background-job-processing)
10. [AI Layer](#ai-layer)
11. [Billing & Subscriptions](#billing--subscriptions)
12. [Storage](#storage)
13. [API Design Patterns](#api-design-patterns)
14. [State Management](#state-management)
15. [Internationalization (i18n)](#internationalization-i18n)
16. [Testing Strategy](#testing-strategy)
17. [Deployment & Infrastructure](#deployment--infrastructure)
18. [Data Flow](#data-flow)
19. [Security Considerations](#security-considerations)

---

## Overview

ADScale_2 is a SaaS platform that helps marketing teams and agencies generate advertising creative variations at scale using AI. Users create **campaigns**, upload reference assets, configure creative parameters, and the system generates image derivations through OpenAI's image models. The platform supports multiple generation modes (art variation, format adaptation, restyling), creative scoring, quality assurance, landing page generation, and subscription-based billing.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Next.js    │  │  React 19   │  │ Tailwind CSS│  │  shadcn/ui          │ │
│  │  App Router │  │  Components │  │  Styling    │  │  Primitives         │ │
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                                                                    │
│  ┌──────┴──────────────────────────────────────────────────────────────────┐ │
│  │  State Management: TanStack Query (server) + Zustand (UI)               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ HTTP / API Routes
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Next.js API Routes (App Router)                                        │ │
│  │  ├── /api/auth/*          → Better Auth (session management)            │ │
│  │  ├── /api/campaigns/*     → Campaign CRUD & workflow                    │ │
│  │  ├── /api/derivations/*   → Derivation generation & management          │ │
│  │  ├── /api/billing/*       → Stripe checkout, portal, webhooks           │ │
│  │  ├── /api/client-profiles/* → Client reference library                  │ │
│  │  ├── /api/templates/*     → Campaign templates                          │ │
│  │  ├── /api/exports/*       → Asset export                                │ │
│  │  ├── /api/dashboard/*     → Analytics & metrics                         │ │
│  │  ├── /api/inngest         → Background job handler                      │ │
│  │  └── /api/health          → Health checks                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Server Modules                                                         │ │
│  │  ├── Auth (better-auth + workspace scoping)                             │ │
│  │  ├── Repositories (Drizzle ORM data access)                             │ │
│  │  ├── Services (email, export, landing page rendering)                   │ │
│  │  ├── AI Layer (prompt builder, scoring, diagnosis, QA)                  │ │
│  │  ├── Billing (Stripe integration, credit gates)                         │ │
│  │  ├── Jobs (Inngest background workers)                                  │ │
│  │  └── Storage (Cloudflare R2 / S3-compatible)                            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA & INFRASTRUCTURE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  PostgreSQL │  │  Cloudflare │  │   Stripe    │  │     OpenAI API      │ │
│  │  (Drizzle)  │  │     R2      │  │  Payments   │  │   (GPT-Image-2)     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │   Inngest   │  │   Resend    │  │   Render    │                          │
│  │  Job Queue  │  │   Email     │  │  Platform   │                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 15 (App Router) | Full-stack React framework |
| **Language** | TypeScript 5 | Type safety |
| **UI** | React 19 + Tailwind CSS 4 | Component library & styling |
| **Components** | shadcn/ui + Radix UI | Accessible UI primitives |
| **State (Server)** | TanStack Query v5 | Server state, caching, sync |
| **State (Client)** | Zustand | Local UI state |
| **ORM** | Drizzle ORM | Type-safe database queries |
| **Database** | PostgreSQL 16 | Relational data store |
| **Auth** | Better Auth | Session-based authentication |
| **Jobs** | Inngest | Background job processing |
| **AI** | OpenAI API (GPT-Image-2, GPT-5-mini) | Image generation & analysis |
| **Storage** | Cloudflare R2 (S3 API) | Object storage for assets |
| **Payments** | Stripe | Subscription billing |
| **Email** | Resend | Transactional emails |
| **i18n** | next-intl | Internationalization (pt-BR, en) |
| **Testing** | Vitest + jsdom + Testing Library | Unit & integration tests |
| **Validation** | Zod | Schema validation |
| **Deployment** | Render | Cloud hosting |

---

## Directory Structure

```
app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (dashboard)/              # Dashboard route group (protected)
│   │   │   ├── campaigns/[id]/       # Campaign workspace
│   │   │   ├── templates/            # Campaign templates
│   │   │   ├── restyling/            # Quick restyling tool
│   │   │   ├── settings/             # User & workspace settings
│   │   │   ├── layout.tsx            # Dashboard shell
│   │   │   └── page.tsx              # Dashboard home
│   │   ├── api/                      # API Routes
│   │   │   ├── auth/[...all]/        # Better Auth handler
│   │   │   ├── campaigns/            # Campaign API
│   │   │   ├── derivations/          # Derivation API
│   │   │   ├── billing/              # Billing & checkout
│   │   │   ├── client-profiles/      # Client reference library
│   │   │   ├── templates/            # Template API
│   │   │   ├── exports/              # Export API
│   │   │   ├── dashboard/            # Dashboard metrics
│   │   │   ├── inngest/              # Inngest webhook handler
│   │   │   ├── health/               # Health check
│   │   │   └── ...
│   │   ├── login/                    # Login page
│   │   ├── signup/                   # Signup page
│   │   ├── layout.tsx                # Root layout (i18n, providers)
│   │   └── globals.css               # Global styles
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # shadcn/ui primitives + custom UI
│   │   ├── campaigns/                # Campaign list & creation
│   │   ├── workspace/                # Campaign workspace (briefing, plan, derivations, review)
│   │   ├── templates/                # Template cards & modals
│   │   ├── restyling/                # Restyling upload & form
│   │   ├── settings/                 # Settings tabs (profile, billing, workspace, team)
│   │   ├── auth/                     # Auth UI components
│   │   ├── layout/                   # AppShell, Sidebar, TopBar, Footer
│   │   └── providers/                # React context providers
│   │
│   ├── server/                       # Server-only code
│   │   ├── auth/                     # Auth config, session, workspace access
│   │   ├── db/                       # Drizzle schema & database client
│   │   ├── repositories/             # Data access layer (per domain)
│   │   ├── services/                 # Business services (email, export, landing page render)
│   │   ├── ai/                       # AI prompt builders & analyzers
│   │   ├── billing/                  # Stripe integration, credit gates, plans
│   │   ├── jobs/                     # Inngest job definitions
│   │   ├── storage/                  # R2 / S3 storage operations
│   │   └── validation/               # Environment variable validation (Zod)
│   │
│   ├── lib/                          # Shared client utilities
│   │   ├── hooks/                    # TanStack Query custom hooks
│   │   ├── api-client.ts             # Authenticated fetch wrapper
│   │   ├── api-response.ts           # API response helpers
│   │   ├── auth-client.ts            # Better Auth client
│   │   ├── store.ts                  # Zustand app store
│   │   ├── utils.ts                  # General utilities
│   │   └── ...
│   │
│   └── i18n/                         # i18n configuration
│       └── config.ts                 # Locale definitions
│
├── drizzle/                          # Database migrations
│   ├── 0000_*.sql                    # Initial schema
│   ├── 0001_*.sql                    # Schema evolutions
│   └── meta/                         # Migration metadata
│
├── messages/                         # Translation files
│   ├── pt-BR.json                    # Brazilian Portuguese
│   └── en.json                       # English
│
├── config/                           # Tool configurations
│   └── vitest.config.ts              # Vitest configuration
│
├── tests/                            # Test setup
│   └── setup.ts                      # jest-dom imports
│
├── docker/                           # Docker resources
│   ├── postgres/init.sql             # Local Postgres init
│   └── entrypoint.sh                 # Container entrypoint
│
├── scripts/                          # Development scripts
│   └── dev-with-inngest.mjs          # Dev server + Inngest CLI
│
└── package.json
```

---

## Frontend Architecture

### Routing

The application uses **Next.js 15 App Router** with the following route groups:

| Route Group | Purpose | Auth |
|------------|---------|------|
| `(dashboard)/` | Protected SaaS application | Required |
| `login/`, `signup/` | Authentication pages | Public |
| `api/` | Backend API endpoints | Varies |

### Component Architecture

- **Server Components** by default — used for layouts, pages, and data-fetching surfaces
- **Client Components** (`"use client"`) — used for interactive UI, forms, modals, and hooks
- **shadcn/ui primitives** — Base components (Button, Dialog, Input, Select, etc.) built on Radix UI
- **Domain components** — Organized by feature (campaigns, workspace, settings, templates)

### Key Frontend Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| AppShell | `components/layout/AppShell.tsx` | Dashboard layout with sidebar + top bar |
| Campaign Workspace | `components/workspace/` | 5-step campaign workflow: Briefing → Upload → Plan → Derivations → Review |
| Settings | `components/settings/` | Tabs for Profile, Workspace, Billing, Plans, Team, Integrations |
| UI Primitives | `components/ui/` | Buttons, cards, badges, tables, forms, modals, toasts |

---

## Backend Architecture

### API Route Organization

API routes follow a **domain-driven** structure under `src/app/api/`:

```
api/
├── auth/[...all]              # Better Auth catch-all (login, logout, session, verification)
├── campaigns/                 # Campaign CRUD + sub-resources
│   ├── [id]/
│   │   ├── derivations/       # List/create derivations for campaign
│   │   ├── plan/              # Creative plan generation
│   │   ├── assets/            # Asset upload (presign + complete)
│   │   ├── diagnosis/         # Creative diagnosis
│   │   └── ...
├── derivations/[id]/          # Derivation operations
│   ├── regenerate/            # Regenerate a derivation
│   ├── review/                # Save review/feedback
│   ├── qa/                    # Creative QA analysis
│   ├── landing-page/          # Landing page generation
│   ├── delivery-package/      # Export delivery package
│   └── save-reference/        # Save to client reference library
├── client-profiles/[id]/      # Client profiles & references
├── templates/[id]/            # Campaign templates
├── billing/                   # Stripe integration
│   ├── checkout/              # Create checkout session
│   ├── portal/                # Customer portal
│   ├── status/                # Subscription status
│   └── webhook/               # Stripe webhook handler
├── exports/                   # Asset exports
├── dashboard/                 # Dashboard metrics
├── user/locale/               # User locale preference
├── inngest/                   # Inngest event ingestion endpoint
└── health/                    # Health check
```

### Server Module Organization

| Module | Path | Responsibility |
|--------|------|----------------|
| **Repositories** | `server/repositories/` | Data access layer — one file per domain entity. Encapsulates all Drizzle queries. |
| **Services** | `server/services/` | Business logic orchestration (email, export generation, landing page HTML rendering) |
| **AI Layer** | `server/ai/` | Prompt engineering, creative scoring, diagnosis, QA, image analysis, landing page generation |
| **Billing** | `server/billing/` | Stripe client, plan definitions, credit accounting, usage gates, webhook event processing |
| **Jobs** | `server/jobs/` | Inngest job definitions (derivation generation pipeline) |
| **Storage** | `server/storage/r2.ts` | Cloudflare R2 operations (upload, download, presigned URLs, public URLs) |
| **Validation** | `server/validation/env.ts` | Runtime environment variable validation with Zod |

---

## Data Layer

### Database Schema

The PostgreSQL schema uses a single schema namespace (`adscale_app`) and is organized into the following domains:

#### Authentication (Better Auth)
- `user` — User accounts with locale preference
- `session` — Active sessions with expiry
- `account` — OAuth/account linking (reserved)
- `verification` — Email verification tokens

#### Workspace
- `workspaces` — Tenant isolation boundary
- `workspace_members` — User-workspace memberships with roles (`owner`, `member`)

#### Campaign Domain
- `campaigns` — Campaign briefs with generation config (mode, level, style, diagnosis)
- `campaign_templates` — Reusable campaign templates
- `campaign_assets` — Uploaded reference images (stored in R2, metadata in DB)
- `pending_uploads` — Track multipart upload lifecycle
- `creative_plans` — AI-generated creative strategy (angles, hooks, CTAs)
- `derivations` — Generated image outputs with scoring & QA metadata

#### Client Reference Library
- `client_profiles` — Client brand profiles
- `client_references` — Visual reference assets per client (style, product, layout, logo, negative)

#### Billing
- `billing_customers` — Stripe customer mapping per workspace
- `subscriptions` — Stripe subscription status and plan mapping
- `credit_grants` — Credit allocation tracking (granted, remaining, expiry)
- `processed_stripe_events` — Idempotent webhook processing

#### Analytics & Export
- `usage_events` — Metered usage with idempotency keys
- `activity_events` — User activity audit log
- `exports` — Exported asset records
- `landing_pages` — Generated landing pages (structure + HTML)

### ORM & Migrations

- **Drizzle ORM** with `node-postgres` connection pool
- Schema defined in `server/db/schema.ts` using `pgSchema("adscale_app")`
- Migrations generated via `drizzle-kit generate` and applied via `drizzle-kit migrate`
- All tables use `uuid` primary keys with `crypto.randomUUID()` defaults
- Indexed foreign keys for query performance

---

## Authentication & Authorization

### Authentication

- **Better Auth** provides session-based authentication
- Email/password with required email verification
- Password reset via secure token links
- Sessions stored in PostgreSQL (Drizzle adapter)
- Cookie-based session tokens (`better-auth.session_token`)

### Authorization

- **Middleware** (`middleware.ts`) protects dashboard routes (`/`, `/campaigns/*`, `/settings/*`)
- **Workspace scoping** — every API route calls `requireWorkspaceAccess()` to resolve the user's workspace
- All data queries are filtered by `workspaceId` for multi-tenant isolation
- **Database hook** auto-creates a personal workspace on user signup

### Auth Flow

```
1. User signs up → Better Auth creates user record
2. Database hook triggers → Creates workspace + workspace_members (role: owner)
3. User logs in → Session cookie set
4. Middleware validates cookie on protected routes
5. API routes call requireWorkspaceAccess() → Returns { user, workspace }
6. All DB queries scoped to workspace.id
```

---

## Background Job Processing

### Inngest Setup

- **Inngest** handles durable background job execution
- Dev mode runs `inngest-cli dev` alongside Next.js dev server
- Production: Inngest calls `/api/inngest` webhook to invoke functions

### Derivation Generation Pipeline

The core background job is `derivationJob` (`server/jobs/derivation.ts`), which generates AI images:

```
Event: derivation.generate
│
├─ Step 1: check-idempotency          → Skip if already completed
├─ Step 2: mark-processing            → Set status = "processing"
├─ Step 3: fetch-context              → Load campaign, plan, assets, parent derivation
├─ Step 4: fetch-client-references    → Load selected visual references
├─ Step 5: generate-and-store-output  → Call OpenAI, normalize with Sharp, upload to R2
├─ Step 6: mark-completed             → Set status = "completed", refresh campaign status
├─ Step 7: score-derivation           → Heuristic + visual AI scoring
└─ Step 8: track-usage                → Record credit consumption
```

**Failure Handling:**
- Retries: 2 attempts
- `onFailure` hook: Marks derivation as `failed`, updates campaign status

**Generation Modes:**
- `art_variation` — Recompose reference into new creative variation
- `format_adaptation` — Adapt approved creative to different aspect ratio
- `restyling` — Apply style reference to base content image

---

## AI Layer

### Prompt Engineering

- `server/ai/prompt-builder.ts` — Comprehensive prompt builder for image generation
- Supports 4 creativity levels: `conservative`, `balanced`, `bold`, `extreme`
- 3 style intensities for restyling: `soft`, `medium`, `strong`
- Locale-aware prompts (pt-BR / en) with hard rules for CTA preservation

### Creative Analysis

| Module | Purpose |
|--------|---------|
| `creative-diagnosis.ts` | Analyze campaign asset to detect concept, preserve elements, identify variation opportunities |
| `creative-score.ts` | Heuristic + OpenAI vision-based scoring of generated derivations |
| `creative-qa.ts` | Automated quality assurance checklist (logo presence, text legibility, format compliance, etc.) |
| `image-analysis.ts` | Extract visual tokens (color palette, typography, composition, mood) from reference images |
| `landing-page.ts` | Generate structured landing page copy from campaign brief |

### Models

- **Image Generation:** `gpt-image-2-2026-04-21` (configurable via `OPENAI_IMAGE_MODEL`)
- **Text/Analysis:** `gpt-5-mini` (configurable via `OPENAI_TEXT_MODEL`)

---

## Billing & Subscriptions

### Stripe Integration

- **Subscriptions:** 3 tiers — `starter` (30 credits), `growth` (120 credits), `scale` (360 credits)
- **Checkout:** Stripe Checkout sessions for new subscriptions
- **Customer Portal:** Self-service billing management
- **Webhooks:** Idempotent processing of `checkout.session.completed`, `invoice.paid`, `subscription.updated`, etc.

### Credit System

- Credits granted on subscription creation/renewal
- `credit_grants` table tracks allocations with expiry
- `usage_events` records consumption with idempotency keys
- `spendCreditsOrApiError()` gate returns HTTP 402 when credits exhausted

### Plans

| Plan | Credits | Stripe Price ID env var |
|------|---------|------------------------|
| Starter | 30/mo | `STRIPE_STARTER_PRICE_ID` |
| Growth | 120/mo | `STRIPE_GROWTH_PRICE_ID` |
| Scale | 360/mo | `STRIPE_SCALE_PRICE_ID` |

---

## Storage

### Cloudflare R2

- S3-compatible object storage for all binary assets
- **Upload:** Presigned PUT URLs for direct browser-to-R2 uploads
- **Download:** Presigned GET URLs with 4-minute client-side caching
- **Server-side:** Direct `uploadBuffer` / `downloadBuffer` via AWS SDK
- **Public URLs:** Served via `R2_PUBLIC_BASE_URL` CDN

### Asset Organization

```
derivations/{derivationId}/{timestamp}.png
campaigns/{campaignId}/assets/{filename}
exports/{exportId}/{filename}
landing-pages/{landingPageId}/index.html
```

---

## API Design Patterns

### Request Handling

1. **Auth check** — `requireWorkspaceAccess(request)` validates session and resolves workspace
2. **Validation** — Zod schemas validate request bodies (`createCampaignSchema`, etc.)
3. **Business logic** — Repository functions perform database operations
4. **Response** — `NextResponse.json()` with consistent shape

### Error Handling

- `apiError(code, status, details?)` — Returns localized error messages via `next-intl`
- `handleApiError(error, context)` — Catches exceptions, logs with UUID, returns safe response
- Standard codes: `unauthorized`, `noWorkspace`, `invalidInput`, `internalError`

### Example API Route Structure

```typescript
export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = mySchema.safeParse(body);
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    
    const result = await repositoryAction(workspace.id, parsed.data);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "domain.POST");
  }
}
```

---

## State Management

### Server State (TanStack Query)

- All server data fetched via TanStack Query hooks in `lib/hooks/`
- Each domain has a dedicated hook file: `use-campaigns.ts`, `use-derivations.ts`, `use-billing.ts`, etc.
- Query keys follow pattern: `['domain', id?]` or `['domain', filters]`
- Mutations invalidate related queries on success
- Campaign detail page uses `refetchInterval` for live status updates during generation

### Client State (Zustand)

- `lib/store.ts` — Lightweight UI state only
- Persisted to `localStorage`: `sidebarCollapsed`
- Non-persisted: `toasts`, `currentPageTitle`, mock profile/billing data
- **Note:** Billing and profile data in Zustand are UI mock placeholders; real data comes from API

---

## Internationalization (i18n)

- **next-intl** with `next-intl/server` for RSC and API localization
- **Locales:** `pt-BR` (default), `en`
- **Resolution order:** Cookie (`locale`) → `Accept-Language` header → default (`pt-BR`)
- **Files:** `messages/pt-BR.json`, `messages/en.json`
- **API errors:** Localized via `getTranslations("errors")` in `api-response.ts`
- **AI prompts:** Locale-aware language instructions injected into OpenAI prompts

---

## Testing Strategy

| Type | Tool | Coverage |
|------|------|----------|
| Unit | Vitest | Repositories, AI utilities, billing logic |
| Component | Testing Library + jsdom | React components with hooks |
| Integration | Vitest | API route handlers, service logic |

### Configuration

- Vitest config: `config/vitest.config.ts`
- Test environment: `jsdom`
- Setup file: `tests/setup.ts` (imports `@testing-library/jest-dom`)
- Path alias: `@` → `src/`

### Tested Modules

- `server/repositories/` — Repository data access tests
- `server/ai/` — Prompt builder, creative QA, landing page tests
- `server/billing/` — Credit calculation, gates, event processing tests
- `server/jobs/` — Derivation job logic tests
- `lib/hooks/` — React hook tests with providers
- `components/workspace/` — Component interaction tests

---

## Deployment & Infrastructure

### Render Configuration (`render.yaml`)

```yaml
Web Service:
  - Runtime: Node
  - Build: npm ci && npm run build
  - Pre-deploy: npm run db:migrate
  - Start: npm start
  - Health check: /api/health

Database:
  - PostgreSQL 16 (Render managed)
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `BETTER_AUTH_SECRET` | Auth encryption |
| `BETTER_AUTH_URL` / `APP_URL` | App origin URLs |
| `OPENAI_API_KEY` | AI services |
| `R2_*` | Cloudflare R2 credentials |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Job queue |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email delivery |
| `STRIPE_*` | Payment processing |

### Docker

- `docker/postgres/init.sql` — Local development database setup
- `docker/entrypoint.sh` — Container initialization
- `scripts/dev-with-inngest.mjs` — Local dev orchestration

---

## Data Flow

### Campaign Creation Flow

```
User fills campaign brief (UI)
    │
    ▼
POST /api/campaigns
    │
    ▼
Zod validation + workspace auth
    │
    ▼
Repository: insert into campaigns
    │
    ▼
Return 201 → TanStack Query invalidates cache
    │
    ▼
User redirected to campaign workspace
```

### Derivation Generation Flow

```
User requests derivations (UI)
    │
    ▼
POST /api/campaigns/{id}/derivations
    │
    ▼
Credit gate check → 402 if insufficient
    │
    ▼
Repository: insert derivations (status: queued)
    │
    ▼
Inngest: send derivation.generate events
    │
    ▼
Inngest worker picks up job
    │
    ▼
Step pipeline: fetch context → generate image → upload R2 → score → track usage
    │
    ▼
Derivation status updated: queued → processing → completed|failed
    │
    ▼
UI polls/refetches campaign status every 2s while generating
```

### Asset Upload Flow

```
User selects file (UI)
    │
    ▼
GET /api/campaigns/{id}/assets/presign
    │
    ▼
Server creates pending_upload record + returns presigned R2 URL
    │
    ▼
Browser uploads directly to R2
    │
    ▼
POST /api/campaigns/{id}/assets/complete
    │
    ▼
Server verifies upload, inserts campaign_assets record
```

---

## Security Considerations

- **Session cookies** marked secure in production (`__Secure-better-auth.session_token`)
- **Trusted origins** enforced by Better Auth (configurable per environment)
- **Workspace isolation** — every query filtered by `workspaceId`
- **Zod validation** on all API inputs
- **Presigned URLs** expire in 5 minutes for direct uploads
- **Stripe webhooks** verified with `STRIPE_WEBHOOK_SECRET`
- **Idempotency** on usage events and Stripe webhook processing
- **Environment validation** via Zod proxy — fails fast on missing/invalid config
- **SQL injection prevention** via Drizzle ORM parameterized queries
- **XSS mitigation** via React's built-in escaping + `escapeHtml` in landing page renderer

---

*Document generated from codebase exploration. Last updated: 2026-05-22.*
