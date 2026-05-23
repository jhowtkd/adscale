# Auditoria de Estratégia de Testes — ADScale_2

**Data:** 2026-05-22
**Auditor:** Engenharia de QA
**Projeto:** ADScale_2 (`/Users/jhonatan/Repos/ADScale_2/app`)
**Stack:** Next.js 16 + React 19 + TypeScript + Vitest + jsdom + Testing Library

---

## 1. Resumo Executivo

O projeto possui **51 arquivos de teste** (~67 test suites mencionadas) distribuídos entre testes **colocalizados** (29 em `src/`) e testes em pasta dedicada (22 em `tests/`). A cobertura é **heterogênea e insuficiente** para uma aplicação de produção com fluxos de pagamento (Stripe), geração de imagens via IA (OpenAI) e isolamento multi-tenant (workspaces).

**Estimativa de cobertura atual: ~25-30%** (por arquivo de código-fonte com teste correspondente)

**Pontos críticos:**
- **Zero testes E2E** (nenhum Playwright/Cypress configurado)
- **Mock excessivo do Drizzle** em testes de repositório (testam implementação, não comportamento)
- **API routes**: apenas ~16 de 48 possuem testes (33%)
- **Autenticação/Autorização**: testes de workspace access existem, mas não cobrem middleware nem escopos de permissão
- **Nenhum teste de segurança** (CSRF, XSS, rate limiting, auth bypass)
- **Nenhum teste de performance/benchmark**

---

## 2. Inventário de Testes Existentes

### 2.1 Testes Colocalizados (`src/**/*.test.*`) — 29 arquivos

| Arquivo | Tipo | Suítes | Qualidade |
|---------|------|--------|-----------|
| `src/app/api/billing/checkout/route.test.ts` | Integration | 3 | Boa — valida planos, sessão Stripe, erro 500 |
| `src/app/api/billing/portal/route.test.ts` | Integration | — | Rota simples, teste mínimo |
| `src/app/api/billing/webhook/route.test.ts` | Integration | 3 | Boa — valida assinatura Stripe, processamento |
| `src/app/api/campaigns/route.test.ts` | Integration | 1 | Média — apenas query params de paginação |
| `src/app/api/client-profiles/route.test.ts` | Integration | 2 | Boa — GET/POST com validação de nome |
| `src/app/api/client-profiles/[id]/references/route.test.ts` | Integration | 4 | Boa — workspace scoping, asset key validation |
| `src/app/api/derivations/[id]/delivery-package/route.test.ts` | Integration | 7 | Excelente — edge cases, failures, idempotency |
| `src/app/api/derivations/[id]/landing-page/route.test.ts` | Integration | 7 | Excelente — 404, 409, 429, caching, error handling |
| `src/app/api/derivations/[id]/qa/route.test.ts` | Integration | 7 | Excelente — status codes, cached QA, AI errors |
| `src/app/api/derivations/[id]/regenerate/route.test.ts` | Integration | 3 | Boa — feedback bounds, active child check |
| `src/app/api/derivations/[id]/save-reference/route.test.ts` | Integration | — | Cobertura básica |
| `src/components/workspace/BriefingStep.test.tsx` | Unit (UI) | 4 | Média — mocks pesados de hooks |
| `src/components/workspace/DeliveryPackageModal.test.tsx` | Unit (UI) | 4 | Boa — interações de checkbox, confirmação |
| `src/components/workspace/DerivationCard.test.tsx` | Unit (UI) | 9 | Boa — condições de renderização por status |
| `src/lib/hooks/use-billing.test.tsx` | Unit (Hook) | 3 | Boa — TanStack Query integration |
| `src/lib/hooks/use-client-profiles.test.tsx` | Unit (Hook) | 4 | Boa — conditional fetching, mutations |
| `src/lib/hooks/use-creative-qa.test.tsx` | Unit (Hook) | 3 | Boa — error handling, invalidation |
| `src/lib/hooks/use-delivery-package.test.tsx` | Unit (Hook) | 2 | Boa — error states |
| `src/lib/hooks/use-landing-page.test.tsx` | Unit (Hook) | 3 | Boa — window.open, toast errors |
| `src/server/ai/creative-qa.test.ts` | Unit | 2 | Boa — normalização, prompt building |
| `src/server/ai/landing-page.test.ts` | Unit | 3 | Boa — prompt conteúdo, normalização, escape XSS |
| `src/server/ai/prompt-builder.test.ts` | Unit | 9 | Média — testes de string contida (frágeis) |
| `src/server/billing/credits.test.ts` | Unit | 4 | Excelente — idempotency, debit logic |
| `src/server/billing/events.test.ts` | Unit | 6 | Excelente — Stripe event processing, edge cases |
| `src/server/billing/gates.test.ts` | Unit | 2 | Boa — 402 response |
| `src/server/billing/sessions.test.ts` | Unit | 4 | Boa — customer reuse, portal session |
| `src/server/jobs/derivation.test.ts` | Unit | 3 | Boa — Sharp normalization, package format adaptation |
| `src/server/repositories/client-reference.test.ts` | Unit | 5 | Média — mock de Drizzle excessivo |
| `src/server/repositories/derivation.test.ts` | Unit | 2 | Média — mock de Drizzle excessivo |
| `src/server/repositories/landing-page.test.ts` | Unit | 4 | Média — mock de Drizzle excessivo |
| `src/server/repositories/template.test.ts` | Unit | 5 | Média — mock de Drizzle excessivo |
| `src/server/services/email.test.ts` | Unit | 2 | Boa — Resend API, error handling |
| `src/server/services/landing-page-renderer.test.ts` | Unit | 5 | Boa — HTML structure, XSS escape |
| `src/server/validation/env.test.ts` | Unit | 3 | Boa — Stripe key validation |

