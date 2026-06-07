# Milestones: ADScale

## v11.10 Fechamento Entrega e Analytics (In Progress)

**Phases planned:** 5 phases (85→89)  
**Requirements:** 14 requirements

**Scope:**
- Cockpit instrumentation: recipe_tradeoff_viewed, recipe_selected, briefing step abandon, preview funnel false-abandon fix
- Readiness false-positive override workflow with auditable server-side event
- Owner dashboard polish: uncapped session timeline, credit consumption funnel, real session filter
- F-14 regression test fix and full CI green gate
- SESS-03 — ≥3 real operator sessions with learning answers updated from real data

---

## v11.9 UX de Entrega e Créditos (Shipped: 2026-06-07)

**Phases completed:** 5 phases (80→84)  
**Requirements:** 13/13 complete

**Key accomplishments:**

- Preview gate credit formula (`N × 5 = total`), balance display, and insufficient-credit block before batch
- `operation_key` + `creditDelta` on `credit_spend` / `credit_blocked` analytics events
- Approval package stale callout, refresh toast, and share-page recipient self-serve guide
- Owner dashboard: credit surprise ranking by operation, session stage timeline with gaps, CSV sections
- Full regression suite green (1000 tests)

**Archive:** [v11.9-ROADMAP.md](milestones/v11.9-ROADMAP.md) · [v11.9-REQUIREMENTS.md](milestones/v11.9-REQUIREMENTS.md) · [v11.9-MILESTONE-AUDIT.md](milestones/v11.9-MILESTONE-AUDIT.md) · [v11.9-phases/](milestones/v11.9-phases/)

---

## v11.8 Loop de Aprendizado Beta (Shipped: 2026-06-07)

**Phases completed:** 5 phases (75→79), 16 plans  
**Requirements:** 25/26 complete (SESS-03 operator UAT pending)

**Key accomplishments:**

- First-party beta analytics layer (`beta_analytics_events`, `beta_sessions`) with PII-safe ingest API
- Cockpit and mission instrumentation (server + client) with session grouping via `useRecordBetaEvent`
- Operator beta session APIs and `BetaSessionsPanel` on `/feedback` with runbook-stage notes
- Owner funnel analytics, credit surprise signals, readiness overrides, and CSV export
- Five evidence-driven friction fixes (F-01..F-05) with regression tests and v11.9 backlog

### Known Gaps

- **SESS-03:** ≥3 real operator sessions not yet logged in `77-SESSION-ARTIFACTS.md`
- **Migration:** Apply `0033_beta_analytics.sql` on staging/prod (`cd app && npm run db:migrate`)
- **Live DB smoke:** Confirm events land in `beta_analytics_events` with real `session_id` (Phase 76 human gate)
- **Learning docs:** Fixture-backed sections in `78-LEARNING-ANSWERS-DRAFT.md` / `79-LEARNING-ANSWERS.md` await real session data

**Archive:** [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-MILESTONE-AUDIT.md](milestones/v11.8-MILESTONE-AUDIT.md) · [v11.8-phases/](milestones/v11.8-phases/)

---

## v11.7 Ads Scientist Progression (Shipped: 2026-06-06)

**Phases completed:** 4 phases (68→71), 8 plans  
**Requirements:** 24/24 complete

**Key accomplishments:**

- Ads Scientist status ladder (Jovem Aprendiz → Cientista de Ads) from real workspace actions
- 11-step guided mission path with deep-link CTAs and learning copy
- Mission-linked insight capture with owner triage and sanitization
- Credit cost and balance on generation missions; gated upgrade prompts after value moments
- Owner healthy-vs-frustration credit signals on feedback triage
- 32-test QA matrix + UAT evidence for progression to Analista Criativo

**Archive:** Phases 68-71 in `.planning/phases/` · Verification: `71-VERIFICATION.md` · UAT: `71-UAT-EVIDENCE.md`

---

## v11.6.1 Ship Readiness and Beta Activation (Shipped: 2026-06-06)

**Phases completed:** 2 phases (66→67), 3 plans
**Requirements:** 8/8 complete

**Key accomplishments:**

- Production/staging cockpit smoke evidence and release readiness checks
- Deploy, health, environment, and migration readiness evidence
- Post-review fixes for recipe selection, preflight rerun billing, and approval-package refresh
- v11.6 milestone archive with audit caveats resolved or carried forward
- Beta operator runbook, feedback-stage mapping, and v11.7 learning questions

**Runbook:** [67-BETA-RUNBOOK.md](phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md) · [67-LEARNING-QUESTIONS.md](phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md)

---

## v11.6 Creative Strategy Cockpit (Shipped: 2026-06-06)

**Phases completed:** 5 phases (61→65), 10 plans
**Requirements:** 26/26 complete

**Key accomplishments:**

