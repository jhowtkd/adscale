# Plano de Execucao - ADScale Creative Derivation Webapp

## Visao Geral
Construir um webapp SaaS completo para derivação de criativos digitais (anuncios) usando GPT Image 2.0.
O usuario faz upload de um criativo base, preenche um briefing de campanha, recebe um plano criativo gerado por IA,
gera derivações mantendo consistencia visual, revisa e exporta para Meta/TikTok/Google Ads.

## Stack Tecnologica
- Frontend: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- Estado: Zustand (client) + TanStack Query (server)
- Backend: Next.js API Routes + Server Actions
- Banco: PostgreSQL (Neon) + Drizzle ORM
- Auth: Better Auth (email/password)
- Storage: Cloudflare R2 (S3-compatible)
- Filas: Inngest (event-driven jobs)
- AI: OpenAI SDK (gpt-image-2, GPT-4o para planos)
- Deploy: Vercel

## Estrutura do Projeto
5 Fases sequenciais, cada uma com planos detalhados ja fornecidos nos documentos de entrada.

## Estagios de Execucao

### Estagio 1: Foundation (Fase 1)
**Skill**: vibecoding-webapp-swarm
- Plano 01-01: Scaffold Next.js, TypeScript, Tailwind, shadcn/ui, lint, test
- Plano 01-02: Database Drizzle schema, migrations, repositories
- Plano 01-03: Better Auth, protected routes, workspace shell
- Plano 01-04: R2 storage, Inngest queue, health checks

### Estagio 2: Campaign e Upload (Fase 2)
**Skill**: vibecoding-webapp-swarm
- Plano 02-01: Campaign CRUD, briefing form, workspace navigation
- Plano 02-02: Presigned upload flow, asset validation, storage, preview
- Plano 02-03: Connect campaign state, empty/loading/error states

### Estagio 3: AI Plan e Derivation (Fase 3)
**Skill**: vibecoding-webapp-swarm
- Plano 03-01: Creative plan generation com GPT-4o, structured output, approval flow
- Plano 03-02: Derivation job creation, queue handler, status model, retry/backoff
- Plano 03-03: OpenAI gpt-image-2 integration com image reference support
- Plano 03-04: Store outputs, metadata, cost estimate, frontend progress updates

### Estagio 4: Review e Export (Fase 4)
**Skill**: vibecoding-webapp-swarm
- Plano 04-01: Derivative gallery, preview, compare view, review status controls
- Plano 04-02: Regeneration flow com feedback linked to previous derivative
- Plano 04-03: Export pipeline, file naming, format conversion, download

### Estagio 5: Hardening e Beta Readiness (Fase 5)
**Skill**: vibecoding-webapp-swarm
- Plano 05-01: Usage allowance, cost estimation, generation blocking
- Plano 05-02: Input validation, authorization checks, upload security
- Plano 05-03: MVP smoke tests para o fluxo completo
- Plano 05-04: Polish beta UX, failure messaging, loading states

## Entregavel Final
Webapp funcional deployado na Vercel com:
- Autenticação completa (signup/signin/signout)
- CRUD de campanhas com briefing estruturado
- Upload de criativo base
- Geração de plano criativo com IA
- Derivação de imagens com gpt-image-2 (1-5 variações)
- Galeria de revisão com approve/reject/regenerate
- Exportação em PNG/JPEG/WebP
- Tracking de uso e custos
