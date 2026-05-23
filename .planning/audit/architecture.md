# Auditoria de Arquitetura & DDD — ADScale_2

**Data:** 2026-05-23  
**Auditor:** Subagente autônomo de arquitetura  
**Scope:** `app/src/server/**/*.ts`, `app/src/app/api/**`, `app/src/components/**`, `app/src/lib/**`  
**Método:** Análise de acoplamento, coesão, separation of concerns e padrões DDD

---

## Resumo Executivo

**Nota Geral: 3.4 / 5.0**

A arquitetura do ADScale_2 demonstra boas intenções com DDD — repositories bem separados, camada de AI isolada, e domain boundaries claros. No entanto, há degradação significativa na camada API (routes contêm lógica de negócio) e acoplamento excessivo entre billing/campaigns/AI. A testabilidade é um ponto forte.

---

## Matriz de Qualidade Arquitetural (1–5)

| Dimensão | Nota | Justificativa |
|----------|------|---------------|
| Separation of Concerns | 3.0 | API routes misturam controller + service + repository |
| DDD Pattern Compliance | 2.0 | Sem Domain Services, sem Domain Events, repositories sem interface |
| Coupling & Cohesion | 3.0 | Acoplamento billing→campaign→ai; ALLOWED_TYPES duplicado |
| API Design | 4.0 | RESTful consistente, naming claro, mas sem versioning |
| Data Flow | 4.0 | TanStack Query bem usado; mutations com optimistic updates |
| Scalability Readiness | 3.0 | Inngest usado mas sem batching; DB sem sharding strategy |
| Maintainability | 3.0 | God components, duplicação, falta de barrel exports |
| Testability | 4.0 | Repositories testáveis, mocks bem estruturados |
| Security | 4.0 | Workspace isolation presente, mas falhas pontuais |
| Observability | 4.0 | Pino + Sentry, mas métricas de negócio limitadas |
| **Média** | **3.4 / 5.0** | |

---

## A. Separation of Concerns

### A1. API Routes como "God Controllers" (HIGH)
- **Problema:** API routes contêm validação Zod + lógica de negócio + chamadas diretas a repositories + formatação de resposta
- **Exemplo:** `app/src/app/api/campaigns/route.ts` tem ~200 linhas fazendo tudo
- **Impacto:** Difícil testar, difícil reutilizar, violação SRP
- **Recomendação:** Extrair "Application Services":
  ```ts
  // campaigns/service.ts
  export async function createCampaign(data: CreateCampaignInput, userId: string) {
    // toda a lógica aqui
  }
  
  // api/campaigns/route.ts
  export async function POST(req: Request) {
    const data = createCampaignSchema.parse(await req.json());
    const result = await createCampaign(data, session.user.id);
    return Response.json(result);
  }
  ```

### A2. AI Layer — acoplamento ao OpenAI (MEDIUM)
- **Problema:** Módulos AI importam `openai` diretamente; sem abstração de provider
- **Impacto:** Trocar para outro modelo (Claude, Gemini) requer mudanças em 13 arquivos
- **Recomendação:** Criar interface `ImageGenerator` com implementação `OpenAIImageGenerator`

### A3. UI Components com lógica de negócio (MEDIUM)
- **Problema:** `BriefingStep.tsx` (1.318 linhas) contém validação, state management, uploads, e chamadas API
- **Impacto:** Não reutilizável, difícil de testar
- **Recomendação:** Container/Presentational pattern ou Server Components

---

## B. DDD Patterns

### B1. Falta de Domain Services (HIGH)
- **Problema:** Lógica de domínio (ex: cálculo de créditos, regras de plano) espalhada em repositories e API routes
- **Impacto:** Duplicação, inconsistência
- **Recomendação:**
  ```ts
  // server/domain/credit-calculator.ts
  export class CreditCalculator {
    static calculateGenerationCost(plan: Plan, count: number): number { ... }
  }
  ```

### B2. Repositories sem Interface (MEDIUM)
- **Problema:** Repositories são classes/funções diretas, sem contrato
- **Impacto:** Impossível mockar para tests sem monkey-patching
- **Recomendação:**
  ```ts
  export interface ICampaignRepository {
    findById(id: string): Promise<Campaign | null>;
    create(data: CreateCampaignInput): Promise<Campaign>;
    // ...
  }
  ```

### B3. Sem Domain Events (MEDIUM)
- **Problema:** Fluxos cross-cutting (billing→campaign→notification) são acoplados diretamente
- **Impacto:** Difícil estender, difícil observar
- **Recomendação:** Implementar event bus simples:
  ```ts
  // Após criação de campanha
  eventBus.publish(new CampaignCreatedEvent(campaign));
  // Billing subscriber consome e debita créditos
  ```

### B4. Value Objects não utilizados (LOW)
- **Problema:** Primitivos espalhados (string para IDs, números para créditos)
- **Impacto:** Type safety reduzida, validação duplicada
- **Recomendação:** `CampaignId`, `CreditAmount`, `Email` como branded types

