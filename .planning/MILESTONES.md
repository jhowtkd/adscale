# Milestones: ADScale

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

---

## Completed Milestones

### v7.0 — Experiência do Usuário ✅
**Shipped:** 2026-05-27
**Phases:** 3 (26→28)
**Requirements:** 16/16 complete

**Delivered:**
- Onboarding tour de 5 passos com driver.js
- Tooltips contextuais para features complexas
- Progresso salvo no banco de dados, reiniciável via Settings
- Templates de campanha: salvar, usar, renomear, deletar
- Template selector no modal de nova campanha
- 6 KPIs no dashboard: campanhas, derivações, total, taxa aprovação, tempo médio, créditos
- Seletor de período: semana/mês/trimestre
- Dados reais de créditos a partir de creditTransactions

## Completed Milestones

### v8.0 — Galeria de Revisão Aprimorada ✅
**Shipped:** 2026-05-27
**Phases:** 3 (29→31)
**Requirements:** 13/13 complete

**Delivered:**
- Comparação lado a lado de 2 derivações com zoom sincronizado e pan
- Botão Compare em cada card com modo de seleção visual
- Filtros avançados: status, formato (1:1, 4:5, 9:16), CTA (busca parcial), quality score range
- Persistência de filtros na URL para bookmarking
- Batch approve/reject com master checkbox e contador de seleção
- Bulk actions bar flutuante com approve/reject/export/download/share

---

### v9.0 — Galeria de Revisão v2 ✅
**Shipped:** 2026-05-28
**Phases:** 3 (32→34)
**Requirements:** 14/14 complete

**Delivered:**
- Anotações visuais: desenho livre, textos, formas (círculo, retângulo, seta) em canvas
- Toolbar de anotações com seletor de cores, espessura e tamanho de fonte
- Persistência de anotações no localStorage por derivação
- Comparação de 3+ derivações em grid adaptativo (2→4 colunas)
- Zoom/pan independente em cada célula do grid de comparação
- Remoção individual de derivações do grid
- Slider antes/depois com divisão arrastável (horizontal/vertical)
- Toggle entre grid view e slider view quando comparando 2 derivações

---

### v10.0 — Refinamento de Interface ✅
**Shipped:** 2026-05-28
**Phases:** 5 (35→39)
**Requirements:** 19/19 complete

**Delivered:**
- Animation Foundation: variants, easings, transitions, custom hooks (useReducedMotion, useMediaQuery, useScrollDirection)
- Reusable animation components: FadeIn, StaggerContainer
- Core Component Polish: Card hover lift/shadow, Button active scale, Input focus glow, Badge transitions
- Layout Responsive: Mobile sidebar drawer with hamburger menu, TopBar hide/show on scroll
- Form stacking on mobile (grid-cols-1 sm:grid-cols-2)
- Feature Components: Stagger animations in campaign grid/list, enhanced modal animations
- States & Accessibility: Enhanced empty states with icon backgrounds, shake animation for errors
- Reduced motion support throughout all animations

---

## Active Milestone

### v11.0 — Fluxos de Derivação Coerentes (Planning)
**Status:** Requirements and roadmap defined
**Goal:** Each Derivar modal option performs its promised function with config/confirm before generation
**Phases:** 40–43 (4 phases, 10 requirements)

**Next step:** `/gsd-plan-phase 40`

---

*Last updated: 2026-06-01*
