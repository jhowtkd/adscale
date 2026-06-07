# Phase 85: Cockpit Instrumentation - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Discuss mode:** Defaults aplicados (perguntas puladas — recomendações da pesquisa v11.10)

<domain>
## Phase Boundary

Esta fase entrega **COCK-01..05**: instrumentação de eventos cockpit (receita, briefing, preview), agregação correspondente em `aggregate.ts`, e exibição mínima no `OwnerAnalyticsPanel` para o funil de receita e abandono por etapa do briefing.

**Dentro do escopo:** extensão do allowlist em `types.ts`, emissão client-side via `useRecordBetaEvent`, agregadores puros, tabelas `FunnelTable` para receita e briefing, fix F-06 no preview (revisar receita ≠ abandonar).

**Fora do escopo (outras fases):** override de readiness (86), timeline sem cap / funil créditos / filtro sessão (87), regressão F-14 (88), SESS-03 (89), emit server-side no runbook manual (adiado).

</domain>

<decisions>
## Implementation Decisions

### recipe_tradeoff_viewed (COCK-01 / F-08)
- Disparar **uma vez por abertura do modal** de receita (`open=true`), junto com `cockpit_stage_entered`.
- Tradeoff já é visível inline em cada card — não exige scroll nem expand separado.
- Usar `useRef` guard (`tradeoffViewedRef`) para evitar duplicata no mesmo ciclo de abertura.

### recipe_selected (COCK-02 / F-09)
- Disparar **no clique do card** de receita, **antes** de `cockpit_stage_completed`.
- Incluir `recipeId` nas properties (valor de `STRATEGY_RECIPE_IDS`).
- Não re-disparar em re-render — apenas no handler `onClick`.

### Funil de receita no dashboard (COCK-03)
- Entregar **aggregate + tabela** nesta fase (não adiar UI para fase 87).
- Reutilizar `FunnelTable` existente no `OwnerAnalyticsPanel`.
- Colunas: Recipe, Tradeoff viewed, Selected, Rate (selected/viewed).
- Dados via `aggregateRecipeFunnel` em `buildAnalyticsFunnelSummary`.

### Preview funnel F-06 (COCK-04)
- **Remover** `cockpit_stage_abandoned` de `handleReviseRecipe` — revisar receita é iteração, não abandono.
- `cockpit_stage_completed` continua apenas em `handleApproveBatch`.
- **Não incluir** emit server-side no runbook de sessão beta nesta fase (escopo adiado).

### Briefing abandon por step (COCK-05 / F-12)
- Enriquecer `cockpit_stage_abandoned` com propriedade **`stepId`** (não sobrescrever `stage`).
- `stepId` = `guided.currentStep` no momento do abandon (fallback `"unknown"`).
- Agregar via `aggregateGuidedBriefingAbandonByStep`; exibir tabela "Guided briefing abandon by step" no owner dashboard.

### Allowlist e ordem de implementação
- Estender `PHASE_76_BETA_EVENT_KEYS` e `ALLOWED_PROPERTY_KEYS` (`recipeId`, `stepId`) **no mesmo commit** que o primeiro call site — senão ingest retorna 400 ou drop silencioso.
- Ordem: `types.ts` → painéis cockpit → `aggregate.ts` → testes → `OwnerAnalyticsPanel`.

### i18n
- Strings novas do dashboard owner em **PT-BR e EN** (`messages/pt-BR.json`, `messages/en.json`).
- Evitar títulos hardcoded em inglês no painel owner.

### Claude's Discretion
- Nome exato das chaves i18n para tabelas de funil.
- Layout grid (1 vs 2 colunas) para recipe + briefing tables no owner panel.
- Debounce fino em unmount abandon (padrão `completedRef` existente é suficiente).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useRecordBetaEvent(campaignId)` — hook padrão para eventos client-side cockpit.
- `PHASE_76_BETA_EVENT_KEYS` + `ALLOWED_PROPERTY_KEYS` em `types.ts` — gate único de ingest.
- `aggregateRecipeFunnel`, `aggregateGuidedBriefingAbandonByStep` em `aggregate.ts` — já previstos no contrato de funnel.
- `FunnelTable` em `OwnerAnalyticsPanel.tsx` — shell para novas tabelas.
- `completedRef` / `tradeoffViewedRef` em painéis — padrão anti-ghost-abandon.

### Established Patterns
- `STAGE_PROPS = { stage, missionKey }` constante por painel.
- `cockpit_stage_entered` no mount/open; `completed` no sucesso; `abandoned` só em saída real sem conclusão.
- Testes Vitest mockam `useRecordBetaEvent` e assertam ordem event → callback.

### Integration Points
- `StrategyRecipePanel.tsx` — receita + tradeoff + selected.
- `GuidedBriefingPanel.tsx` — briefing step abandon.
- `PreviewGatePanel.tsx` — fix F-06 revise path.
- `OwnerAnalyticsPanel.tsx` + API funnel — exibição COCK-03/05.
- `instrumentation.integration.test.ts` — casos de ingest para novos event keys.

### Estado do working tree (2026-06-07)
Implementação parcial já alinhada a estas decisões existe no working tree (types, painéis, aggregate, testes). Planner deve **verificar gaps** vs COCK-01..05 antes de duplicar trabalho.

</code_context>

<specifics>
## Specific Ideas

- Q6 (tradeoff readership) responde com `recipe_tradeoff_viewed` por abertura do modal — tradeoffs já visíveis nos cards.
- Q4 (recipe selection) responde com `recipe_selected` + funil por `recipeId`.
- Q5 (preview funnel) responde removendo falso abandoned no revise.
- Q2 (briefing skip) responde com breakdown por `stepId` nos abandons.

</specifics>

<deferred>
## Deferred Ideas

- Emit `cockpit_stage_completed(preview)` no runbook server quando operador marca sessão completa manualmente — fase futura ou SESS-03 ops.
- IntersectionObserver para tradeoff (só se UX mudar para tradeoff colapsável).
- Filtro de sessão / timeline sem cap — **fase 87** (DASH-04..06).
- Readiness override — **fase 86**.

</deferred>

---

*Phase: 85-cockpit-instrumentation*
*Context gathered: 2026-06-07*
