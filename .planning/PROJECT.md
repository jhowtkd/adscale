# ADScale

## What This Is

ADScale is a SaaS webapp for creative derivation: marketing teams upload a base creative, fill a campaign brief, receive an AI-generated creative plan, and generate image derivations that maintain visual consistency — then review and export for Meta/TikTok/Google Ads.

## Core Value

Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Current Milestone: v12.0 Monetização Real

**Goal:** Levar o billing Stripe existente a produção — checkout, trial, renovação de créditos, dunning e conversão beta→pago — sem quebrar o caminho beta para cohorts convidados.

**Target features:**
- Go-live Stripe (prod keys, webhook, checklist, smoke de checkout real)
- Ciclo de assinatura completo: trial 14d, `invoice.paid` → credit grant, `past_due` → bloqueio de spend com UX de portal
- Conversão in-product: paywalls nos bloqueios 402 (preview, batch, créditos zerados) com CTA para checkout
- Billing UI: status claro (trial/active/past_due/beta), portal, histórico de grants/faturas
- Beta codes mantidos em paralelo para testers/parceiros
- Regressão: webhooks, access gates, fluxos TestSprite billing

**Parallel track:** SESS-03 fechado em 2026-06-11 com 3 sessões reais (466ef707, 89669961, f32d2ba1). Falta apenas Phase 94 (learning closure + threshold tune) no v11.11.

### v11.11 Aprendizado → Ação — IN PROGRESS (86%)

Phases 90–93 e 95–96 complete; Phase 94 unblocked (real session data available).

### v11.10 Fechamento Entrega e Analytics — COMPLETE (2026-06-11)

Phases 85–89 complete; SESS-03 evidence in `89-SESS-03-EVIDENCE.md`.

### v11.9 UX de Entrega e Créditos — SHIPPED 2026-06-07

Delivered: credit estimate transparency, enriched credit events, delivery/stale package UX, owner surprise ranking + session timeline, full regression green.

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
- ✓ **BRIEF-01**: User can create campaign with only name, client, and client profile — v5.0
- ✓ **BRIEF-02**: Creation form is a single page (no multi-step wizard) — v5.0
- ✓ **BRIEF-03**: Required fields are campaign name, client, and client profile — v5.0
- ✓ **BRIEF-04**: Key creative upload is optional at creation time — v5.0
- ✓ **AI-01**: Key creative upload triggers automatic visual analysis via AI — v5.0
- ✓ **AI-02**: AI deduces campaign fields from image (product, objective, target audience, tone, offer, platforms) — v5.0
- ✓ **AI-03**: Deduced fields are presented in an editable form — v5.0
- ✓ **AI-04**: User can edit any auto-filled field before saving — v5.0
- ✓ **AI-05**: If analysis fails, form loads empty without blocking the flow — v5.0
- ✓ **AI-06**: Analysis is non-blocking; upload completes independently of analysis — v5.0
- ✓ **AI-07**: Analysis result is stored in the asset metadata — v5.0
- ✓ **GEN-01**: Creativity profile (conservative, balanced, bold) configurable in generation mode — v5.0
- ✓ **GEN-02**: Per-piece CTA configurable in generation mode with AI suggestions — v5.0
- ✓ **GEN-03**: Output format (1:1, 4:5, 9:16) configurable in generation mode — v5.0
- ✓ **GEN-04**: Derivation mode (art variation, format adaptation, restyling) in generation mode — v5.0
- ✓ **GEN-05**: AI suggestions for creativity profile based on analyzed piece — v5.0
- ✓ **GEN-06**: AI suggestions for CTAs based on campaign context — v5.0
- ✓ **CLEAN-01**: Briefing Doctor is removed from the creation flow — v5.0
- ✓ **CLEAN-02**: Briefing Doctor routes, hooks, and components are removed — v5.0
- ✓ **CLEAN-03**: Briefing Doctor translations are removed from i18n files — v5.0
- ✓ **CLEAN-04**: Briefing Doctor references are removed from documentation — v5.0
- ✓ **PERF-01**: Code splitting com `next/dynamic` para páginas pesadas — v6.0
- ✓ **PERF-02**: Lazy loading para componentes de campanha e galeria — v6.0
- ✓ **PERF-03**: Reduzir bundle size inicial em pelo menos 30% — v6.0
- ✓ **PERF-04**: Otimizar TanStack Query com staleTime apropriado — v6.0
- ✓ **PERF-05**: Desabilitar refetchOnWindowFocus para queries estáticas — v6.0
- ✓ **PERF-06**: Implementar prefetch de dados na navegação — v6.0
- ✓ **PERF-07**: Cachear resultados de análise visual da IA por 24h — v6.0
- ✓ **PERF-08**: Reduzir tamanho de imagens antes do upload — v6.0
- ✓ **PERF-09**: Otimizar carregamento de imagens com placeholders — v6.0
- ✓ **PERF-10**: Remover dead code e dependências não utilizadas — v6.0
- ✓ **PERF-11**: Implementar virtualização para listas grandes — v6.0
- ✓ **PERF-12**: Melhorar First Contentful Paint para < 1.5s — v6.0
- ✓ **DRV-01**: Manual art variation opens config step before generation — v11.0
- ✓ **DRV-02**: User sets creativity level and CTAs in manual art flow — v11.0
- ✓ **DRV-03**: Auto art variation pre-fills AI-suggested CTAs and creativity — v11.0
- ✓ **DRV-04**: User can edit AI suggestions before confirming auto art flow — v11.0
- ✓ **DRV-05**: Single format adaptation lets user pick one format — v11.0
- ✓ **DRV-06**: Batch format adaptation lets user pick multiple formats — v11.0
- ✓ **DRV-07**: Derivar options no longer skip to hardcoded generation — v11.0
- ✓ **DRV-08**: Modal copy matches behavior in PT-BR and EN — v11.0
- ✓ **DRV-09**: Tests cover all four Derivar entry paths — v11.0
- ✓ **DRV-10**: Estilizar workflow unaffected — v11.0