### 2.2 Testes em Pasta Dedicada (`tests/`) — 22 arquivos

| Arquivo | Tipo | Qualidade |
|---------|------|-----------|
| `tests/integration/asset-complete-cleanup.test.ts` | Integration | Boa — type/size mismatch, cleanup |
| `tests/integration/asset-listing-signed-url.test.ts` | Integration | Boa — presigned URLs |
| `tests/integration/auth-workspace-access.test.ts` | Integration | Excelente — auth errors, session, headers |
| `tests/integration/briefing-doctor.test.ts` | Integration | Excelente — AI JSON parsing, field patches, 502 |
| `tests/integration/campaign-crud.test.ts` | Integration | Média — repete lógica de repository test |
| `tests/integration/derivation-job.test.ts` | Integration | Excelente — status transitions, Inngest, styleIntensity |
| `tests/integration/derivation-listing-signed-url.test.ts` | Integration | Boa — signed URLs, null outputKey |
| `tests/integration/plan-generation.test.ts` | Integration | Média — apenas parsing de JSON (não testa API) |
| `tests/integration/quick-tools-restyling.test.ts` | Unit | Boa — parseStyleIntensity edge cases |
| `tests/integration/restyling.test.ts` | Integration | Excelente — form upload, cleanup, 402 credits |
| `tests/integration/review-export.test.ts` | Integration | Média — repository mocks |
| `tests/integration/signup-workspace.test.ts` | Integration | Média — repository mocks |
| `tests/integration/upload-flow.test.ts` | Integration | Média — schema validation (não testa API real) |
| `tests/integration/upload-size-header.test.ts` | Integration | Boa — Content-Length validation |
| `tests/unit/ai/creative-score.test.ts` | Unit | Boa — heuristic scoring, OpenAI mock |
| `tests/unit/ai/image-analysis.test.ts` | Unit | **RUIM** — placeholder (`expect(true).toBe(true)`) |
| `tests/unit/billing-schema.test.ts` | Unit | Média — verifica propriedades de schema (frágil) |
| `tests/unit/briefing-doctor-ui.test.tsx` | Unit (UI) | Boa — interações, mock de hooks |
| `tests/unit/briefing-doctor.test.ts` | Unit | Excelente — regras locais, edge cases |
| `tests/unit/creative-diagnosis.test.ts` | Unit | Boa — normalização, prompt building |
| `tests/unit/creative-score.test.ts` | Unit | Boa — heuristic bounds |
| `tests/unit/env-validation.test.ts` | Unit | Média — testa zod genérico, não o schema real |
| `tests/unit/prompt-builder.test.ts` | Unit | Média — strings em prompt (frágeis) |
| `tests/unit/prompt-parser.test.ts` | Unit | Boa — markdown extraction, schema validation |
| `tests/unit/r2-key-sanitization.test.ts` | Unit | Média — regex tests |
| `tests/unit/r2-presigned-download-cache.test.ts` | Unit | Boa — cache behavior |
| `tests/unit/r2-presigned-headers.test.ts` | Unit | Boa — signed headers |
| `tests/unit/repositories/asset.test.ts` | Unit | Média — Drizzle mock excessivo |
| `tests/unit/repositories/campaign.test.ts` | Unit | Média — Drizzle mock excessivo |
| `tests/unit/repositories/derivation.test.ts` | Unit | Média — Drizzle mock excessivo |
| `tests/unit/restyling-modal.test.tsx` | Unit (UI) | Boa — style intensity interaction |
| `tests/unit/schemas.test.ts` | Unit | Média — zod schemas duplicados (não os reais) |

