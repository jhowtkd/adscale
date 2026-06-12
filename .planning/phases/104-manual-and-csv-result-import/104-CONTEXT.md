# Phase 104: Manual and CSV Result Import - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning
**Mode:** Autonomous (recommended defaults)

<domain>
## Phase Boundary

Entregar entrada manual e importação CSV de resultados de mídia no contexto de uma campanha, produzindo o mesmo contrato canônico de snapshots da Phase 103. Inclui mapeamento de colunas, opções de locale/moeda, preview com erros reparáveis, confirmação com contagens created/updated/ignored e histórico auditável de lotes.

Fora de escopo: hipóteses, comparação, memória, Mem0, APIs de plataformas de mídia e recomendações de próximo experimento.

</domain>

<decisions>
## Implementation Decisions

### Superfície de produto

- Entrada manual e importação CSV vivem em um painel **Resultados** dentro do workspace da campanha (`?tab=performance`), acessível após existirem derivações.
- Fluxo manual: formulário por linha com seleção de derivação, plataforma, placement, período, métricas e moeda; submissão cria um lote `manual` de uma linha.
- Fluxo CSV: upload → mapeamento de colunas → opções de parse → preview → confirmação.

### Mapeamento CSV

- Campos canônicos obrigatórios no mapeamento: `derivationId`, `platform`, `placementRaw`, `startDate`, `endDate`, `impressions`, `clicks`, `spend`, `conversions`, `conversionValue`, `currency`.
- Campos opcionais: `adAccountId`, `externalCampaignId`, `externalAdGroupId`, `externalAdId`, `sourceTimezone`.
- `derivationId` no CSV deve ser UUID válido da campanha; não inferir por nome nesta fase.
- Mapeamento é persistido no lote para auditoria e reimportação.

### Normalização numérica e locale

- Usuário informa: moeda padrão do lote, locale (`pt-BR`, `en-US`), separador decimal (`.` ou `,`), formato percentual (`fraction` 0.015 vs `percent` 1.5%).
- Separador de milhar é inferido quando decimal é `,` (`.` como milhar) ou ignorado quando decimal é `.`.
- Valores inválidos geram erro por campo na preview; linha inválida não persiste.

### Preview e confirmação

- Preview retorna por linha: `valid` | `invalid` com erros estruturados `{ field, message, rawValue? }`.
- Preview também simula upsert: `wouldCreate`, `wouldUpdate`, `wouldIgnore` (dados idênticos ao snapshot existente).
- Confirmação persiste apenas linhas válidas e retorna contagens finais + `batchId`.
- Repetir o mesmo arquivo (mesmo hash + mesmo mapeamento) é permitido; upsert por `sourceKey` evita duplicação de métricas.

### Histórico e lineage

- Cada importação gera um `performance_import_batch` com: tipo (`manual`|`csv`), nome/hash do arquivo, mapeamento, opções de parse, ator, contagens e timestamps.
- Cada linha processada gera `performance_import_row` com índice, status (`created`|`updated`|`ignored`|`invalid`), erros opcionais e `snapshotId` quando persistida.
- Histórico listável por campanha com drill-down do lote.

### Integração com Phase 103

- Toda persistência passa por `recordPerformanceSnapshot`; não duplicar lógica de upsert.
- `sourceType` é `manual` ou `csv`; escopo padrão `total` salvo indicação em contrário no CSV futuro.
- `sourceMetadata` inclui `importBatchId` e `importRowIndex` para rastreio.

### Claude's Discretion

- Parser CSV sem nova dependência (delimitador vírgula/ponto-e-vírgula, campos entre aspas).
- Layout visual do painel e textos i18n.
- Limite de tamanho de arquivo CSV (sugestão: 5 MB / 10k linhas).
- Detecção automática de delimitador na preview.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `recordPerformanceSnapshot` e `canonicalPerformanceSnapshotInputSchema` em `app/src/server/performance/`.
- `POST/GET /api/campaigns/[id]/performance` já autenticados e workspace-scoped.
- `getDerivationsByCampaign` para popular seletor de derivação.
- Padrões de upload em `PilotUploadPanel` e rotas `formData` para referência de UX.

### Established Patterns

- Zod na borda da API; erros via `apiError` / `PerformanceDomainError`.
- Drizzle migrations em `app/drizzle/`; repositórios workspace-scoped.
- Componentes de campanha com deep-link tabs em `deep-link-tab.ts`.

### Integration Points

- Novas rotas sob `/api/campaigns/[id]/performance/import/*`.
- Nova tab `performance` no deep-link da campanha.
- Tabelas `performance_import_batches` e `performance_import_rows` referenciando campanha/workspace.

</code_context>

<deferred>
## Deferred Ideas

- Resolver derivação por nome, variant index ou external ad ID no CSV — Phase 105+ se necessário.
- Importação agendada ou API de plataformas — fora do milestone.
- Edição em massa de snapshots já importados — backlog.

</deferred>

---

*Phase: 104-manual-and-csv-result-import*
*Context gathered: 2026-06-12 (autonomous)*