- Creative Readiness Score with six dimensions, blocking issues above suggestions, and rerun after brief/asset changes
- Guided briefing one question at a time with accept/edit/skip and draft persistence into the campaign form
- Strategy recipes (Safe Iteration, Performance Push, Visual Differentiation) with readiness-aware ranking and tradeoff copy
- Preview gate before batch generation with visible credit impact and shared quality gate
- Client approval package with share links, signed assets, stale detection, and refresh after rejection/regeneration
- 69-test cockpit matrix, milestone audit, beta handoff, and production browser smoke (CQA-02)

**Archive:** [v11.6-ROADMAP.md](milestones/v11.6-ROADMAP.md) · [v11.6-REQUIREMENTS.md](milestones/v11.6-REQUIREMENTS.md) · [v11.6-MILESTONE-AUDIT.md](milestones/v11.6-MILESTONE-AUDIT.md) · [v11.6-phases/](milestones/v11.6-phases/)

**Release ref:** `ba535de` on Render (includes approval-package regen refresh fixes)

---

## v11.5 Qualidade IA Orientada por Feedback (Shipped: 2026-06-05)

**Phases completed:** 4 phases (57→60), 12 plans, 34 tasks
**Requirements:** 20/20 complete

**Key accomplishments:**

- Durable JSONB contract/provenance on derivations with workspace-scoped repository persistence and derivation-job wiring before prompt build
- Compact prompt regression tests with shared CreativeContract fixtures and section snapshots for art variation, format adaptation, and restyling hard rules
- Shared quality taxonomy with fail-safe score/QA normalization — no silent 70 defaults on malformed model JSON.
- Inherited CTA and score-issue promotion close gate gaps; review UI shows localized blocking titles with model notes as detail.
- Single server module merges gate, score, QA, and feedback-category inputs into bounded correction briefs with contract-safe preservation tails.
- Regenerate API builds merged correction briefs, persists structured brief JSON on children, and keeps parent creative contracts through the derivation job.
- Users see a read-only summary of blocking and advisory issues before editing regeneration feedback, with EN/PT-BR labels.
- Route and unit tests cover explicit feedback merge, quality-field brief reconstruction, feedback category context, and child brief persistence.
- Six-fixture synthetic catalog covering wrong CTA, crop, style contamination, format layout, preservation loss, and legibility failures
- Fixture-linked prompt regression with mode invariants and compact section snapshots for art variation, format adaptation, and restyling
- Parameterized fixture pipeline tests wiring QA normalization, hard-failure gate, verdict derivation, and regeneration brief assembly
- Manual quality loop handoff, residual model limitations, and nyquist-compliant validation contract with green test/lint/build gate

**Archive:** [v11.5-ROADMAP.md](milestones/v11.5-ROADMAP.md) · [v11.5-REQUIREMENTS.md](milestones/v11.5-REQUIREMENTS.md) · [v11.5-MILESTONE-AUDIT.md](milestones/v11.5-MILESTONE-AUDIT.md) · [v11.5-phases/](milestones/v11.5-phases/)

**Release refs:** tag `v11.5.1` (includes migration journal fix `0027_fine_morlun`); tag `v11.5` is milestone-only and omits that fix.

**Known gaps (accepted tech debt):** Render/production must deploy `main` @ `v11.5.1` or later (`preDeployCommand` runs `db:migrate`); optional manual quality loop spot-check per 60-HANDOFF; phases 58–59 lack formal Nyquist VALIDATION.md. Audit status `tech_debt` (not `passed`) — cleared completion with accepted debt.

---

## v11.4 Beta Feedback Capture (Shipped: 2026-06-05)

**Phases completed:** 4 phases (53→56), 4 plans
**Requirements:** 23/23 complete

**Key accomplishments:**

- Durable `feedback_reports` model with workspace-scoped create API and diagnostic sanitization
- In-app feedback from shell, campaign header, and derivation review with auto context capture
- Platform owner triage at `/feedback` with filters, completeness chips, signed assets, and private notes
- Privacy handoff documenting captured vs excluded fields and end-to-end analysis workflow

**Archive:** [v11.4-ROADMAP.md](milestones/v11.4-ROADMAP.md) · [v11.4-REQUIREMENTS.md](milestones/v11.4-REQUIREMENTS.md)

**Known gaps:** No formal milestone audit; QA-02 browser/mobile smoke left as manual ops follow-up.

---

## v11.3 Site de Apresentação Separado (Shipped: 2026-06-03)

**Phases completed:** 3 phases (50→52), 3 plans
**Requirements:** 14/14 complete

**Key accomplishments:**

- Public presentation surface moved into `jhowtkd/site-adscale.git`
- Marketing/app boundary documented so ADScale_2 stays focused on auth, legal, dashboard and product routes
- Presentation copy, CTAs, pricing/beta language and legal links aligned with current app behavior
- Target site build and deploy handoff documented with responsive smoke checks and residual risks

---

## v11.2 Beta Access and Credit Entitlements (Shipped: 2026-06-03)

**Phases completed:** 1 phase (49), 1 plan
**Requirements:** 5/5 complete

**Key accomplishments:**

