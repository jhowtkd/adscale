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
- ✓ **I18N-01**: User can switch between PT-BR and EN via language switcher — v2.0
- ✓ **I18N-02**: All UI labels, buttons, navigation translated — v2.0
- ✓ **I18N-03**: Form validation errors localized — v2.0
- ✓ **I18N-04**: API error responses include localized messages — v2.0
- ✓ **I18N-05**: Toast notifications and empty states use translated copy — v2.0
- ✓ **I18N-06**: Date, number, currency formatting use PT-BR locale — v2.0
- ✓ **LANG-01**: User language preference stored in database — v2.0
- ✓ **LANG-02**: Cookie stores active language for SSR/initial render — v2.0
- ✓ **LANG-03**: Browser language detection sets default on first visit — v2.0
- ✓ **LANG-04**: Language preference persists across logout/login — v2.0
- ✓ **LANG-05**: Unauthenticated visitors see PT-BR by default — v2.0
- ✓ **AI-PT-01**: Creative plan generation outputs in PT-BR when selected — v2.0
- ✓ **AI-PT-02**: Derivation generation prompt uses PT-BR when selected — v2.0
- ✓ **AI-PT-03**: Regeneration feedback preserves language for revised outputs — v2.0
- ✓ **AI-PT-04**: Campaign brief field labels adapt to active language — v2.0
- ✓ **AI-PT-05**: Plan preview and derivation cards display AI-generated text in produced language — v2.0
- ✓ **TECH-01**: i18n library integrated (next-intl) — v2.0
- ✓ **TECH-02**: Translation keys organized by feature/domain — v2.0
- ✓ **TECH-03**: SSR renders correct lang attribute without hydration mismatch — v2.0
- ✓ **TECH-04**: Language context available in API routes — v2.0
- ✓ **TECH-05**: Prompt builder accepts language parameter — v2.0

### Active

(None — all v2.0 requirements shipped; v3.0 requirements implemented in phases 10–14)

### Out of Scope

- Real billing/subscription processing — MVP uses simple usage/credits tracking only
- Direct Meta/TikTok/Google Ads export/integration — stubbed for future milestone
- Slack integration — out of MVP
- API key management UI — out of MVP
- OAuth login (Google/GitHub) — email/password sufficient for v1
- Real-time notifications — polling sufficient for MVP
- Admin panel — single workspace model for MVP
- LGPD compliance — separate milestone
- Multi-format cross-combination (CTA × format) — out of v3.0 scope
- Format adaptation beyond 1:1, 4:5, 9:16 — future milestone
- AI-generated copy suggestions for CTAs — requires content model fine-tuning
- Bulk CTA import from spreadsheet/CSV — future UX improvement

## Context

Current state: v3.0 implementation complete (phases 10–14). ADScale now operates as a campaign derivation system with two modes: `Variar arte` (art variation) and `Variar formato` (format adaptation). Per-piece CTAs, explicit visual fidelity rules in prompts, sharp-based output normalization, and mode-aware gallery labels are all implemented. Build passes and 67 tests are green. Pending manual validation with `oficial.jpg` before milestone sign-off.

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
- **Timeline**: v2.0 i18n complete in 4 phases. Ready for v3 planning.
- **Language model behavior**: Plan and derivation prompts include the target language instruction. No silent fallback to English.

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

## Current Milestone: v3.0 Modos de Derivação Fiel

**Goal:** Reposition ADScale as a campaign derivation system. Support two clear derivation modes — `Variar arte` and `Variar formato` — with per-piece CTAs, explicit visual fidelity rules, and less repetitive generation.

**Target features:**
- Mode selection at campaign creation: `Variar arte` or `Variar formato`
- Art variation generates new versions in the same format as the base creative
- Format adaptation resizes to 1:1, 4:5, and 9:16
- Per-piece CTAs with mode-specific validation rules
- Strong prompt differentiation between art variation and format adaptation
- Sharp-based output normalization for all formats
- Gallery labels and cards reflect mode, format, and applied CTA
- Clean error messages instead of raw JSON in the UI
- Backward compatibility for existing campaigns (fallback to `Variar arte`)

**Status:** Implemented across phases 10–14. Build passes, 67 tests green. Manual QA pending with `oficial.jpg`.

---
*Last updated: 2026-04-28 after implementing phases 10–14*