---

## 3. Matriz de Cobertura (Módulo × Tipo de Teste)

| Módulo | Unit | Integration | E2E | Security | Performance | Cobertura |
|--------|:----:|:-----------:|:---:|:--------:|:-----------:|:---------:|
| **API Routes — Billing** | ✅ | ✅ | ❌ | ❌ | ❌ | 3/5 rotas |
| **API Routes — Campaigns** | ❌ | ⚠️ | ❌ | ❌ | ❌ | 2/14 rotas |
| **API Routes — Derivations** | ❌ | ✅ | ❌ | ❌ | ❌ | 5/8 rotas |
| **API Routes — Client Profiles** | ❌ | ✅ | ❌ | ❌ | ❌ | 2/2 rotas |
| **API Routes — Auth** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Workspace** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/6 rotas |
| **API Routes — User** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/4 rotas |
| **API Routes — Templates** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/2 rotas |
| **API Routes — Share** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Export/Zip** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/2 rotas |
| **API Routes — Dashboard** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Health** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Inngest** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Notifications** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/1 rotas |
| **API Routes — Restyling** | ❌ | ✅ | ❌ | ❌ | ❌ | 1/2 rotas |
| **API Routes — Briefing Doctor** | ❌ | ✅ | ❌ | ❌ | ❌ | 1/1 rotas |
| **API Routes — Competitors** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/4 rotas |
| **API Routes — Brand Kit** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/3 rotas |
| **Repositories — Asset** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — Campaign** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — Derivation** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — ClientRef** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — LandingPage** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — Template** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Repositories — Billing** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Plan** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Usage** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Workspace** | ⚠️ | ❌ | ❌ | ❌ | ❌ | Mínimo |
| **Repositories — User** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Export** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — ShareLink** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Competitor** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — Invitation** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Repositories — CreditTx** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI — Prompt Builder** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (frágil) |
| **AI — Creative Score** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **AI — Creative QA** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **AI — Creative Diagnosis** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **AI — Landing Page** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **AI — Image Analysis** | ⚠️ | ❌ | ❌ | ❌ | ❌ | Placeholder |
| **AI — Brand Kit Extractor** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI — Competitor Analyzer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI — Preflight Analysis** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Billing — Credits** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Billing — Events** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Billing — Gates** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Billing — Sessions** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Billing — Stripe** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Billing — Plans** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Components — Campaigns** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~20 |
| **Components — Dashboard** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~12 |
| **Components — Workspace** | ✅ | ❌ | ❌ | ❌ | ❌ | 4/~12 |
| **Components — Settings** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~8 |
| **Components — Auth** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~4 |
| **Components — Layout** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~4 |
| **Components — UI** | ❌ | ❌ | ❌ | ❌ | ❌ | 0/~20 |
| **Hooks — React Query** | ✅ | ❌ | ❌ | ❌ | ❌ | 5/~24 |
| **Auth — Session/Workspace** | ⚠️ | ✅ | ❌ | ❌ | ❌ | Mínimo |
| **Auth — Config/Team** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Middleware** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Rate Limit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Storage — R2** | ⚠️ | ❌ | ❌ | ❌ | ❌ | Presign apenas |
| **Jobs — Derivation** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Jobs — Trial Notifications** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Services — Email** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Services — Export** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Services — Notifications** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Services — LandingPageRenderer** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Validation — Env** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Lib — Utils/Formats** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Lib — Store** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Lib — API Client** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Pages — Next.js** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Top 10 Gaps Críticos

