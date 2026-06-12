# Phase 106: Client Performance Memory and Mem0 - Context

**Gathered:** 2026-06-12
**Status:** Executed
**Depends on:** Phase 105

## Phase Boundary

Consolidar padrões reutilizáveis por cliente a partir de comparações concluídas (hipóteses controladas) e projetar aprendizados aprovados no Mem0 para recuperação contextual. Postgres permanece canônico; Mem0 é projeção semântica não bloqueante.

Fora de escopo: recomendação de próximo experimento (Phase 107), decay de recência calibrado, benchmarks cross-client.

## Decisions

- Tabela `client_performance_learnings` com evidências favoráveis/contraditórias em JSONB, versão de algoritmo `1.0.0`, status e `mem0_memory_id`.
- Agregação determinística por `clientProfileId + variableKey + variableValue + primaryMetric`.
- Variáveis suportadas: `cta`, `format`, `recipe`, `style` (mapeadas de derivação/campanha).
- Confiança: `low` | `medium` | `high` com score numérico; aprovação automática quando suporte > contradição.
- Projeção Mem0 com `memoryType=performance_learning` e metadados `learningId`, `clientProfileId`, `algorithmVersion`.
- Recuperação: busca Mem0 → resolve linha Postgres antes de exibir.
- Recálculo disparado após comparação de hipótese e confirmação de importação CSV/manual.