### Validated (v11.4)

- ✓ **FBK-01–04**: In-app feedback submission (global + contextual) with success/error toasts — v11.4
- ✓ **CTX-01–05**: Diagnostic context, breadcrumbs, completeness indicator — v11.4
- ✓ **OBS-01–03**: Sentry trace correlation and ID-only server logs — v11.4
- ✓ **TRI-01–04**: Owner triage list, detail, status, private notes — v11.4
- ✓ **SEC-01–04**: Workspace isolation, entity validation, sanitization, no replay by default — v11.4
- ✓ **QA-01–03**: Automated tests + privacy handoff doc — v11.4

### Validated (v11.5)

- ✓ **AIC-01–05**: Explicit creative contract per derivation, prompt preservation rules, and prompt provenance JSONB — v11.5
- ✓ **AIQ-01–05**: Shared quality taxonomy, fail-safe score/QA normalization, hard-failure gate, localized blocking vs polish copy — v11.5
- ✓ **AIR-01–05**: Bounded regeneration correction briefs, pre-confirm primary reason UI, child brief persistence, contract inheritance — v11.5
- ✓ **FIX-01–05**: Synthetic quality fixtures, prompt/gate/brief regression tests, manual loop handoff, documented model limitations — v11.5

### Validated (v11.6)

- ✓ **READY-01–05**: Creative Readiness Score, dimensions, blocking issues, rerun, and existing preflight/QA integration — v11.6
- ✓ **GUIDE-01–05**: Guided briefing questions, accept/edit/skip suggestions, draft persistence, and PT-BR/EN copy — v11.6
- ✓ **RECIPE-01–05**: Strategy recipes, concrete generation settings, tradeoff copy, readiness-aware ranking, and overrides — v11.6
- ✓ **PREVIEW-01–04**: Preview-first derivation, quality gate reuse, approve/revise path, and visible batch credit impact — v11.6
- ✓ **DELIVER-01–04**: Client approval package, selected formats, creative notes, share links, signed assets, and refresh flow — v11.6
- ✓ **CQA-01/CQA-02/CQA-03**: Automated cockpit coverage, production browser smoke, and beta handoff documentation — v11.6

### Validated (v11.6.1)