### 4.1 CRITICAL

| # | Severidade | Módulo | Tipo Faltante | Impacto | Recomendação |
|---|:----------:|--------|---------------|---------|--------------|
| 1 | **Critical** | Auth / Middleware (`middleware.ts`, `src/server/auth/session.ts`) | Integration + Security | Bypass de autenticação, acesso cross-workspace | Testar middleware de rotas protegidas; testar session validation com cookies inválidos/expirados |
| 2 | **Critical** | API Routes — Auth (`/api/auth/[...all]`) | Integration + Security | Regressão de auth flow | Testar login, signup, password reset, email verification com Better Auth |
| 3 | **Critical** | API Routes — Campaign mutations (`POST/PUT/DELETE /api/campaigns/[id]`) | Integration + Security | Isolamento de workspace quebrado | Testar que usuário do workspace A não pode modificar campanha do workspace B |
| 4 | **Critical** | API Routes — Workspace/Invites (`/api/workspace/*`) | Integration + Security | Escalada de privilégio, convites inválidos | Testar aceite de convite, membros, permissões de owner/admin/member |
| 5 | **Critical** | Rate Limiting (`src/lib/rate-limit.ts`, `src/lib/with-rate-limit.ts`) | Unit + Integration | DoS, abuso de API | Testar contagem de requests, bloqueio após limite, reset de janela |

### 4.2 HIGH

| # | Severidade | Módulo | Tipo Faltante | Impacto | Recomendação |
|---|:----------:|--------|---------------|---------|--------------|
| 6 | **High** | E2E Flows (Playwright) | E2E | Regressões de fluxo crítico não detectadas | Implementar Playwright: signup → create campaign → upload asset → generate derivation → approve → export |
| 7 | **High** | API Routes — Export/Zip (`/api/export/zip`, `/api/exports`) | Integration | Exportação quebrada, vazamento de dados | Testar geração de ZIP, inclusão apenas de derivations do workspace |
| 8 | **High** | API Routes — Share (`/api/share`, `/share/[token]`) | Integration + Security | Tokens previsíveis, acesso não autorizado | Testar geração de token, expiração, acesso público sem auth |
| 9 | **High** | Repositories — Billing/Usage (`billing.ts`, `usage.ts`, `credit-transactions.ts`) | Unit | Créditos incorretos, cobrança errada | Testar transações de crédito, saldo, expiração |
| 10 | **High** | API Routes — Competitor Analysis (`/api/campaigns/[id]/competitors/*`) | Integration | Análise de competidor falha | Testar análise com mock de OpenAI, validação de URLs |

---

## 5. Análise Detalhada por Categoria

### A. Cobertura de Código

