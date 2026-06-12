# Phase 107 Verification

**Verified:** 2026-06-12

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Recomendação contextual baseada em aprendizados canônicos | PASS | `getNextExperimentRecommendation` + `GET /api/campaigns/[id]/recommendation` |
| 2 | Justificativa, evidências, contradições, amostra e confiança | PASS | `NextExperimentRecommendationCard` + recommendation types |
| 3 | Aceitar/editar/ignorar sem alteração automática de campanha/mídia/orçamento | PASS | UI copy + no server-side mutations on accept/dismiss |
| 4 | Aceitar abre fluxo existente com prefill editável | PASS | `openDerivePanel` + `StrategyRecipePanel.initialPrefill` |
| 5 | Eventos first-party view/accept/edit/dismiss | PASS | `next_experiment_*` keys in `BETA_EVENT_KEYS` |

## Requirements

| ID | Status |
|----|--------|
| NEXT-01 | Complete |
| NEXT-02 | Complete |
| NEXT-03 | Complete |
| NEXT-04 | Complete |

## Automated Checks

- `npm test` — 1174 passed (1 skipped)
- `npm run build` — OK

## Manual UAT (recommended)

1. Campanha com perfil de cliente + aprendizados aprovados → card "Próximo experimento sugerido" aparece acima do painel de memória.
2. Aceitar → abre Strategy Recipe com CTA/receita/formato pré-preenchidos e editáveis.
3. Ignorar → card some na sessão; evento `next_experiment_dismissed` registrado.
4. Sem aprendizados → card não renderiza (status `insufficient_evidence`).

## Phase 108 Blockers

1. **Prior phases uncommitted:** Phases 104–106 implementation files remain unstaged on `main` alongside 107 — Phase 108 release gate should land on a branch that includes the full v12.1 stack.
2. **Migrations:** Apply `0038`–`0040` in target environment before UAT.
3. **Lint:** `npm run lint` not re-run this session — include in Phase 108 gate (QA-13).
4. **Browser UAT:** QA-13 requires end-to-end import → comparison → memory → recommendation → editable prefill with representative data.
