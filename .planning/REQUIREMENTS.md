# Requirements: ADScale v12.3 Integridade Criativa

**Defined:** 2026-06-15
**Milestone:** v12.3 Integridade Criativa
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Endurecer o pipeline criativo para que peças factualmente incorretas, visualmente genéricas ou hierarquicamente congestionadas não sejam aprovadas. Garantir que regras críticas cheguem ao prompt, ao quality gate e aos testes — sem trocar modelo de imagem, rebrand ou mudanças de UI.

**Audit baseline:** corpus `app/exports/render-creatives/` — 34 peças, média 58,5/100.

**In scope:** fixtures, contrato criativo, prompts por modo, rubrica observável, gate, score, retry, regressão, validação visual.

**Out of scope:** novo modelo de imagem, design system, rebrand, telas de produto, otimização de custo/velocidade antes de integridade factual.

## Requirements

### Fixtures and Baseline (FIXT)

- [x] **FIXT-01**: Cada falha observada no corpus auditado (entidade inventada, overload, template genérico, drift de formato, contaminação de restyling) possui fixture reproduzível em `quality-fixtures` ou catálogo equivalente.
- [x] **FIXT-02**: Fixtures registram campanha canônica, entidades permitidas, modos e formatos esperados para Smoke, Nova campanha, Teste 3/CENBRAP NR1 e Teste campanha/Master NR1.
- [x] **FIXT-03**: Previews (`270×270`) e finais são categorias distintas nas fixtures e na validação.
- [x] **FIXT-04**: Testes demonstram que o pipeline atual aprova indevidamente as peças-falha do corpus antes da correção (red → green).

### Creative Contract (CONT)

- [x] **CONT-01**: Contrato canônico declara ideia dominante, hook único, zona de prova/oferta, CTA único e identidade invariável (campanha, paleta, pessoas, produto, marca).
- [x] **CONT-02**: Contrato distingue conteúdo obrigatório, condensável e decorativo descartável com precedência explícita: fatos > hierarquia > decoração.
- [x] **CONT-03**: Nenhum prompt exige simultaneamente preservar todos os módulos literalmente e simplificar hierarquia sem regra de precedência.
- [x] **CONT-04**: `VISUAL_HIERARCHY_CONTRACT` e `ANTI_HALLUCINATION_RULES` são injetados em todos os prompts de derivação aplicáveis.

### Factual vs Visual Separation (SEP)

- [x] **SEP-01**: Inputs classificados explicitamente: base factual, referência visual, brand kit, referências adicionais.
- [x] **SEP-02**: Referência visual pode transferir apenas ritmo, textura, cromia, tipografia, iluminação e lógica compositiva — nunca pessoas, uniformes, produtos, marcas, logos, textos ou alegações.
- [x] **SEP-03**: Derivação contaminada não pode servir como fonte para adaptações de formato subsequentes.
- [x] **SEP-04**: Cantona, Manchester United, Adidas e entidades similares ausentes da fonte factual são bloqueadas no gate.

### Per-Mode Rules (MODE)

- [ ] **MODE-01**: `art_variation` exige ideia ou mecanismo visual novo; reprova variação meramente decorativa (cor, glow, fundo, reposição de cards).
- [ ] **MODE-02**: `art_variation` limita orçamento visual a no máximo três zonas principais de informação.
- [ ] **MODE-03**: `restyling` preserva integralmente entidades da base factual e extrai apenas atributos abstratos da referência visual.
- [ ] **MODE-04**: `format_adaptation` trata saída como edição da mesma campanha — preserva pessoas, copy, CTA, marca e conceito; altera apenas composição, escala e agrupamento.
- [ ] **MODE-05**: Mesma campanha permanece reconhecível em `1:1`, `4:5` e `9:16` sem introduzir nova narrativa.

### Observable Rubric (RUBR)

- [x] **RUBR-01**: Avaliação reprova quando não há ponto focal dominante, existem mais de três zonas concorrentes, ou múltiplos CTAs competem com o hook.
- [x] **RUBR-02**: Avaliação reprova estética template genérica severa (neon/glow/cards premium sem justificativa de marca ou campanha).
- [x] **RUBR-03**: Defeitos são explicados por elementos visíveis observáveis — termos como "polished" ou "professional" não são critério de aprovação isolado.
- [x] **RUBR-04**: Hook é compreensível em miniatura (preview scale).

### Quality Gate (GATE)

- [x] **GATE-01**: Novas categorias bloqueantes: `invented_factual_entity`, `replaced_source_subject`, `unauthorized_brand_or_ip`, `campaign_identity_drift`, `style_reference_contamination`, `generic_template_aesthetic`, `visual_overload`, `missing_dominant_idea`, `decorative_only_variation`.
- [x] **GATE-02**: Falha factual produz `invalid` independentemente da nota estética.
- [x] **GATE-03**: Estética genérica severa não fica apenas em `polishSuggestions` — bloqueia exportação quando acima do threshold.
- [x] **GATE-04**: Peças `27069645`, `a753e357`, `538246da`, `a5f65b85`, `f420bcb2`, `d7d9d323` do corpus são bloqueadas após correção.
- [x] **GATE-05**: Peça fiel como `c2c12774` continua aprovável (pode receber sugestões de simplificação, não invalidação factual).

