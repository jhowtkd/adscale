# Phase 105: Creative Hypotheses and Variant Comparison - Context

**Gathered:** 2026-06-12
**Status:** Ready for execution
**Mode:** Autonomous (recommended defaults)

<domain>
## Phase Boundary

Transformar snapshots de performance importados (Phase 103–104) em experimentos interpretáveis: hipóteses criativas com variável principal, comparação honesta entre variantes e vereditos explícitos sem fabricar causalidade ou vencedores.

Fora de escopo: memória de cliente, Mem0, recomendações de próximo experimento, APIs de plataformas de mídia, otimização automática de budget.

</domain>

<decisions>
## Implementation Decisions

### Modelo de hipótese

- `creative_hypotheses`: campanha, variável principal (`variableKey`), métrica primária, direção esperada (`increase`|`decrease`), justificativa, tipo (`controlled_hypothesis`|`observational`), plataforma/período opcionais, outcome (`supported`|`contradicted`|`inconclusive`|null).
- `hypothesis_variants`: vínculo derivação ↔ hipótese com papel `control`|`variant`.
- `variant_comparisons`: resultado persistido com veredito, métricas agregadas por variante, exclusões e diferenças.

### Regras de comparabilidade (COMP-05)

Comparação permitida somente quando:
1. Todas as derivações pertencem à mesma campanha.
2. Snapshots compartilham a mesma `platform` (ou hipótese fixa plataforma compatível).
3. Períodos dos snapshots têm interseção não vazia dentro da janela da hipótese.
4. Campanha possui `objective` definido (contexto mínimo de objetivo).

Exclusões retornam `not_comparable` com razões estruturadas (`platform_mismatch`, `period_no_overlap`, `missing_objective`, `derivation_campaign_mismatch`, etc.).

### Motor de comparação (COMP-06, COMP-07)

- Agregar métricas brutas por derivação na janela comparável; derivar CTR/CPC/CPA/ROAS a partir dos totais.
- Exibir amostra (`impressions`, `clicks`), período efetivo, contexto (plataforma, objetivo) e diferença relativa vs controle.
- Vereditos: `winner` | `no_clear_winner` | `insufficient_evidence` | `not_comparable`.
- Evidência insuficiente: `impressions < 1000` ou denominador zero na métrica primária.
- Sem vencedor claro: diferença relativa < 5% entre melhor e segundo melhor quando métrica é comparável.
- Nunca inferir significância estatística ou causalidade.

### Outcome da hipótese (HYPO-03)

- `supported`: veredito `winner` alinhado à direção esperada.
- `contradicted`: veredito `winner` na direção oposta à esperada.
- `inconclusive`: `no_clear_winner`, `insufficient_evidence` ou `not_comparable`.

### Superfície de produto

- Painel **Hipóteses** no workspace da campanha (`?tab=hypotheses`), adjacente a Resultados de mídia.
- CRUD de hipóteses + botão "Comparar" que persiste `variant_comparisons` e atualiza outcome.
- Comparação observacional ad-hoc (duas+ derivações, métrica escolhida) sem hipótese formal — rotulada explicitamente.

### Claude's Discretion

- Limiares de amostra e empate (5%, 1000 impressões) como constantes documentadas.
- Layout visual e textos i18n mínimos em pt-BR inline.
- Métricas primárias suportadas: `ctr`, `cpc`, `cpa`, `roas`, `conversions`, `clicks`, `impressions`, `spend`, `conversion_value`.

</decisions>

<code_context>
## Existing Code Insights

- `creative_performance_snapshots` e `derivePerformanceMetrics` em `app/src/server/performance/`.
- `listPerformanceSnapshotsByCampaign` / `ByDerivation` no repositório de performance.
- Padrão API: `requireWorkspaceAccess`, Zod, `apiError`.
- `PerformanceImportPanel` e deep-link `performance` na página de campanha.

</code_context>
