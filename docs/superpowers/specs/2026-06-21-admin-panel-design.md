# Design: Painel Administrativo da Plataforma

**Data:** 2026-06-21  
**Status:** Aprovado (brainstorming)  
**Repo:** `ADScale_2` (app)

---

## 1. Objetivo

Transformar o painel de feedbacks (`/feedback`) — hoje uma página longa e restrita ao platform owner — em um **hub administrativo completo** (`/admin`) com sidebar fixa, dashboard de KPIs, gestão de usuários/workspaces e reorganização das ferramentas de qualidade e operações já existentes.

O painel é **privado**, acessível apenas por URL direta (sem link na navegação principal), exclusivo para o dono da plataforma (`PLATFORM_OWNER_EMAILS` / `DEV_ADMIN_EMAIL`).

---

## 2. Decisões de produto

| Tópico | Decisão |
|--------|---------|
| Escopo | Reorganizar o existente **e** expandir com novas capacidades |
| Prioridades v1 | **A)** Usuários e workspaces · **D)** Qualidade e conteúdo (núcleo) |
| Controle de contas | Total: créditos, plano, desbloqueio, reset de onboarding, edição direta |
| Impersonação | Espelho **read-only** — snapshot server-side, sem criar sessão do usuário |
| Navegação | Sidebar fixa com agrupamentos |
| Home padrão | Dashboard com KPIs e atalhos |
| Descoberta | Só URL direta `/admin` — sem link na TopBar nem no menu do avatar |
| Auth para não-owner | **404** (não 403) para não revelar existência do painel |
| APIs existentes | `/api/feedback/*` permanecem em v1; renomear para `/api/admin/*` fica como débito futuro |
| Mobile | Desktop operacional é suficiente em v1 |

### Fora de escopo (v1)

- Link na navegação principal ou dropdown do avatar
- Impersonação com sessão real (login como usuário)
- Billing Stripe sync manual (leitura + override local de plano/créditos apenas)
- Feature flags, saúde de sistema, logs Sentry embutidos
- Renomeação em massa de rotas `/api/feedback/*`
- Gráficos complexos no dashboard (números + atalhos apenas)

---

## 3. Abordagem arquitetural

**Escolhida:** Admin shell com rotas dedicadas (Approach 1).

Nova route group `(admin)` com layout `AdminShell` (sidebar + área de conteúdo). Cada seção é uma subrota. Componentes existentes são reutilizados; o refactor principal é desacoplar o `HumanQualityCorpusPanel` (~2.600 linhas) em views por rota.

**Alternativas descartadas:**

| Abordagem | Motivo da rejeição |
|-----------|-------------------|
| Evolução incremental com `/feedback` coexistindo | URLs duplicadas, UX inconsistente durante transição |
| Monólito com tabs client-side sem rotas | Sem deep links, página pesada, difícil de manter |

---

## 4. Mapa de rotas

```
/admin                          → Dashboard (KPIs + atenção)
/admin/users                    → Busca e listagem de usuários
/admin/users/[id]               → Detalhe, ações e espelho read-only
/admin/workspaces/[id]          → Detalhe do workspace
/admin/quality                  → Redirect → /admin/quality/queue
/admin/quality/queue            → Fila do corpus (avaliação humana)
/admin/quality/candidates       → Candidatos globais
/admin/quality/calibration      → Calibração
/admin/quality/impact           → Impacto de aprendizado
/admin/quality/reports            → Quality improvement rollup
/admin/quality/coverage           → Sample coverage (global only)
/admin/quality/trends             → Quality trend dashboard
/admin/feedbacks                  → Triagem de feedbacks beta
/admin/analytics                  → Funis, créditos, export CSV
/admin/sessions                   → Sessões beta e runbook
```

**Redirect:** `/feedback` → `/admin/feedbacks` (301 permanente).

### Sidebar (4 blocos)

