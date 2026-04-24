# ADScale

## What This Is

ADScale is a SaaS webapp for creative derivation: marketing teams upload a base creative, fill a campaign brief, receive an AI-generated creative plan, and generate image derivations that maintain visual consistency — then review and export for Meta/TikTok/Google Ads.

## Core Value

Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **AUTH-01**: User can sign up with email and password via Better Auth
- [ ] **AUTH-02**: First signup automatically creates an initial workspace
- [ ] **AUTH-03**: User session persists across browser refresh
- [ ] **AUTH-04**: Dashboard, campaigns and settings require active session
- [ ] **WORK-01**: Workspace membership controls access to all data
- [ ] **WORK-02**: No workspace ID can access data from another workspace
- [ ] **CAMP-01**: User can create a campaign with structured brief (name, client/product, objective, audience, platforms, tone, offer, constraints, notes)
- [ ] **CAMP-02**: User can list, view, update and delete campaigns
- [ ] **CAMP-03**: Campaign status lifecycle: `draft | active | generating | completed | failed`
- [ ] **UPLOAD-01**: User can request a presigned URL and upload PNG/JPEG/WebP up to 20MB directly to R2
- [ ] **UPLOAD-02**: After upload, API confirms and saves asset with UUID key, type, size and dimensions
- [ ] **UPLOAD-03**: Asset is linked to a campaign and workspace
- [ ] **PLAN-01**: API builds prompt from brief + asset metadata and calls OpenAI text model
- [ ] **PLAN-02**: OpenAI returns structured JSON (strategy, angles, hooks, CTAs) validated by Zod before saving
- [ ] **PLAN-03**: User can view and approve/reject the generated plan
- [ ] **DERIV-01**: On plan approval, API creates N derivations with status `queued`, estimates/discounts credits, emits Inngest event per derivation
- [ ] **DERIV-02**: Inngest handler downloads input from R2, calls OpenAI image model, stores output back to R2, saves metadata in DB
- [ ] **DERIV-03**: Derivation status lifecycle: `queued | processing | completed | approved | rejected | failed`
- [ ] **DERIV-04**: UI polls via TanStack Query until derivation reaches final status
- [ ] **DERIV-05**: Failed derivations show clear error and allow retry
- [ ] **REVIEW-01**: User can approve or reject individual derivations
- [ ] **REVIEW-02**: User can regenerate a derivation with feedback linked to the previous one
- [ ] **REVIEW-03**: Derivations display in a gallery with preview and compare view
- [ ] **EXPORT-01**: User can export an individual derivation as PNG/JPEG/WebP via signed URL
- [ ] **EXPORT-02**: User can export all approved derivations as a ZIP generated with jszip
- [ ] **EXPORT-03**: Format conversion uses sharp when chosen format differs from stored format
- [ ] **DASH-01**: Dashboard shows real campaign and usage metrics from API
- [ ] **DASH-02**: Loading/error/empty states replace simulated delays
- [ ] **SEC-01**: All API routes validate workspace membership before serving data
- [ ] **SEC-02**: Environment variables validated with Zod at startup
- [ ] **SEC-03**: API keys and secrets are server-side only
- [ ] **TEST-01**: Unit tests for env validation, Zod schemas, repositories with mocks, prompt parser, R2 key sanitization
- [ ] **TEST-02**: Integration tests with mocks for signup→workspace, campaign CRUD, upload flow, plan generation, derivation job, review/export with auth
- [ ] **TEST-03**: `npm test`, `npm run lint`, `npm run build` and security scan pass

### Out of Scope

- Real billing/subscription processing — MVP uses simple usage/credits tracking only
- Direct Meta/TikTok/Google Ads export/integration — stubbed for future milestone
- Slack integration — out of MVP
- API key management UI — out of MVP
- OAuth login (Google/GitHub) — email/password sufficient for v1
- Real-time notifications — polling sufficient for MVP
- Admin panel — single workspace model for MVP

## Context

Current state: frontend experience exists in `app/` but runtime behavior is mock/client-side. Next milestone must replace the mock path with a real SaaS backend while preserving the current product flow.

Key stack decisions:
- Next.js App Router, React, TypeScript, Tailwind, shadcn/ui
- TanStack Query for server state; Zustand only for local UI state (sidebar, title, toasts)
- Neon PostgreSQL with Drizzle ORM
- Better Auth with open signup
- Cloudflare R2 for assets and generated images
- Inngest for durable generation jobs
- OpenAI for plan generation (`gpt-5-mini`) and image derivation (`gpt-image-2-2026-04-21`)
- Deploy on Vercel

## Constraints

- **Tech stack**: Stack chosen in `plan.md` is locked. No migration debates.
- **Image model**: `OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21`. No silent fallback. If API rejects, show clear config error.
- **Security**: Do not hardcode API keys. Do not commit `.env`. Validate input, file type, size and workspace access at boundaries.
- **Timeline**: MVP scope must fit in 5 phases. Billing and external integrations are stubbed.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Better Auth + open signup | Fastest path to auth without OAuth complexity | — Pending |
| Zustand → UI-only | Prevents stale business data in client stores | — Pending |
| Inngest for derivation jobs | Durable, retryable, observable without managing workers | — Pending |
| R2 for all file storage | S3-compatible, cost-effective, presigned URLs keep load off Vercel | — Pending |
| OpenAI image model configurable | Future-proof if model name changes | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-24 after starting milestone v1.0*