#### Módulos SEM testes (0 cobertura)
- `src/middleware.ts` — Middleware de autenticação Next.js
- `src/server/auth/config.ts` — Configuração Better Auth
- `src/server/auth/session.ts` — Gestão de sessão
- `src/server/auth/team.ts` — Lógica de equipe
- `src/server/billing/stripe.ts` — Cliente Stripe
- `src/server/billing/plans.ts` — Planos e preços
- `src/server/db/repositories/brand-kit.ts`
- `src/server/jobs/trial-notifications.ts`
- `src/server/repositories/billing.ts`
- `src/server/repositories/competitor-analysis.ts`
- `src/server/repositories/credit-transactions.ts`
- `src/server/repositories/export.ts`
- `src/server/repositories/invitation.ts`
- `src/server/repositories/plan.ts`
- `src/server/repositories/share-link.ts`
- `src/server/repositories/usage.ts`
- `src/server/repositories/user.ts`
- `src/server/repositories/workspace.ts`
- `src/server/services/export.ts`
- `src/server/services/notifications.ts`
- `src/server/ai/brand-kit-extractor.ts`
- `src/server/ai/competitor-analyzer.ts`
- `src/server/ai/preflight-analysis.ts`
- `src/server/ai/image-analysis.ts` (apenas placeholder)
- `src/server/ai/utils.ts`
- `src/lib/api-client.ts`
- `src/lib/api-response.ts`
- `src/lib/auth-client.ts`
- `src/lib/formats.ts`
- `src/lib/logger.ts`
- `src/lib/mock-data.ts`
- `src/lib/rate-limit.ts`
- `src/lib/sentry.ts`
- `src/lib/share-token.ts`
- `src/lib/store.ts`
- `src/lib/style-intensity.ts`
- `src/lib/utils.ts`
- `src/lib/with-rate-limit.ts`
- `src/lib/hooks/use-assets.ts`
- `src/lib/hooks/use-brand-kit.ts`
- `src/lib/hooks/use-briefing-autosave.ts`
- `src/lib/hooks/use-briefing-doctor.ts`
- `src/lib/hooks/use-campaign-workspace.ts`
- `src/lib/hooks/use-campaigns.ts`
- `src/lib/hooks/use-competitor-analysis.ts`
- `src/lib/hooks/use-creative-diagnosis.ts`
- `src/lib/hooks/use-dashboard.ts`
- `src/lib/hooks/use-derivations.ts`
- `src/lib/hooks/use-export.ts`
- `src/lib/hooks/use-onboarding.ts`
- `src/lib/hooks/use-plan.ts`
- `src/lib/hooks/use-preflight.ts`
- `src/lib/hooks/use-regenerate.ts`
- `src/lib/hooks/use-review.ts`
- `src/lib/hooks/use-share-link.ts`
- `src/lib/hooks/use-templates.ts`
- `src/lib/hooks/use-workspace-team.ts`
- `src/lib/hooks/use-zip-export.ts`
- Todos os componentes em `src/components/campaigns/`, `dashboard/`, `settings/`, `auth/`, `layout/`, `ui/`
- Todas as pages em `src/app/(dashboard)/`, `src/app/(public)/`, `src/app/login/`, etc.

#### API Routes testadas (com .test.ts colocalizado)
- `billing/checkout`, `billing/portal`, `billing/webhook`
- `campaigns/route` (GET apenas)
- `campaigns/[id]/assets/complete`
- `campaigns/[id]/assets/upload`
- `campaigns/[id]/derivations`
- `client-profiles/route`
- `client-profiles/[id]/references`
- `derivations/[id]/delivery-package`
- `derivations/[id]/landing-page`
- `derivations/[id]/qa`
- `derivations/[id]/regenerate`
- `derivations/[id]/save-reference`
- `restyling/route`
- `briefing-doctor/analyze`