- ✓ **SHIP-01–05**: Production cockpit smoke, deploy/migration evidence, post-review fixes, audit caveats register, and v11.6 GSD archive — v11.6.1
- ✓ **BETA-01–03**: Beta runbook, feedback stage mapping, and learning questions — v11.6.1

### Validated (v11.7)

- ✓ **PROG-01–05**: User can see and progress through an Ads Scientist status ladder tied to meaningful product actions — v11.7
- ✓ **MISS-01–06**: User can complete guided missions that teach and exercise the app's core creative workflow — v11.7
- ✓ **INS-01–05**: Product owner can capture structured insight from mission moments, rejections, skips, and credit friction — v11.7
- ✓ **CRED-01–04**: Credit usage is connected to mission value, remaining allowance, and upgrade moments without dark patterns — v11.7
- ✓ **QA-01–04**: Progression, insight capture, and credit prompts are verified with tests and a beta UAT checklist — v11.7

### Validated (v11.7.1)

- ✓ **STAB-01–04**: Production build, lint, focused tests, and migration checks are green for the v11.7 progression stack — v11.7.1
- ✓ **DATA-01–03**: Mission insight and progression persistence reject invalid data and survive concurrent access — v11.7.1
- ✓ **UX-01–02**: Progression and mission CTAs resume users into the intended workflow surface — v11.7.1
- ✓ **UAT-01–03**: Beta operator can apply the migration, execute the v11.7 UAT path, and ship with documented evidence — v11.7.1

### Validated (v11.8)

- ✓ **INST-01–06**: First-party beta analytics ingest with PII-safe allowlist and workspace-scoped events — v11.8
- ✓ **INST-02–04**: Server and client instrumentation with beta session grouping — v11.8
- ✓ **SESS-01, SESS-02, SESS-04**: Operator session APIs, runbook-stage notes, and artifact export — v11.8 (SESS-03 UAT pending)
- ✓ **DASH-01–05**: Owner funnel analytics, credit/readiness signals, and CSV export on `/feedback` — v11.8
- ✓ **LEARN-01–03**: Learning answers and v11.9 direction gate (fixture-backed until real sessions) — v11.8
- ✓ **FIX-01–05**: Ranked friction backlog, five surgical fixes, and v11.9 deferral doc — v11.8
- ✓ **QA-01–03**: Instrumentation integration tests, owner 403 guards, test/lint/build green — v11.8

### Active

_(Definindo em REQUIREMENTS.md — milestone v11.10)_

### Validated (v10.0)

- ✓ **ANIM-01**: Hover/focus states com transições suaves em todos elementos interativos — v10.0
- ✓ **ANIM-02**: Modais/diálogos com animações de enter/exit — v10.0
- ✓ **ANIM-03**: Stagger animations em listas e galerias — v10.0
- ✓ **ANIM-04**: Skeleton loading com shimmer effect — v10.0
- ✓ **ANIM-05**: Toast notifications com animações suaves — v10.0
- ✓ **RESP-01**: Sidebar colapsa em drawer em mobile — v10.0
- ✓ **RESP-02**: Grids adaptativos conforme breakpoint — v10.0
- ✓ **RESP-03**: Formulários empilhados em mobile — v10.0
- ✓ **RESP-04**: TopBar com scroll behavior (hide/show) — v10.0
- ✓ **RESP-05**: Touch gestures otimizados para galeria — v10.0
- ✓ **COMP-01**: Cards com hover lift e shadow — v10.0
- ✓ **COMP-02**: Botões com active scale e estados refinados — v10.0
- ✓ **COMP-03**: Inputs com focus glow transition — v10.0
- ✓ **COMP-04**: Badges com status transition suave — v10.0
- ✓ **A11Y-01**: Empty states com ilustrações e copy contextual — v10.0
- ✓ **A11Y-02**: Error states com feedback visual — v10.0
- ✓ **A11Y-03**: Focus states visíveis em todos interativos — v10.0
- ✓ **A11Y-04**: Reduced motion support (prefers-reduced-motion) — v10.0
- ✓ **A11Y-05**: Scroll suave entre seções — v10.0

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
- Briefing Doctor — removed in v5.0; replaced by AI visual analysis of key creative
- Multi-step campaign brief form — replaced by simplified single-page flow in v5.0

## Context

