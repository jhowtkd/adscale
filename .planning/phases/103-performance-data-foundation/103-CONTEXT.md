# Phase 103: Performance Data Foundation - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar a fonte canônica, auditável e workspace-scoped de resultados de mídia vinculados às derivações do ADScale. A fase entrega contratos, schema/migração, cálculo determinístico das métricas derivadas, identidade de snapshots, repositórios/APIs fundamentais e fixtures.

Entrada manual e CSV pertencem à Phase 104; hipóteses e comparação à Phase 105; aprendizado e Mem0 à Phase 106. Phase 103 não cria telas de importação, recomendações, ranking de variantes nem projeções de memória.

</domain>

<decisions>
## Implementation Decisions

### Unidade canônica do registro

- Cada snapshot representa uma **derivação + plataforma + placement + período**.
- O período possui `startDate` e `endDate` inclusivos; rótulos relativos como `7d` ou apenas uma data final não substituem as datas reais.
- O timezone/fuso usado pela fonte dos dados deve ser registrado com o snapshot para preservar o dia comercial da conta de mídia.
- Snapshots diários e agregados podem coexistir desde que todos expressem explicitamente suas datas e escopo. A unidade canônica não obriga armazenamento exclusivamente diário.

### Plataforma, placement e conta

- Plataforma usa o canal principal (Meta, Google, TikTok ou equivalente suportado).
- Placement é dimensão canônica da identidade do snapshot.
- Placement deve guardar uma **categoria interna normalizada** para comparação e o **valor original da fonte** para auditoria e evolução da taxonomia.
- A taxonomia interna pode representar categorias como feed, stories/reels, search, display e outras definidas no planejamento; placements desconhecidos não devem perder o texto original.
- Conta de anúncio é opcional para não bloquear entrada manual ou fontes incompletas.
- Quando `adAccountId` é fornecido, ele participa da identidade do snapshot para impedir mistura silenciosa de contas diferentes.

### Períodos sobrepostos

- Snapshots do mesmo criativo/plataforma/placement podem possuir janelas sobrepostas.
- Janelas sobrepostas **nunca devem ser somadas automaticamente**, pois compartilhariam dias e duplicariam métricas.
- Sobreposição deve ser preservada para suportar snapshots acumulados, novas janelas de atribuição e atualizações naturais da fonte.
- Serviços futuros de comparação/agregação devem selecionar uma janela compatível ou explicitamente rejeitar a agregação; não podem inferir que snapshots sobrepostos são incrementais.

### Escopo parcial

- Um snapshot pode representar somente parte do tráfego da derivação.
- O escopo parcial deve ser explícito e auditável, podendo registrar dimensões/filtros como campanha externa, conjunto/grupo, país, placement detalhado ou outro segmento da fonte.
- Snapshot segmentado não pode ser apresentado ou agregado como total completo sem uma regra explícita de composição.
- A identidade e os metadados precisam permitir distinguir total, segmento e contexto de origem.

### Claude's Discretion

- Nome exato das tabelas, colunas, enums e tipos TypeScript, mantendo os conceitos e identidades definidos acima.
- Primeira taxonomia normalizada de placements e tratamento de categoria `other/unknown`.
- Representação do escopo parcial (colunas estruturadas mais metadados limitados), desde que continue consultável e auditável.
- Precisão dos tipos PostgreSQL `numeric`, formato interno de moeda e funções puras para CTR/CPC/CPA/ROAS.
- Contrato exato de erros e divisão entre repository/service/API, seguindo padrões existentes.
- Estratégia de fixtures e testes da fase, incluindo casos de período sobreposto, conta ausente/presente, placement desconhecido e escopo parcial.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/src/server/db/schema.ts`: schema Drizzle central com `adscale_app`, UUIDs, FKs, indexes e tipos JSONB já estabelecidos.
- `campaigns.clientProfileId`, `derivations.campaignId` e `derivations.workspaceId`: vínculos canônicos para validar cliente, campanha e derivação.
- `requireWorkspaceAccess`: autenticação e seleção do workspace ativo para APIs.
- `apiError`, `apiSuccess` e `handleApiError`: contrato existente de respostas e falhas de API.
- Repositórios de billing, progression e persona simulation: precedentes de `onConflictDoUpdate`, identidade composta e acesso workspace-scoped.

### Established Patterns

- Validar entrada com Zod na borda e validar novamente relações de entidades no servidor antes da escrita.
- Toda consulta e mutação de dados de negócio inclui `workspaceId`; IDs isolados não são uma fronteira de segurança suficiente.
- Usar Postgres/Drizzle como fonte de verdade e constraints/unique indexes como defesa de integridade, não apenas verificações em memória.
- Idempotência e atualização concorrente usam primitivas atômicas do banco, seguindo os precedentes de progression e billing.
- Migrações ficam em `app/drizzle/`, são aplicadas por `npm run db:migrate` e precisam manter o journal consistente.
- Logs de dados sensíveis usam IDs e contexto técnico, não payloads integrais ou métricas comerciais desnecessárias.

### Integration Points

- Nova fundação de performance se conecta a `clientProfiles`, `campaigns` e `derivations` por FKs/validação workspace-scoped.
- Phase 104 consumirá o mesmo contrato canônico para entrada manual e CSV; não deve criar um segundo formato de persistência.
- Phase 105 consumirá snapshots e seus escopos/períodos sem somar janelas sobrepostas implicitamente.
- Phase 106 derivará aprendizados do ledger Postgres e somente então projetará resumos no Mem0.

</code_context>

<specifics>
## Specific Ideas

- O registro precisa ser detalhado o bastante para comparar placement, mas não deve exigir conta de anúncio quando a fonte não a fornece.
- Preservar simultaneamente placement normalizado e placement original é importante para comparar hoje sem perder fidelidade para futuras taxonomias.
- O modelo deve aceitar exports segmentados reais, desde que deixe claro que representam uma parte do tráfego.

</specifics>

<deferred>
## Deferred Ideas

- Formulário manual, parser CSV, mapeamento de colunas, preview e histórico de lotes — Phase 104.
- Regras de comparabilidade, seleção de janela, hipótese, vencedor e confiança — Phase 105.
- Agregação de padrões por cliente e sincronização Mem0 — Phase 106.
- Integrações diretas com APIs de mídia, agendamento e presets de mapeamento — requisitos futuros da milestone.

</deferred>

---

*Phase: 103-performance-data-foundation*
*Context gathered: 2026-06-12*