1. **Visão geral** — Dashboard
2. **Plataforma** — Usuários
3. **Qualidade** — Queue, Candidates, Calibration, Impact, Reports, Coverage, Trends
4. **Operações** — Feedbacks, Analytics, Sessions

---

## 5. Dashboard (`/admin`)

### API

`GET /api/admin/dashboard/summary` — `requirePlatformOwner`

### KPIs (cards clicáveis)

| KPI | Fonte de dados | Link ao clicar |
|-----|----------------|----------------|
| Usuários ativos (7d) | Sessões válidas ou login nos últimos 7 dias | `/admin/users?active=7d` |
| Feedbacks pendentes | `feedback_reports` com `status IN ('new', 'reviewing')` | `/admin/feedbacks?status=new` |
| Fila do corpus | `totalPending` do progress global (API existente de human-quality) | `/admin/quality/queue` |
| Derivações com falha (24h) | `derivations` com status failed nas últimas 24h | Lista futura ou link externo Sentry |

### Seção "Requer atenção"

Lista compacta (máx. 5 itens por categoria):

- Feedbacks críticos recentes (`severity = critical`)
- Usuários com créditos zerados
- Itens do corpus pendentes há mais de 7 dias

Cada item linka para a seção completa correspondente.

---

## 6. Usuários e workspaces

### Listagem (`/admin/users`)

**API:** `GET /api/admin/users?search=&page=&active=&credits=zero&onboarding=incomplete`

Tabela paginada:

| Coluna | Descrição |
|--------|-----------|
| Nome / email | Do `user` |
| Workspace principal | Primeiro membership por prioridade owner > admin > member |
| Plano | `billingPlanKey` do workspace |
| Créditos | Saldo restante |
| Criado em | `user.createdAt` |
| Última atividade | Última sessão ou ação relevante |

Filtros rápidos: ativos 7d, créditos zerados, onboarding incompleto, email não verificado.

### Detalhe do usuário (`/admin/users/[id]`)

Layout duas colunas (desktop):

**Esquerda — dados e ações**

- Perfil: nome, email, locale, verificado, onboarding, datas
- Workspaces: memberships com role
- Billing por workspace: plano, créditos, status Stripe (leitura)
- Atividade: campanhas, derivações recentes, último login

**Direita — espelho read-only**

Componente `UserMirrorPanel` com banner fixo: *"Visualização admin — read-only"*.

Snapshot server-side do que o usuário veria:

- Dashboard: campanhas recentes, créditos, missões
- Lista de campanhas: títulos, status, contagem de derivações

**API:** `GET /api/admin/users/[id]/mirror`

Sem troca de token/sessão. Links no espelho desabilitados ou abrem em nova aba com aviso.

### Workspace (`/admin/workspaces/[id]`)

- Membros, campanhas, consumo de créditos
- Mesmas ações de billing no nível do workspace
- Acessível pelo detalhe do usuário ou busca direta

### Ações administrativas

Todas exigem confirmação + campo `reason` obrigatório.

| Ação | Efeito |
|------|--------|
| Ajustar créditos | `+/-` no saldo do workspace |
| Alterar plano | Override manual de `billingPlanKey` |
| Verificar email | `emailVerified = true` |
| Resetar onboarding | `onboardingCompletedAt = null` |
| Desbloquear trial | Limpa flags de notificação bloqueantes |

**API:** `PATCH /api/admin/users/[id]` e `PATCH /api/admin/workspaces/[id]`

### Audit log

Nova tabela `admin_audit_log`:

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `actorEmail` | text | Email do platform owner |
| `action` | text | ex. `credits.adjust`, `plan.override` |
| `targetType` | text | `user` \| `workspace` |
| `targetId` | text | ID do alvo |
| `payload` | jsonb | Valores antes/depois |
| `reason` | text | Motivo obrigatório |
| `status` | text | `success` \| `failed` |
| `createdAt` | timestamp | |

Toda ação de escrita gera registro. Falhas também (`status: failed`).