Current state: v11.8 Loop de Aprendizado Beta is shipped (phases 75–79). First-party beta analytics, cockpit instrumentation, operator session tooling, owner funnel dashboard, and five friction fixes are in production code. Operator applies migrations `0032` (progression) and `0033` (beta analytics) before live sessions.

v11.6 learning questions have draft answers in `78-LEARNING-ANSWERS-DRAFT.md` / `79-LEARNING-ANSWERS.md` (fixture-backed). SESS-03 (≥3 real operator sessions) remains the post-ship UAT gate before locking v11.9 scope.

Marketing remains in `jhowtkd/site-adscale.git`; product feedback and owner triage live in ADScale_2 at `/feedback` for platform owners.

Migration `app/drizzle/0027_fine_morlun.sql` (Drizzle journal idx 27) must be applied in deployed environments via `npm run db:migrate` before relying on `creative_contract`, `prompt_provenance`, and `regeneration_correction_brief` columns in production.

Prior milestones delivered the strategy cockpit (v11.6), beta feedback capture (v11.4), presentation site separation (v11.3), beta entitlements (v11.2), generation quality gates (v11.1), coherent derivation flows (v11.0), and the full MVP through v10 UI polish.

Current verification status: build, lint (64 warnings accepted), and focused progression/missions/insights tests pass. Live migration apply and external beta cohort invite remain operator steps documented in v11.7.1 handoff.

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
| Better Auth + open signup | Fastest path to auth without OAuth complexity | ✓ Good |
| Zustand → UI-only | Prevents stale business data in client stores | ✓ Good |
| Inngest for derivation jobs | Durable, retryable, observable without managing workers | ✓ Good |
| R2 for all file storage | S3-compatible, cost-effective, presigned URLs keep load off Vercel | ✓ Good |
| OpenAI image model configurable | Future-proof if model name changes | ✓ Good |
| JSONB contract/provenance on derivations | Inspectable generation contract without public debug UI | ✓ Good — v11.5 |
| Shared quality taxonomy module | Score, QA, and gate must agree on failure categories | ✓ Good — v11.5 |
| Feedback as categorized context only | Raw beta text cannot override hard contract fields | ✓ Good — v11.5 |
| Synthetic fixtures over customer assets | Privacy-safe repeatable regression for known failure modes | ✓ Good — v11.5 |
| Preview before batch | Users should validate strategy cheaply before spending credits on a full batch | ✓ Good — v11.6 |
| Strategy cockpit over isolated tools | Existing AI modules should be orchestrated into one decision path before adding new surface area | ✓ Good — v11.6 |
| Operator smoke before beta ship | Automated tests passed, but deployed browser evidence is still the release gate | ✓ Good — v11.6.1 |
| Progression as activation, not decoration | Beta users should learn by completing real creative tasks that generate insight and consume credits transparently | ✓ Good — v11.7 |
| Stabilization before beta expansion | Activation mechanics should not enter beta while build, persistence, and UAT gates are still uncertain | ✓ Good — v11.7.1 |
| Learn before build | Instrument and run operator beta sessions before adding speculative cockpit or progression features | ✓ Good — v11.8 |
| First-party beta analytics | Operator-scale learning without third-party SDK; PII allowlist at ingest | ✓ Good — v11.8 |
| Evidence-capped friction fixes | Max 5 surgical UX fixes per milestone with session citations | ✓ Good — v11.8 |

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
*Last updated: 2026-06-08 — milestone v12.0 Monetização Real iniciado (v11.11 SESS-03 em paralelo)*

## Milestone History

### v3.0 Modos de Derivação Fiel ✅
- Art variation, format adaptation, restyling
- Creativity templates with operational rules
- Literal CTA enforcement
- Phases 10–15 archived

### v4.0 Monetização & Compliance ✅
- Stripe subscriptions with 14-day trial
- Plan cards, upgrade flow, credit alerts
- LGPD: privacy page, terms, cookie banner, data export, account deletion
- Phases 16–17 archived

### v5.0 Simplificação do Fluxo de Criação de Campanha ✅
- Single-page campaign creation form (name, client, profile)
- AI visual analysis of key creative with deduced fields
- Editable auto-filled campaign information
- Generation mode with creativity profile and CTA suggestions
- Briefing Doctor completely removed
- Phases 18–21 archived

