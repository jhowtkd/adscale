# Requirements: ADScale v12.1 Memória Criativa e Aprendizado de Performance

**Defined:** 2026-06-12
**Milestone:** v12.1 Memória Criativa e Aprendizado de Performance
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar resultados reais de mídia em aprendizado reutilizável por cliente e em uma próxima ação criativa explicável. Postgres mantém métricas, hipóteses, evidências e cálculos canônicos; Mem0 recebe uma projeção sincronizada dos aprendizados aprovados para recuperação contextual.

**In scope:** entrada manual, importação CSV, métricas canônicas, hipóteses, comparação contextual, memória por cliente, projeção Mem0, recomendação editável e gates de qualidade.

**Out of scope:** APIs diretas de mídia, benchmark entre clientes, atribuição multitoque, publicação automática e otimização de orçamento.

## Requirements

### Performance Data (PERF)

- [ ] **PERF-13**: Usuário pode registrar impressões, cliques, investimento, conversões e valor de conversão para uma derivação em uma plataforma e período definidos.
- [ ] **PERF-14**: Usuário vê CTR, CPC, CPA e ROAS calculados de forma consistente a partir das métricas canônicas, incluindo estados seguros para denominadores zero.
- [ ] **PERF-15**: Cada registro preserva moeda, plataforma, origem, janela de dados e identificadores externos necessários para auditoria e comparação.
- [ ] **PERF-16**: Usuário só pode consultar ou alterar métricas vinculadas ao seu workspace, cliente, campanha e derivação válidos.

### Import (IMPT)

- [ ] **IMPT-01**: Usuário pode inserir resultados manualmente no contexto de uma campanha e associá-los a uma derivação.
- [ ] **IMPT-02**: Usuário pode enviar CSV e mapear colunas de origem para os campos canônicos antes de persistir dados.
- [ ] **IMPT-03**: Usuário vê preview com linhas válidas, inválidas e motivo de cada rejeição antes de confirmar a importação.
- [ ] **IMPT-04**: Usuário pode informar moeda, locale, separador decimal e formato percentual para normalizar os valores importados.
- [ ] **IMPT-05**: Repetir ou atualizar uma importação não duplica métricas; o sistema informa quais registros serão criados, atualizados ou ignorados.
- [ ] **IMPT-06**: Usuário pode consultar histórico de lotes com arquivo, mapeamento, ator, contagens, horário e origem das linhas.

### Hypotheses (HYPO)

- [ ] **HYPO-01**: Usuário pode registrar uma hipótese criativa com variável principal, métrica primária, direção esperada e justificativa.
- [ ] **HYPO-02**: Usuário pode associar à hipótese as derivações de controle e variação participantes.
- [ ] **HYPO-03**: Usuário pode comparar a direção esperada com o resultado observado e registrar se a hipótese foi suportada, contrariada ou permaneceu inconclusiva.

### Comparison (COMP)

- [ ] **COMP-05**: Sistema compara variantes somente quando plataforma, período, objetivo e contexto mínimo são compatíveis, explicando qualquer exclusão.
- [ ] **COMP-06**: Usuário vê métricas brutas, derivadas, tamanho da amostra, período e diferença entre variantes no mesmo relatório.
- [ ] **COMP-07**: Sistema classifica o resultado como vencedor, sem vencedor claro, evidência insuficiente ou não comparável sem fabricar certeza.
- [ ] **COMP-08**: Usuário vê se a conclusão é observacional ou baseada em hipótese controlada com uma variável principal.

### Client Memory and Mem0 (MEM)

- [ ] **MEM-01**: Sistema gera aprendizados canônicos por cliente a partir de evidências de CTA, formato, receita, estilo ou outra variável suportada.
- [ ] **MEM-02**: Cada aprendizado mantém referências às campanhas e derivações que o suportam e às evidências que o contradizem.
- [ ] **MEM-03**: Usuário vê amostra, recência, contexto e nível de confiança de cada aprendizado.
- [ ] **MEM-04**: Aprendizados aprovados são projetados no Mem0 com escopo de workspace/cliente, ID canônico, versão e metadados de contexto.
- [ ] **MEM-05**: Sistema recupera do Mem0 os aprendizados mais relevantes para o cliente e contexto da campanha e resolve seus dados canônicos antes de exibi-los ou usá-los.
- [ ] **MEM-06**: Corrigir ou remover evidências recalcula o aprendizado e atualiza ou remove sua projeção no Mem0 sem deixar memória obsoleta ativa.