---

## 7. Migração de qualidade

### Refactor do `HumanQualityCorpusPanel`

1. Extrair cada tab em componente próprio:
   - `CorpusQueueView` (tab Queue)
   - `CorpusCandidatesView` (tab Candidates)
   - `CalibrationView` (tab Calibration)
   - `ImpactView` (tab Impact)
   - `QualityReportsView` (tab Quality → rota `/reports`)
   - `CoverageView` (tab Coverage)
   - `TrendView` (tab Trend)
2. Estado compartilhado (scope global/workspace, filtros cohort) via URL search params: `?scope=global&cohort=cenbrap`
3. Layout compartilhado `admin/quality/layout.tsx`:
   - Toggle Global / Workspace
   - Campo Workspace ID (modo workspace)
   - Filtro de cohort
   - Breadcrumb

### Mapeamento tab → rota

| Tab atual | Rota admin |
|-----------|------------|
| Queue | `/admin/quality/queue` |
| Candidates | `/admin/quality/candidates` |
| Calibration | `/admin/quality/calibration` |
| Impact | `/admin/quality/impact` |
| Quality | `/admin/quality/reports` |
| Coverage | `/admin/quality/coverage` |
| Trend | `/admin/quality/trends` |

Comportamento e APIs existentes permanecem inalterados; apenas a composição UI muda.

---

## 8. Migração de operações

| Rota admin | Componente origem | Mudança |
|------------|-------------------|---------|
| `/admin/feedbacks` | `feedback/page.tsx` (grid triage) | Move integralmente |
| `/admin/analytics` | `OwnerAnalyticsPanel` | **Remove** `HumanQualityCorpusPanel` embutido no final |
| `/admin/sessions` | `BetaSessionsPanel` | Move integralmente |

Após migração:

- `app/src/app/(dashboard)/feedback/page.tsx` removido
- `/feedback` redireciona para `/admin/feedbacks`

---

## 9. Auth e segurança

### Gate de acesso

```typescript
// (admin)/layout.tsx — server component
const session = await getSession();
if (!session?.user?.email || !isPlatformOwnerEmail(session.user.email)) {
  notFound(); // 404, não 403
}
```

### Novas APIs (`/api/admin/*`)

Todas usam `requirePlatformOwner(request)`.

### Espelho read-only

Mesmas regras de sanitização do feedback:

- Sem tokens, senhas, prompts completos, raw request bodies
- Apenas dados que o próprio usuário veria no app

### Ações destrutivas

Dialog de confirmação com resumo do que será alterado antes de executar.

---

## 10. Tratamento de erros e UX

- Estados loading / error / empty consistentes (`PageFrame`, `Panel`)
- Falha em ação de escrita: toast de erro + audit log com `status: failed`
- Páginas admin usam layout operacional (`width="operational"`) como o feedback atual
- i18n: chaves em `messages/pt-BR.json` e `messages/en.json` sob namespace `admin.*`

---

## 11. Testes mínimos

| Área | Casos |
|------|-------|
| Auth gate | Layout 404 para não-owner; APIs admin 403 |
| Dashboard | Agregações corretas com fixtures |
| User search | Busca por email parcial e exata |
| Mirror | Não expõe campos proibidos (prompt, tokens) |
| Audit log | Toda ação de escrita gera registro com reason |
| Redirect | `/feedback` → `/admin/feedbacks` |
| Corpus refactor | Testes existentes (`HumanQualityCorpusPanel.test.tsx`, `OwnerAnalyticsPanel.test.tsx`) passam nos componentes extraídos |

---

## 12. Arquivos principais (novos e modificados)

### Novos