- Workspace beta entitlements separate from Stripe subscriptions
- Beta testers receive 10 generated ads through 50 internal credits
- Spend gates allow active paid subscription or active beta entitlement with credits
- Billing/settings UI distinguishes beta access from paid access
- Beta codes configured through `BETA_ACCESS_CODES`

---

## v11.1 Qualidade de Geração e Contratos Criativos (Shipped: 2026-06-01)

**Phases completed:** 5 phases (44→48), multiple plans
**Requirements:** 26/26 complete

**Key accomplishments:**

- Native 4:5 and 9:16 format adaptation planning and verification
- Shared creative contract for generation, scoring, QA, and regeneration
- Restyling uses selected style references as visual language only
- Hard quality gates separate blocking failures from polish suggestions
- Workspace review/error feedback exposes contract and failure context

---

## v11.0 Fluxos de Derivação Coerentes (Shipped: 2026-06-01)

**Phases completed:** 4 phases (40→43), 4 plans
**Requirements:** 10/10 complete

**Key accomplishments:**

- `useDerivationFlow` state machine — Derivar chooser no longer auto-queues generation with hardcoded defaults
- Art variation config modals (manual + AI-assisted) with creativity profile and up to 3 CTAs before confirm
- `useArtVariationSuggestions` pre-fills CTAs from campaign context or analyze API on base asset
- Format adaptation pickers: single-select and batch multi-select (1:1, 4:5, 9:16) with API PATCH allowing 1–3 formats
- PT-BR/EN `workspace.derivar` copy aligned to behavior; fixed "Variir" → "Variar tamanhos"
- 12+ new tests covering all four Derivar paths; Estilizar regression guard via ActionCards

**Archive:** [v11.0-ROADMAP.md](milestones/v11.0-ROADMAP.md) · [v11.0-REQUIREMENTS.md](milestones/v11.0-REQUIREMENTS.md)

---

## v6.0 Performance & Otimização (Shipped: 2026-05-27)

**Phases completed:** 4 phases (22→25), 4 plans
**Requirements:** 12/12 complete

**Key accomplishments:**

- Code splitting e lazy loading com next/dynamic — bundle reduzido de ~2.9MB para 2.39MB
- TanStack Query otimizado com staleTime presets (STATIC/SEMI_STATIC/DYNAMIC) e prefetch on hover
- Cache de análise visual da IA por 24h (evita re-computação de análises)
- Redimensionamento automático de imagens >5MB para 1024px antes do upload
- Componente OptimizedImage com skeleton loading e lazy loading
- Remoção de 7 dependências não utilizadas (~171 packages removidos)
- VirtualList para listas grandes (>20 itens) com @tanstack/react-virtual
- Resource hints (preconnect/dns-prefetch) para R2 CDN melhorando FCP

---

## v5.0 Simplificação do Fluxo de Criação de Campanha (Shipped: 2026-05-26)

**Phases completed:** 4 phases, 4 plans
**Requirements:** 12/12 complete

**Key accomplishments:**

- Single-page campaign creation form (name, client, profile)
- AI visual analysis of key creative with deduced fields
- Editable auto-filled campaign information
- Generation mode with creativity profile and CTA suggestions
- Briefing Doctor completely removed

---

## Completed Milestones

### v2.0 — Internacionalização PT-BR

**Completed:** 2026-04-24
**Phases:** 4 (6→9)
**Requirements:** 21/21

**Delivered:**

- `next-intl` integration with PT-BR/EN language support
- Language switcher in TopBar with cookie persistence
- `user.locale` column in database with default `pt-BR`
- Middleware locale detection (cookie → browser → default)
- API route `POST /api/user/locale` for persistence
- Full UI translation: Sidebar, TopBar, AppShell, StepIndicator, BriefingStep, PlanStep, DerivationsStep, DerivationCard, StatusBadge, Auth pages
- AI prompt localization: `buildPlanPrompt` and `buildDerivationPrompt` accept locale parameter
- OpenAI outputs in Brazilian Portuguese when `locale=pt-BR`
- Inngest events carry locale through the derivation pipeline
- Build and tests clean

### v1.0 — Sair Do Mock → MVP Real

**Completed:** 2026-04-24
**Phases:** 5
**Requirements:** 32/32

**Delivered:**

- Full server layer with Drizzle ORM, Neon PostgreSQL
- Better Auth with open signup and auto-workspace creation
- Cloudflare R2 storage with presigned URLs
- Inngest durable jobs for image derivation
- Campaign CRUD with structured brief
- Presigned upload flow for PNG/JPEG/WebP (up to 20MB)
- AI creative plan generation with OpenAI (`gpt-5-mini`)
- Image derivation with OpenAI (`gpt-image-2-2026-04-21`)
- Review gallery with approve/reject/regenerate
- Export pipeline (individual + ZIP, format conversion with sharp)
- Dashboard with real metrics
- 57 unit and integration tests
- Workspace isolation on all API routes
