# Milestones: ADScale

## v5.0 Simplificação do Fluxo de Criação de Campanha (Shipped: 2026-05-26)

**Phases completed:** 4 phases, 3 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

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

---
*Last updated: 2026-04-24*