#### API Routes NÃO testadas (32 rotas)
Todas as demais em `src/app/api/` incluindo: auth, billing/history, billing/status, campaigns/[id] (PUT/DELETE), campaigns/[id]/assets/presign, campaigns/[id]/assets/[assetId]/preflight, campaigns/[id]/competitors/*, campaigns/[id]/plan, campaigns/[id]/diagnosis/*, dashboard, export/zip, exports, health, inngest, notifications/webhook, quick-tools/restyling, share, templates/*, user/*, workspace/*.

### B. Qualidade dos Testes

#### Problemas Identificados

1. **Mock excessivo do Drizzle** (Alta incidência)
   - **Arquivos afetados:** `tests/unit/repositories/*.test.ts`, `src/server/repositories/*.test.ts`
   - **Problema:** `vi.mock("@/server/db", () => ({ db: { insert: vi.fn(), select: vi.fn() } }))` mocka a implementação do ORM inteiro
   - **Impacto:** Os testes verificam que `db.insert` foi chamado, não que o dado foi persistido. Um refactoring do schema quebra os mocks sem necessariamente quebrar o comportamento real.
   - **Recomendação:** Usar banco de testes SQLite/PostgreSQL com `drizzle-kit` para testes de integração de repository. Manter mocks apenas para unit tests de service layer.

2. **Testes de string contida em prompts** (Média incidência)
   - **Arquivos afetados:** `tests/unit/prompt-builder.test.ts`, `src/server/ai/prompt-builder.test.ts`
   - **Problema:** `expect(prompt).toContain("CREATIVITY LEVEL: conservative")` — se o prompt for reformulado, o teste quebra sem que o comportamento esteja errado
   - **Impacto:** Alta fragilidade, manutenção custosa
   - **Recomendação:** Testar estrutura (funções puras que montam objetos de prompt) em vez de strings finais. Ou usar snapshots aprovados manualmente.

3. **Placeholder tests** (Baixa incidência)
   - **Arquivo:** `tests/unit/ai/image-analysis.test.ts`
   - **Problema:** `expect(true).toBe(true)` — não testa nada
   - **Recomendação:** Remover ou implementar testes reais para `analyzeImageContent` e `analyzeImageStyle`

4. **Schemas duplicados em testes**
   - **Arquivo:** `tests/unit/schemas.test.ts`
   - **Problema:** Define schemas Zod próprios (`createCampaignSchema`, `presignSchema`) em vez de importar os schemas reais da aplicação
   - **Impacto:** Os schemas reais podem divergir sem que o teste detecte
   - **Recomendação:** Importar e testar os schemas reais de `src/app/api/*/route.ts`

5. **Ausência de assertions de efeitos colaterais**
   - Muitos testes de repositório verificam que `db.insert().values()` foi chamado, mas não verificam o payload exato passado para o banco

### C. Test Categories

#### Unit Tests
- **Quantidade:** ~40 arquivos
- **Qualidade geral:** Média a Boa
- **Problemas:** Mock excessivo de Drizzle, testes de prompt frágeis
- **Cobertura:** Concentrada em billing, AI layer, alguns hooks e componentes

#### Integration Tests
- **Quantidade:** ~11 arquivos (pasta `tests/integration/`) + testes colocalizados de API routes
- **Qualidade geral:** Boa a Excelente nas rotas testadas
- **Problemas:** Muitas rotas sem teste; alguns testes de integração na verdade mockam todos os repositórios (ex: `campaign-crud.test.ts`, `signup-workspace.test.ts`)

#### E2E Tests
- **Quantidade:** 0
- **Ferramenta:** Nenhuma (não há Playwright, Cypress, Selenium)
- **Impacto:** Fluxos críticos (signup → billing → campaign → generation) não são validados end-to-end

#### Contract Tests
- **Quantidade:** 0
- **Problema:** Nenhuma validação de schema de request/response das APIs
- **Recomendação:** Adicionar testes com `zod` validando inputs/outputs de cada API route

#### Security Tests
- **Quantidade:** 0 (dedicados)
- **Cobertura parcial:** `auth-workspace-access.test.ts` testa WorkspaceAuthError
- **Faltando:** CSRF, XSS (parcial em landing-page renderer), rate limiting, SQL injection (Drizzle ORM mitiga, mas não testado), auth bypass, token prediction

#### Performance Tests
- **Quantidade:** 0
- **Faltando:** Benchmark de geração de imagem, latência de API, memory leaks em jobs

### D. Test Data & Setup

#### Fixtures e Factories
- **Status:** ❌ Não existem factories centralizadas
- **Problema:** Cada teste cria seus próprios objetos mock manualmente (ex: `baseCampaign`, `baseDerivation`)
- **Impacto:** Inconsistência de dados entre testes, repetição de código
- **Recomendação:** Criar `tests/factories/` com factories para Campaign, Derivation, User, Workspace usando `@faker-js/faker`

#### Test Database
- **Configuração:** Vitest usa `jsdom` por padrão; há config condicional para `TEST_DATABASE_URL`
- **Scripts:** `test:db:setup`, `test:db:teardown` existem
- **Problema:** Não está claro se são usados no CI; a maioria dos testes usa mocks em vez do banco real
- **Recomendação:** Migrar testes de repositório para usar PostgreSQL de teste no CI

#### Seed Data
- **Status:** ❌ Não existe seed dedicado para testes
- **Recomendação:** Criar `tests/seeds/` com dados mínimos para workspaces, users, campaigns

#### Isolamento entre Testes
- **Status:** ⚠️ Parcial
- **Observação:** `beforeEach(() => vi.clearAllMocks())` é usado, mas sem banco de dados real, o isolamento é apenas de mocks
- **Risco:** Testes que usam módulos importados dinamicamente (`vi.resetModules()`) podem ter efeitos colaterais

### E. Edge Cases & Error Handling

| Área | Cobertura | Falhas |
|------|:---------:|--------|
| Caminhos de erro em API routes | ⚠️ Parcial | Boa nas rotas testadas (404, 409, 429, 500, 502), mas 32 rotas sem testes |
| Inputs inválidos (Zod) | ⚠️ Parcial | `schemas.test.ts` testa schemas duplicados, não os reais |
| Race conditions | ❌ | Nenhum teste de concorrência (ex: duplo clique em generate) |
| Rate limiting | ❌ | Nenhum teste |
| Unauthorized access | ⚠️ Mínima | `auth-workspace-access.test.ts` cobre 401/403 básicos, mas não middleware |
| Stripe webhook replay | ✅ | `events.test.ts` cobre idempotência de eventos |
| Credit idempotency | ✅ | `credits.test.ts` cobre duplicidade de chaves |
| AI timeout / malformed JSON | ✅ | `briefing-doctor.test.ts` cobre 502 para JSON inválido |
| File upload (size, type) | ✅ | `restyling.test.ts`, `upload-size-header.test.ts` cobrem limites |
| R2 failures | ⚠️ | Apenas cleanup testado; não testa falha de upload/download |

### F. CI/CD Integration

#### GitHub Actions (`/.github/workflows/ci.yml`)
- **Status:** ✅ Configurado
- **Jobs:** install → lint → type-check → test → build
- **Database:** PostgreSQL 16 via service container
- **Env vars:** Todas as variáveis de ambiente mockadas para teste
- **Problemas:**
  1. Não há step de **coverage report** (nenhum `--coverage` no `npm test`)
  2. Não há **cache de build** do Next.js antes dos testes
  3. Não há **flaky test detection** (retry, analytics)
  4. Não há **test splitting** (todos os testes rodam em sequência)

#### Scripts de Teste (`package.json`)
```json
"test": "vitest run --config config/vitest.config.ts --passWithNoTests"
```
- **Problema:** `--passWithNoTests` mascara a ausência de testes em módulos
- **Recomendação:** Remover `--passWithNoTests` e adicionar flag `--coverage`

#### Coverage
- **Status:** ❌ Não configurado
- **Ferramenta:** Nenhuma (`@vitest/coverage-v8` não instalada)
- **Recomendação:** Instalar `@vitest/coverage-v8` e configurar threshold mínimo (ex: 60% branches, 50% functions)

---

## 6. Plano de Testes Recomendado (Prioridades)

### Fase 1 — Segurança & Critical Path (Semanas 1-2)

| Prioridade | Tarefa | Estimativa |
|:----------:|--------|:----------:|
| P0 | Implementar testes de middleware (`middleware.ts`) — validar redirecionamento de rotas não autenticadas | 1 dia |
| P0 | Implementar testes de `src/server/auth/session.ts` — cookie inválido, expirado, tampered | 1 dia |
| P0 | Implementar testes de rate limiting (`src/lib/rate-limit.ts`, `src/lib/with-rate-limit.ts`) | 1 dia |
| P0 | Adicionar testes de workspace isolation em TODAS as API routes de mutation (PUT/DELETE/POST) | 3 dias |
| P0 | Testar auth bypass scenarios em `/api/auth/[...all]` | 2 dias |

### Fase 2 — Cobertura de API Routes (Semanas 3-4)

| Prioridade | Tarefa | Estimativa |
|:----------:|--------|:----------:|
| P1 | Testar rotas de Campaign: `GET/PUT/DELETE /api/campaigns/[id]` | 2 dias |
| P1 | Testar rotas de Asset: presign, preflight | 1 dia |
| P1 | Testar rotas de Plan: `POST /api/campaigns/[id]/plan` | 1 dia |
| P1 | Testar rotas de Diagnosis: `POST /api/campaigns/[id]/diagnosis/*` | 1 dia |
| P1 | Testar rotas de Export/Zip | 1 dia |
| P1 | Testar rotas de User: account, onboarding, locale | 1 dia |
| P1 | Testar rotas de Workspace: brand-kit, members, invites | 2 dias |

### Fase 3 — E2E com Playwright (Semanas 5-6)

| Prioridade | Tarefa | Estimativa |
|:----------:|--------|:----------:|
| P1 | Configurar Playwright com autenticação automática | 2 dias |
| P1 | Criar teste E2E do fluxo crítico: Signup → Create Campaign → Upload → Generate → Approve → Export | 3 dias |
| P2 | Criar teste E2E de billing: Subscribe → Generate → Verify credits deducted | 2 dias |
| P2 | Criar teste E2E de restyling: Upload base + style → Generate | 2 dias |

### Fase 4 — Qualidade & Refatoração de Testes (Semana 7)

| Prioridade | Tarefa | Estimativa |
|:----------:|--------|:----------:|
| P2 | Substituir mocks de Drizzle em repository tests por testes com banco SQLite/PostgreSQL de teste | 3 dias |
| P2 | Criar factories de teste (`tests/factories/`) | 2 dias |
| P2 | Refatorar testes de prompt builder para testar estrutura em vez de strings | 1 dia |
| P2 | Remover placeholder tests (`image-analysis.test.ts`) | 0.5 dia |
| P2 | Importar schemas reais em `schemas.test.ts` | 0.5 dia |

### Fase 5 — CI/CD & Métricas (Semana 8)

| Prioridade | Tarefa | Estimativa |
|:----------:|--------|:----------:|
| P2 | Instalar `@vitest/coverage-v8` e configurar thresholds | 1 dia |
| P2 | Adicionar step de coverage report no GitHub Actions | 0.5 dia |
| P2 | Configurar flaky test detection (retry automático no CI) | 0.5 dia |
| P2 | Adicionar testes de performance (latência de API crítica) | 1 dia |

---

## 7. Métricas de Estimativa

| Métrica | Valor Atual | Meta Recomendada |
|---------|:-----------:|:----------------:|
| Arquivos de código-fonte (ts/tsx) | 265 | — |
| Arquivos de teste | 51 | 120+ |
| API routes com testes | 16 / 48 (33%) | 40 / 48 (83%) |
| Repositories com testes | 6 / 16 (37%) | 14 / 16 (88%) |
| React hooks com testes | 5 / 24 (21%) | 18 / 24 (75%) |
| React components com testes | 4 / 52 (8%) | 30 / 52 (58%) |
| AI modules com testes | 5 / 8 (62%) | 8 / 8 (100%) |
| Testes E2E | 0 | 10+ fluxos |
| Testes de segurança | 0 | 15+ cenários |
| Cobertura de código estimada | ~25-30% | 70%+ |
| CI com coverage | ❌ | ✅ |
| Factories/Fixtures | ❌ | ✅ |

---

## 8. Conclusão

A estratégia de testes do ADScale_2 possui uma **base sólida** em áreas específicas (billing, AI layer, algumas API routes), mas apresenta **gaps críticos** em:

1. **Segurança e isolamento multi-tenant** — o maior risco de regressão
2. **Cobertura de API routes** — apenas 33% das rotas têm testes
3. **Testes E2E** — zero cobertura de fluxos críticos de usuário
4. **Qualidade de mocks** — testes de repositório testam implementação, não comportamento
5. **CI/CD** — ausência de coverage reports e flaky test detection

A prioridade imediata deve ser a **Fase 1 (Segurança)**, seguida pela **Fase 2 (API Routes)**. A implementação de E2E com Playwright é essencial para garantir que fluxos críticos de geração de criativos e pagamento não quebrem em produção.