## Milestone History (Continued)

### v6.0 Performance & Otimização ✅
- Code splitting e lazy loading (next/dynamic, 15+ componentes)
- TanStack Query optimization (staleTime presets, prefetch on hover)
- AI visual analysis caching (24h cache check)
- Image optimization (resize >5MB to 1024px, OptimizedImage component)
- Bundle cleanup (7 unused dependencies removed)
- VirtualList for large lists (>20 items)
- Resource hints for R2 CDN (preconnect/dns-prefetch)
- Phases 22–25 archived

### v7.0 Experiência do Usuário ✅
- Onboarding aprimorado com tour de 5 passos e tooltips contextuais
- Templates de campanha reutilizáveis (salvar, usar, renomear, deletar)
- Analytics no dashboard com 6 KPIs e seletor de período
- Phases 26–28 archived

### v8.0 Galeria de Revisão Aprimorada ✅
- Comparação lado a lado com zoom sincronizado e pan
- Filtros avançados: status, formato, CTA, quality score range
- Persistência de filtros na URL
- Batch approve/reject com master checkbox
- Phases 29–31 archived

### v9.0 Galeria de Revisão v2 ✅
- Anotações visuais (freehand, text, shapes) em canvas
- Toolbar de anotações com cores, espessura e tamanho de fonte
- Persistência de anotações no localStorage
- Comparação de 3+ derivações em grid adaptativo
- Zoom/pan independente em cada célula
- Slider antes/depois com divisão arrastável
- Toggle entre grid view e slider view
- Phases 32–34 archived

### v10.0 Refinamento de Interface ✅
- Animation Foundation: variants, easings, transitions, hooks (useReducedMotion, useMediaQuery)
- Reusable animation components: FadeIn, StaggerContainer, ShimmerSkeleton
- Core Component Polish: Card hover lift, Button active scale, Input focus glow, Badge transitions
- Layout Responsive: Mobile sidebar drawer, TopBar scroll behavior, responsive grids, form stacking
- Feature Components: Stagger animations in lists/galleries, enhanced modal animations
- States & Accessibility: Enhanced empty states, shake animation, reduced motion support
- Phases 35–39 archived

### v11.0 Fluxos de Derivação Coerentes ✅
- `useDerivationFlow` routing — no silent auto-generate from Derivar chooser
- Art variation config modals with creativity profile + CTAs (manual and AI-assisted prefill)
- Format adaptation single/batch pickers with API validation for 1–3 target formats
- PT-BR/EN copy aligned to behavior; comprehensive test coverage for all four paths
- Phases 40–43 archived

### v11.1 Qualidade de Geração e Contratos Criativos ✅
- Native format adaptation, creative contract, restyling source control, hard quality gates, and workspace error/review feedback
- Phases 44–48 archived

### v11.2 Beta Access and Credit Entitlements ✅
- Beta access without fake Stripe subscriptions
- 10-ad beta allowance through server spend gates
- Billing/status UI distinguishes beta and paid access
- Phase 49 archived

### v11.3 Site de Apresentação Separado ✅
- Public presentation site in `jhowtkd/site-adscale.git`
- Marketing/app boundary documented; legal pages remain in app
- Phases 50–52 archived

### v11.4 Beta Feedback Capture ✅
- `feedback_reports` model with sanitized diagnostics and workspace-safe APIs
- In-app feedback modal with global and contextual triggers
- Owner triage at `/feedback` with signed asset links
- Phases 53–56 archived

### v11.5 Qualidade IA Orientada por Feedback ✅
- Durable creative contract and prompt provenance on derivations
- Shared taxonomy with fail-safe score/QA normalization and hard-failure gate
- Feedback-informed regeneration with pre-confirm primary reason and child brief persistence
- Six-fixture synthetic catalog with 28 automated pipeline regression tests
- Phases 57–60 archived

## Next Milestone Goals

- v11.8 Loop de Aprendizado Beta: operator sessions, full instrumentation, owner dashboard, evidence-driven friction fixes.

---
*Last updated: 2026-06-07 after v11.8 milestone initialization*
