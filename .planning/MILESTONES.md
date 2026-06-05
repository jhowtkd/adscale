# Milestones: ADScale

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