---

## C. Coupling & Cohesion

### C1. Heat Map de Acoplamento

```
          Auth  Billing  Campaign  AI   Storage  Workspace
Auth       -     HIGH    MEDIUM   LOW   LOW      HIGH
Billing   HIGH    -      HIGH     LOW   LOW      MEDIUM
Campaign  MEDIUM HIGH     -       HIGH  MEDIUM   HIGH
AI        LOW   LOW      HIGH      -    HIGH     LOW
Storage   LOW   LOW      MEDIUM   HIGH   -       LOW
Workspace HIGH  MEDIUM   HIGH     LOW   LOW       -
```

### C2. Circular Dependencies (MEDIUM)
- **campaign → billing → campaign** via credit deduction
- **campaign → ai → campaign** via generation pipeline
- **Recomendação:** Introduzir Domain Events para desacoplar

### C3. God Objects (HIGH)
- `Campaign` entity carrega: assets, derivations, plan, diagnosis, competitors, billing info
- **Recomendação:** Lazy loading ou Aggregate Roots menores

---

## D. API Design

### D1. Consistência (GOOD)
- Naming conventions consistentes: `/api/campaigns`, `/api/derivations/[id]`
- Métodos HTTP usados corretamente
- Error responses padronizadas

### D2. Versioning (MISSING)
- **Problema:** Sem versionamento de API
- **Impacto:** Breaking changes afetam clientes mobile/terceiros
- **Recomendação:** `/api/v1/campaigns` ou header `Accept: application/vnd.adscale.v1+json`

### D3. Rate Limiting & Throttling (PARTIAL)
- Presente em mutações, ausente em GETs
- Falta headers de rate limit (`X-RateLimit-Remaining`)

---

## E. Data Flow

### E1. Server → Client (GOOD)
- TanStack Query bem configurado
- Invalidação de cache explícita em mutations

### E2. Optimistic Updates (PARTIAL)
- Presentes em algumas mutations (campaign create)
- Ausentes em outras (derivation generation)
- **Recomendação:** Padronizar pattern de optimistic update

### E3. Event-Driven (PARTIAL)
- Inngest usado para jobs de geração
- Mas eventos de domínio não existem (CampaignCreated, CreditDeducted)

---

## F. Scalability Patterns

### F1. Stateless Design (GOOD)
- Next.js API routes são stateless
- Sessão em cookie/JWT

### F2. Database Scaling (CONCERN)
- PostgreSQL single instance
- Sem read replicas
- Sem connection pooling explícito
- **Recomendação:** PgBouncer ou similar para alta carga

### F3. Job Queue (GOOD)
- Inngest fornece retries, delays, scheduling
- Mas sem batching (1 evento por derivação)

---

## ADRs Recomendados

| # | ADR | Motivação |
|---|-----|-----------|
| 1 | **Domain Services** | Centralizar lógica de negócio |
| 2 | **Repository Interfaces** | Desacoplar de implementação |
| 3 | **Domain Events** | Desacoplar billing/campaign/notification |
| 4 | **API Versioning** | Permitir evolução sem breaking changes |
| 5 | **Feature Colocation** | Agrupar por feature ao invés de layer |
| 6 | **Rate Limiting Strategy** | Padronizar proteção em todas as routes |

---

## Top 5 Refatorações Arquiteturais

| # | Refatoração | Impacto | Esforço |
|---|-------------|---------|---------|
| 1 | Extrair Application Services das API routes | Alto | 2-3 dias |
| 2 | Introduzir Domain Events | Alto | 2 dias |
| 3 | Criar interfaces para repositories | Médio | 1 dia |
| 4 | Decompor `BriefingStep.tsx` | Alto | 1-2 dias |
| 5 | Abstrair AI provider (OpenAI → interface) | Médio | 1 dia |

---

## Dependency Graph Textual

```
app/
├── app/api/*           → server/repositories/*, server/ai/*, server/auth/*
├── components/*        → lib/hooks/*, lib/store.ts
├── lib/hooks/*         → lib/api-client.ts
├── lib/api-client.ts   → (browser fetch)
├── server/auth/*       → server/db/*
├── server/repositories/* → server/db/*, server/billing/* (parcial)
├── server/ai/*         → openai SDK, server/storage/*
├── server/jobs/*       → server/ai/*, server/repositories/*
├── server/billing/*    → stripe SDK, server/repositories/*
├── server/storage/*    → aws-sdk, (sem singleton!)
└── server/db/*         → drizzle-orm, pg
```

**Caminhos críticos:**
- `API Route → Repository → DB` (ok)
- `API Route → Repository → Billing → Stripe` (acoplado)
- `Job → AI → Storage → R2` (ok, mas sem batching)
- `Component → Hook → API → Repository → Billing` (cadeia longa)