```
app/src/app/(admin)/layout.tsx
app/src/app/(admin)/admin/page.tsx
app/src/app/(admin)/admin/users/page.tsx
app/src/app/(admin)/admin/users/[id]/page.tsx
app/src/app/(admin)/admin/workspaces/[id]/page.tsx
app/src/app/(admin)/admin/quality/layout.tsx
app/src/app/(admin)/admin/quality/queue/page.tsx
app/src/app/(admin)/admin/quality/candidates/page.tsx
app/src/app/(admin)/admin/quality/calibration/page.tsx
app/src/app/(admin)/admin/quality/impact/page.tsx
app/src/app/(admin)/admin/quality/reports/page.tsx
app/src/app/(admin)/admin/quality/coverage/page.tsx
app/src/app/(admin)/admin/quality/trends/page.tsx
app/src/app/(admin)/admin/feedbacks/page.tsx
app/src/app/(admin)/admin/analytics/page.tsx
app/src/app/(admin)/admin/sessions/page.tsx
app/src/components/admin/AdminShell.tsx
app/src/components/admin/AdminSidebar.tsx
app/src/components/admin/DashboardSummary.tsx
app/src/components/admin/UserMirrorPanel.tsx
app/src/components/admin/UserActionsPanel.tsx
app/src/app/api/admin/dashboard/summary/route.ts
app/src/app/api/admin/users/route.ts
app/src/app/api/admin/users/[id]/route.ts
app/src/app/api/admin/users/[id]/mirror/route.ts
app/src/app/api/admin/workspaces/[id]/route.ts
app/drizzle/XXXX_admin_audit_log.sql
app/src/server/repositories/admin-audit.ts
app/src/server/repositories/admin-users.ts
```

### Modificados

```
app/src/components/feedback/HumanQualityCorpusPanel.tsx  → extrair views
app/src/components/feedback/OwnerAnalyticsPanel.tsx    → remover corpus embutido
app/messages/pt-BR.json, app/messages/en.json          → namespace admin.*
```

### Removidos

```
app/src/app/(dashboard)/feedback/page.tsx  → após migração
```

---

## 13. Ordem de implementação sugerida

1. **Infra admin** — `(admin)` layout, `AdminShell`, auth gate 404, redirect `/feedback`
2. **Dashboard** — API summary + página com KPIs
3. **Migração operações** — feedbacks, analytics, sessions (mover componentes existentes)
4. **Refactor qualidade** — extrair tabs, rotas `/admin/quality/*`
5. **Usuários** — listagem, detalhe, mirror, audit log, ações de escrita
6. **Testes e i18n** — cobertura mínima e traduções

Cada fase entrega software utilizável de forma independente.

---

## 14. Diagrama

```
┌─────────────────────────────────────────────────────────┐
│  AdminShell (sidebar fixa)                              │
│  ┌──────────┐  ┌──────────────────────────────────────┐ │
│  │ Dashboard│  │  Conteúdo da rota ativa              │ │
│  │ Usuários │  │                                      │ │
│  │ Qualidade│  │  /admin/users/[id]                   │ │
│  │  Queue   │  │  ┌─────────────┬──────────────────┐ │ │
│  │  ...     │  │  │ Ações +     │ UserMirrorPanel  │ │ │
│  │ Operações│  │  │ billing     │ (read-only)      │ │ │
│  │  Feedbacks│ │  └─────────────┴──────────────────┘ │ │
│  └──────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         ▼
  requirePlatformOwner (APIs)
  isPlatformOwnerEmail (layout → 404)
  admin_audit_log (ações de escrita)
```

---

## 15. Referências no codebase

| Artefato atual | Caminho |
|----------------|---------|
| Página feedback | `app/src/app/(dashboard)/feedback/page.tsx` |
| Corpus panel | `app/src/components/feedback/HumanQualityCorpusPanel.tsx` |
| Analytics panel | `app/src/components/feedback/OwnerAnalyticsPanel.tsx` |
| Beta sessions | `app/src/components/feedback/BetaSessionsPanel.tsx` |
| Platform owner auth | `app/src/server/auth/platform-owner.ts` |
| Dev admin | `app/src/server/auth/dev-admin.ts` |