### Next Action (NEXT)

- [ ] **NEXT-01**: Usuário recebe uma recomendação de próximo experimento baseada nos aprendizados relevantes e no contexto atual da campanha.
- [ ] **NEXT-02**: Recomendação mostra justificativa, evidências utilizadas, contradições, amostra e confiança.
- [ ] **NEXT-03**: Usuário pode aceitar, editar ou ignorar a recomendação sem alteração automática de campanha ou gasto de mídia.
- [ ] **NEXT-04**: Ao aceitar, usuário pode abrir o fluxo existente com CTA, formato, receita ou estilo recomendado pré-preenchido e ainda editável.

### Verification (QA)

- [ ] **QA-10**: Testes cobrem entrada manual, CSV, locale/moeda, deduplicação, atualizações de atribuição, auditoria e isolamento por workspace.
- [ ] **QA-11**: Testes cobrem comparabilidade, denominadores zero, evidência insuficiente, contradições e ausência de vencedor claro.
- [ ] **QA-12**: Testes cobrem criação, recuperação, atualização e remoção da projeção Postgres-Mem0, incluindo falha não bloqueante do Mem0.
- [ ] **QA-13**: `npm test`, `npm run lint`, `npm run build`, migração e UAT de importação/comparação passam com dados representativos.

## Future Requirements

### Provider Automation

- Saved mapping presets after repeated real exports establish stable patterns.
- Scheduled imports through Inngest when interactive imports become operational friction.
- Direct Meta, Google and TikTok reporting APIs after the learning model proves valuable.

### Advanced Learning

- Recency decay calibrated from longitudinal client history.
- Cross-client anonymized benchmarks with explicit consent and minimum cohorts.
- Optional AI narrative over deterministic evidence packets.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct Meta/Google/TikTok APIs | Validate canonical data and learning value before OAuth, API versioning and provider maintenance |
| Automatic budget optimization or publishing | Creates financial and operational risk outside the creative-learning core |
| Multi-touch attribution | Requires a separate identity and attribution model |
| Universal cross-client winner ranking | Client context and privacy make this misleading without consented benchmark design |
| Mem0 as canonical metric database | Semantic retrieval cannot replace relational totals, constraints, transactions and deterministic recalculation |
| LLM-selected winner or confidence | Winner and confidence must remain deterministic and auditable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-13 | TBD | Pending |
| PERF-14 | TBD | Pending |
| PERF-15 | TBD | Pending |
| PERF-16 | TBD | Pending |
| IMPT-01 | TBD | Pending |
| IMPT-02 | TBD | Pending |
| IMPT-03 | TBD | Pending |
| IMPT-04 | TBD | Pending |
| IMPT-05 | TBD | Pending |
| IMPT-06 | TBD | Pending |
| HYPO-01 | TBD | Pending |
| HYPO-02 | TBD | Pending |
| HYPO-03 | TBD | Pending |
| COMP-05 | TBD | Pending |
| COMP-06 | TBD | Pending |
| COMP-07 | TBD | Pending |
| COMP-08 | TBD | Pending |
| MEM-01 | TBD | Pending |
| MEM-02 | TBD | Pending |
| MEM-03 | TBD | Pending |
| MEM-04 | TBD | Pending |
| MEM-05 | TBD | Pending |
| MEM-06 | TBD | Pending |
| NEXT-01 | TBD | Pending |
| NEXT-02 | TBD | Pending |
| NEXT-03 | TBD | Pending |
| NEXT-04 | TBD | Pending |
| QA-10 | TBD | Pending |
| QA-11 | TBD | Pending |
| QA-12 | TBD | Pending |
| QA-13 | TBD | Pending |

**Coverage:**
- v12.1 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-12 after scope approval*
