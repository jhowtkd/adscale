# ADScale

## What This Is

ADScale is a SaaS webapp for creative derivation: marketing teams upload a base creative, fill a campaign brief, receive an AI-generated creative plan, and generate image derivations that maintain visual consistency — then review and export for Meta/TikTok/Google Ads.

## Core Value

Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Requirements

### Validated

- ✓ **AUTH-01**: User can sign up with email and password via Better Auth — v1.0
- ✓ **AUTH-02**: First signup automatically creates an initial workspace — v1.0
- ✓ **AUTH-03**: User session persists across browser refresh — v1.0
- ✓ **AUTH-04**: Dashboard, campaigns and settings require active session — v1.0
- ✓ **WORK-01**: Workspace membership controls access to all data — v1.0
- ✓ **WORK-02**: No workspace ID can access data from another workspace — v1.0
- ✓ **CAMP-01**: User can create a campaign with structured brief — v1.0
- ✓ **CAMP-02**: User can list, view, update and delete campaigns — v1.0
- ✓ **CAMP-03**: Campaign status lifecycle — v1.0
- ✓ **UPLOAD-01**: User can request a presigned URL and upload directly to R2 — v1.0
- ✓ **UPLOAD-02**: After upload, API confirms and saves asset metadata — v1.0
- ✓ **UPLOAD-03**: Asset is linked to a campaign and workspace — v1.0
- ✓ **PLAN-01**: API builds prompt and calls OpenAI text model — v1.0
- ✓ **PLAN-02**: OpenAI returns structured JSON validated by Zod — v1.0
- ✓ **PLAN-03**: User can view and approve/reject the generated plan — v1.0
- ✓ **DERIV-01**: On plan approval, API creates derivations and emits Inngest events — v1.0
- ✓ **DERIV-02**: Inngest handler downloads input, calls OpenAI image model, stores output — v1.0
- ✓ **DERIV-03**: Derivation status lifecycle — v1.0
- ✓ **DERIV-04**: UI polls via TanStack Query until final status — v1.0
- ✓ **DERIV-05**: Failed derivations show clear error and allow retry — v1.0
- ✓ **REVIEW-01**: User can approve or reject individual derivations — v1.0
- ✓ **REVIEW-02**: User can regenerate a derivation with feedback linked to previous — v1.0
- ✓ **REVIEW-03**: Derivations display in a gallery with preview and compare view — v1.0
- ✓ **EXPORT-01**: User can export individual derivation via signed URL — v1.0
- ✓ **EXPORT-02**: User can export all approved derivations as ZIP — v1.0
- ✓ **EXPORT-03**: Format conversion uses sharp when needed — v1.0
- ✓ **DASH-01**: Dashboard shows real campaign and usage metrics — v1.0
- ✓ **DASH-02**: Loading/error/empty states replace simulated delays — v1.0
- ✓ **SEC-01**: All API routes validate workspace membership — v1.0
- ✓ **SEC-02**: Environment variables validated with Zod at startup — v1.0
- ✓ **SEC-03**: API keys and secrets are server-side only — v1.0
- ✓ **TEST-01**: Unit tests for env validation, schemas, repositories, prompt parser, R2 keys — v1.0
- ✓ **TEST-02**: Integration tests for signup→workspace, CRUD, upload, plan, job, review/export — v1.0
- ✓ **TEST-03**: npm test, lint, build pass — v1.0

### Active

- **I18N-01**: User can switch between PT-BR and EN via language switcher — v2.0
- **I18N-02**: All UI labels, buttons, and messages are translated based on selected language — v2.0
- **I18N-03**: AI-generated creative plans are produced in the user's selected language — v2.0
- **I18N-04**: Derivation prompts and outputs respect the campaign's language setting — v2.0
- **I18N-05**: User language preference is persisted (DB + cookie) across sessions — v2.0
- **I18N-06**: Browser language detection sets default on first visit — v2.0
- **I18N-07**: Validation errors and API messages are localized — v2.0

### Out of Scope

- Real billing/subscription processing — MVP uses simple usage/credits tracking only
- Direct Meta/TikTok/Google Ads export/integration — stubbed for future milestone
- Slack integration — out of MVP
- API key management UI — out of MVP
- OAuth login (Google/GitHub) — email/password sufficient for v1
- Real-time notifications — polling sufficient for MVP
- Admin panel — single workspace model for MVP

## Context

Current state: v1.0 MVP is live with real backend (Drizzle, Neon, Better Auth, Inngest, OpenAI, R2). Next milestone targets public launch in Brazil — full i18n with PT-BR as primary language, English as secondary. All AI-generated outputs (plans, derivations) must adapt to user's language preference.

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
- **Timeline**: i18n milestone must fit in 4-5 phases. PT-BR is the launch language; EN is secondary for future expansion.
- **Language model behavior**: Plan and derivation prompts must include the target language instruction. No silent fallback to English.

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

## Current Milestone: v2.0 Internacionalização PT-BR

**Goal:** Prepare ADScale for public launch in Brazil by localizing the entire platform and adapting AI outputs to Portuguese.

**Target features:**
- Language switcher (PT-BR / EN) with persistent preference
- Full UI translation coverage (labels, buttons, validation, errors)
- AI plan generation in Portuguese when PT-BR is selected
- Derivation prompts and image context in Portuguese when PT-BR is selected
- Browser language detection for first-time users
- Localized API error messages

---
*Last updated: 2026-04-24 after starting milestone v2.0*