### Score and Retry (SCR)

- [x] **SCR-01**: Score separa integridade factual, hierarquia, legibilidade, direção de arte, originalidade e adequação ao formato.
- [x] **SCR-02**: Tetos de nota aplicados: fato inventado ≤20, campanha substituída ≤15, CTA ausente ≤50, overload grave ≤55, variação decorativa ≤60.
- [x] **SCR-03**: Nota alta não coexiste com hard failures ativos.
- [x] **SCR-04**: Retry habilitado para restyling e usa fonte factual original, nunca saída contaminada.
- [x] **SCR-05**: Correção de retry é específica: remover entidade inventada, restaurar pessoa/marca, reduzir módulos, restaurar conceito/CTA.

### Regression Tests (TEST)

- [x] **TEST-01**: Testes de prompt verificam presença de ideia dominante, três níveis, CTA secundário, entidades proibidas, separação factual/visual e simplificação permitida.
- [x] **TEST-02**: Testes de gate cobrem Cantona/Manchester United, pessoa substituída, logo não autorizado, campanha diferente, template genérico, excesso de módulos e variação decorativa.
- [x] **TEST-03**: Suíte independente por modo (`art_variation`, `restyling`, `format_adaptation`) com mesmas entradas em múltiplos formatos.
- [x] **TEST-04**: Teste de miniatura valida leitura do hook em escala mobile.

### Visual Validation (QA)

- [ ] **QA-18**: Geração controlada antes/depois com mesma campanha e seed quando suportado para cada modo em formatos representativos.
- [ ] **QA-19**: Rubrica de 12 critérios aplicada ao conjunto pós-correção atinge média geral ≥75 e fidelidade factual ≥95.
- [ ] **QA-20**: Nenhuma entidade inventada e nenhuma campanha substituída no conjunto de validação.
- [ ] **QA-21**: `npm test`, `npm run lint`, `npm run build` passam com cobertura de regressão do milestone.

## Future Requirements

### Model and Vision (deferred)

- **VISION-01**: Gate assistido por vision model para verificação de entidades visuais
- **VISION-02**: Comparação semântica imagem-a-imagem automatizada para format_adaptation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Trocar modelo de imagem OpenAI | Não resolve gaps de prompt/gate; milestone foca contratos |
| Rebrand / novo design system | Escopo visual de produto coberto em v12.2 |
| Alterar telas do produto | Milestone é pipeline server-side |
| Aprovação automática sem evidência visual | QA-18–20 exigem validação controlada |
| Otimizar custo/velocidade antes de integridade | Factualidade é prioridade zero |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIXT-01 | Phase 115 | Complete |
| FIXT-02 | Phase 115 | Complete |
| FIXT-03 | Phase 115 | Complete |
| FIXT-04 | Phase 115 | Complete |
| CONT-01 | Phase 116 | Complete |
| CONT-02 | Phase 116 | Complete |
| CONT-03 | Phase 116 | Complete |
| CONT-04 | Phase 116 | Complete |
| SEP-01 | Phase 117 | Complete |
| SEP-02 | Phase 117 | Complete |
| SEP-03 | Phase 117 | Complete |
| SEP-04 | Phase 117 | Complete |
| MODE-01 | Phase 118 | Pending |
| MODE-02 | Phase 118 | Pending |
| MODE-03 | Phase 118 | Pending |
| MODE-04 | Phase 118 | Pending |
| MODE-05 | Phase 118 | Pending |
| RUBR-01 | Phase 119 | Complete |
| RUBR-02 | Phase 119 | Complete |
| RUBR-03 | Phase 119 | Complete |
| RUBR-04 | Phase 119 | Complete |
| GATE-01 | Phase 120 | Complete |
| GATE-02 | Phase 120 | Complete |
| GATE-03 | Phase 120 | Complete |
| GATE-04 | Phase 120 | Complete |
| GATE-05 | Phase 120 | Complete |
| SCR-01 | Phase 121 | Complete |
| SCR-02 | Phase 121 | Complete |
| SCR-03 | Phase 121 | Complete |
| SCR-04 | Phase 121 | Complete |
| SCR-05 | Phase 121 | Complete |
| TEST-01 | Phase 122 | Complete |
| TEST-02 | Phase 122 | Complete |
| TEST-03 | Phase 122 | Complete |
| TEST-04 | Phase 122 | Complete |
| QA-18 | Phase 123 | Pending |
| QA-19 | Phase 123 | Pending |
| QA-20 | Phase 123 | Pending |
| QA-21 | Phase 123 | Pending |

**Coverage:**
- v12.3 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 after milestone v12.3 initialization*
