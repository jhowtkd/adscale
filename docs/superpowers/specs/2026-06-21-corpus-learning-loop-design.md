# Design: Corpus Learning Loop — Fechamento do Loop de Qualidade

**Data:** 2026-06-21  
**Status:** Aprovado (brainstorming)  
**Repo:** `ADScale_2` (app)  
**Relacionado:** `docs/superpowers/specs/2026-06-21-admin-panel-design.md`, milestone v13.1 Global Owner Quality Corpus

---

## 1. Objetivo

Fechar o loop entre **avaliação humana no corpus** e **melhoria das próximas gerações**, com ingestão global de todas as artes geradas por todos os usuários para avaliação.

Hoje o sistema **mede e propõe** (evaluations → calibration adjustments → feedback artifacts gravados), mas não **age** na geração — exceto o caminho paralelo brand-taste (`calibration_rules` via Cenbrap). Os `feedback_artifacts` com `improvementTargets` não têm consumer além de contagem no evidence report.

Este design define:

1. **Ingestão global** — captura + auto-promote de todas as derivações elegíveis (forward + backfill histórico)
2. **Aprendizado por cliente** — padrões recorrentes viram `calibration_rules` (`corpus_quality`) aplicadas no prompt
3. **Aprendizado global** — padrões cross-client viram `rubric_calibration_adjustments` (pipeline existente)
4. **Modelo propõe + aceita** — operador aprova toda regra antes de aplicar

---

## 2. Decisões de produto

| Tópico | Decisão |
|--------|---------|
| Foco | Fechar loop de qualidade (não UX de review nem admin shell em si) |
| Prioridade de aprendizado | **Cliente primeiro**; global só quando padrão se repete em ≥2 clientes |
| Autorização | **Propõe + aceita** — sistema detecta padrões; operador aceita no admin |
| Ingestão | **Todas as artes de todos os usuários** — auto-promote total para fila `pending` |
| Cohort auto-promote | `baseline` por padrão; `pre_learning` / `post_learning` permanecem manuais |
| Correção por item | **Fora do v1** — sem regenerate automático por `intent=regenerate` |
| Claims comerciais | Continuam bloqueados até sample/source sufficiency real (evidence gate existente) |
| Abordagem técnica | Estender brand-taste + calibração existentes (não módulo paralelo nem apply runtime sem code edits globais) |

### Fora de escopo (v1)

- Regenerate automático ao avaliar com `intent=regenerate`
- Auto-approve de propostas (cliente ou global)
- Re-scoring de corpus histórico com novos analyzers
- Fine-tuning de modelo de imagem
- Claims comerciais sem amostra `real_customer` suficiente
- Freeform prompt mutation a partir de notas do operador

---

## 3. Estado atual (baseline)

| Camada | Implementado | Lacuna |
|--------|--------------|--------|
| Captura forward | `captureCorpusCandidateFromDerivation` no `derivationJob` | Sem backfill histórico |
| Promoção | Manual via Candidates tab | Sem auto-promote |
| Avaliação | `submitHumanEvaluation` + `feedback_artifacts` | Artifacts sem consumer |
| Calibração agregada | `proposeAdjustments` → `rubric_calibration_adjustments` | Accept → code edits manuais (Phase 132) |
| Brand-taste | `calibration_signals` → `calibration_rules` → prompt | Caminho paralelo; não lê corpus |
| Regeneração | `regeneration-correction-brief` | `getHumanFailureCorrectionDirectives` não wired em produção |
| Fila global | Owner queue cross-workspace (v13.1) | API candidates limitada a 100; sem paginação operacional |

---

## 4. Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│ INGESTÃO (todas as artes, todos os usuários)                     │
│ completed derivations → capture → auto-promote → fila pending    │
│ + backfill histórico (cursor-based, idempotente)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ operador avalia no corpus
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ AVALIAÇÃO → evaluation + feedback_artifact (improvementTargets) │
└────────────────────────────┬────────────────────────────────────┘
                             │ agregador (≥3 evals, |delta|≥15)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PROPOSTAS CLIENTE (client_learning_proposals)                    │
│ operador aceita → calibration_rule (category: corpus_quality)    │
│ → prompt-builder na próxima geração daquele clientProfile        │
└────────────────────────────┬────────────────────────────────────┘
                             │ ≥2 clientes com regra approved
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PROPOSTAS GLOBAIS (rubric_calibration_adjustments)               │
│ operador aceita → buildApplyPlan → edits evidence-bound          │
│ em score_ceiling / observable_rubric / gate_classifier           │
└─────────────────────────────────────────────────────────────────┘
```

### Princípios

- `feedback_artifacts` são a **fonte canônica** de aprendizado; evaluations são evidência
- Aprendizado cliente = **constraints no prompt**, não correção da peça atual
- Aprendizado global = **edits evidence-bound em módulos de scoring/gate** (Phase 132 pattern)
- Privacy boundary preservada: sem prompts, signed URLs, storage keys ou diagnostics raw
- `factual_issue` **não** vira regra de prompt cliente — permanece no gate classifier

### Abordagens consideradas

| Abordagem | Veredito |
|-----------|----------|
| **1. Estender brand-taste + calibração** | **Escolhida** — reusa prompt injection, accept flow, evidence gates |
| 2. Módulo paralelo `quality_learning_proposals` isolado | Rejeitada — duplica lifecycle propose/accept |
| 3. Apply runtime sem code edits globais | Rejeitada — diverge de Phase 132; score/rubric são código hoje |

---

## 5. Ingestão global

### 5.1 Elegibilidade

Uma derivação é elegível para captura quando:

- `status = completed`
- `outputKey IS NOT NULL`
- Não é preview (`isPreview = false` no job)
- `clientProfileId` resolvível via campaign (obrigatório para promote)
- Payload passa `validatePrivacySafePayload`

### 5.2 Auto-promote total

Todo candidato capturado com sucesso é promovido imediatamente:

```
derivation completed
  → captureCorpusCandidateFromDerivation()
  → autoPromoteCandidateToQueue({ cohort: "baseline", autoPromoted: true })
  → human_quality_corpus_items.status = pending
```

- **Auto-promote metadata:** migration adiciona `auto_promoted boolean NOT NULL DEFAULT false` em `human_quality_corpus_items`; `selected_by_user_id` torna-se **nullable** quando `auto_promoted = true` (hoje é NOT NULL FK — precisa de migration)
- **Sem limite de fila** — UI deve suportar volume alto com paginação e filtros
- Candidatos sem `clientProfileId`: capturados mas **não promovidos**; aparecem em painel de exceções
- Idempotente: se corpus item já existe para `(workspace, derivation, corpusVersion)`, skip

### 5.3 Backfill histórico

```
POST /api/admin/quality/ingestion/backfill
{ "batchSize": 500, "cursor": null, "workspaceId": null }
```

- Varre todas as workspaces (ou uma específica)
- Para cada derivation elegível sem candidate: capture + auto-promote
- Retorna `{ processed, created, promoted, skipped, blocked, nextCursor }`
- Job Inngest para volumes grandes; API dispara o job

**Source labels:**

| Condição | Label |
|----------|-------|
| Workspace em `HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS` | `synthetic_fixture` |
| Demais workspaces | `real_customer` |
| Imports manuais pré-existentes | `operator_imported` (se flag/metadata existir) |

### 5.4 UI de ingestão

| Rota | Função |
|------|--------|
| `/admin/quality/queue` | Fila principal de avaliação (paginada) |
| `/admin/quality/candidates` | **Exceções** — candidatos não promovidos (missing client profile, erros) |

Banner de status: `X elegíveis · Y candidatos · Z na fila · W avaliados · B bloqueados`

---

## 6. Agregação e propostas cliente

### 6.1 Input e agrupamento

**Input:** join `human_quality_feedback_artifacts` + evaluations + corpus items.

**Slice key:** `{workspaceId}:{clientProfileId}:{primaryFailureReason}:{generationMode}`

(`generationMode` no slice é opcional na v1 — começar sem mode para não fragmentar amostra; adicionar se volume permitir.)

### 6.2 Thresholds para propor

| Critério | Valor |
|----------|-------|
| Mínimo de avaliações no slice | 3 (`MIN_SLICE_SAMPLE`) |
| Divergência auto vs humano | `\|meanSignedDelta\| ≥ 15` |
| Intent predominante | ≥2 com `reject` ou `regenerate` |
| Dedupe | 1 proposta `proposed` ativa por slice key |

**Não propõe quando:**

- `primaryFailureReason = other` sem texto agregável
- Slice já tem regra `approved` para o mesmo failure reason (nova versão só com ≥3 evals pós-aprovação)
- 100% `synthetic_fixture` sem acknowledgment explícito do operador na proposta

### 6.3 Tabela `client_learning_proposals`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `workspaceId` | uuid FK | |
| `clientProfileId` | uuid FK | |
| `sliceKey` | text | |
| `primaryFailureReason` | text | enum corpus |
| `status` | text | `proposed` \| `accepted` \| `rejected` |
| `evidenceRefs` | jsonb | artifact IDs, corpus item IDs, stats |
| `rationale` | text | directive human-readable |
| `proposedAt` | timestamp | |
| `acceptedAt` | timestamp | nullable |
| `acceptedBy` | text FK user | nullable |
| `rejectedReason` | text | nullable |
| `cooldownUntil` | timestamp | nullable — 30 dias após reject |

Unique parcial: uma proposta `proposed` por `(workspaceId, clientProfileId, sliceKey)`.

### 6.4 Aceitar proposta cliente

1. Valida evidence gate (≥3 artifacts; fixture-only flag se aplicável)
2. Cria `calibration_rule` com `status: approved`, `category: corpus_quality`
3. `supportingSignalIds` = IDs dos feedback artifacts
4. Marca proposta `accepted`
5. Audit log: `learning.client_rule.accept`

**Rejeitar:** status `rejected` + reason obrigatório; `cooldownUntil = now + 30d`.

---

## 7. Failure reason → constraint de prompt

Nova categoria em `RULE_CATEGORIES`: **`corpus_quality`**.

| Failure reason | Directive no prompt |
|----------------|---------------------|
| `visual_overload` | Máx. 3 zonas de informação; um hook dominante |
| `weak_hierarchy` | Hierarquia clara: hook > suporte > CTA |
| `generic_template_feel` | Evitar aesthetic de template; especificidade de marca |
| `illegible_cta` | CTA legível em thumbnail; contraste alto |
| `unfocused_composition` | Composição focal; remover elementos competindo |
| `factual_issue` | **Não vira regra de prompt** — alerta admin apenas |
| `format_or_crop_issue` | Respeitar safe zones; sem crop em texto crítico |

Texto canônico derivado de `getHumanFailureCorrectionDirectives` (preencher gaps para todos os failure reasons visuais). `improvementTargets` do artifact são tags de evidência, não texto livre no prompt.

**Formato no prompt:**

```
CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):
[corpus-quality:{ruleId}] illegible_cta: CTA legível em thumbnail...
```

**Ordem de seções no prompt:** Olhar ADScale → brand-taste (Cenbrap) → corpus_quality.

**Aplicação no `derivationJob`:**

```typescript
const corpusRules = await listApprovedCalibrationRules({
  workspaceId,
  clientProfileId,
  categories: ["corpus_quality"],
});
config.brandTasteConstraints = [
  ...existingBrandTasteLines,
  ...buildCorpusQualityPromptSection(corpusRules),
];
```

Generation log registra `appliedCorpusRuleIds[]` para learning impact report.

---

## 8. Promoção cross-client → global

Quando o mesmo `primaryFailureReason` tem regra `corpus_quality` **approved** em **≥2 `clientProfileId` distintos**:

| Critério | Valor |
|----------|-------|
| Clientes distintos com regra approved | ≥2 |
| Avaliações totais cross-client | ≥6 |
| Source composition para claims | ≥1 `real_customer` ou `operator_imported`; senão flagged `fixture_only` |

1. Agregador global consolida evidência cross-client
2. Cria/atualiza `rubric_calibration_adjustments` (`proposed`) via `proposeAdjustments` existente
3. Admin exibe em **Propostas Globais** com links às regras cliente sustentadoras
4. Operador aceita via `POST /api/feedback/calibration-adjustments/[id]/accept`
5. `buildApplyPlan` → edits evidence-bound (Phase 132)

**Global nunca auto-aceita.**

---

## 9. APIs

| Rota | Método | Função |
|------|--------|--------|
| `/api/admin/quality/learning/proposals` | GET | Lista propostas cliente |
| `/api/admin/quality/learning/proposals/[id]/accept` | POST | Aceita → `calibration_rule` |
| `/api/admin/quality/learning/proposals/[id]/reject` | POST | Rejeita + cooldown |
| `/api/admin/quality/learning/proposals/generate` | POST | Agregador on-demand |
| `/api/admin/quality/ingestion/backfill` | POST | Dispara backfill (job) |
| `/api/admin/quality/ingestion/status` | GET | Totais de ingestão |
| `/api/feedback/human-quality-corpus/*` | — | Mantidas; wrap admin futuro |

Todas as rotas `/api/admin/quality/*` exigem `requirePlatformOwner`.

---

## 10. Jobs

| Job | Trigger | Ação |
|-----|---------|------|
| `learning-proposal-aggregator` | Diário + on-demand | Propostas cliente + detecção cross-client |
| `corpus-candidate-backfill` | API one-shot / incremental | Backfill histórico |
| Capture no `derivationJob` | Cada completion | capture + auto-promote (alterar fluxo atual) |

Falha em capture/promote **não** falha o derivation job (log warn + painel de exceções).

---

## 11. Admin UI

Nova rota: **`/admin/quality/learning`**

| Aba | Conteúdo |
|-----|----------|
| Propostas Cliente | Lista, evidência (N evals, previews, stats), Aceitar/Rejeitar |
| Propostas Globais | `rubric_calibration_adjustments` proposed; link para regras cliente |

Sidebar Qualidade (do admin panel spec): adicionar item **Learning** entre Calibration e Impact.

**`/admin/quality/queue`:** paginação cursor (50/página), filtros (workspace, source, mode, format, cohort, status, data), submit-and-next.

**Dashboard KPI:** fila pendente global; atenção para itens > 7 dias.

---

## 12. Error handling

| Cenário | Comportamento |
|---------|---------------|
| Capture falha no job | Log warn; derivation continua |
| Promote falha após capture | Retry 1x; senão candidato em exceções com `promoteError` |
| Backfill interrompido | Cursor retomável |
| Agregador sem amostra | Não propõe; report `insufficient_sample` |
| Accept com evidence insuficiente | HTTP 400 |
| Accept duplicado | HTTP 409 idempotente |
| Missing clientProfile | Captura sem promote; contador `blocked` |

---

## 13. Testes

| Área | Cobertura |
|------|-----------|
| Auto-promote | Idempotência, cohort baseline, `auto_promoted` flag, `selectedByUserId` null |
| Backfill | Cursor, skip preview/failed, privacy |
| Agregador | Threshold 3, \|delta\| 15, dedupe, cross-client |
| Accept/reject | calibration_rule materialization, cooldown |
| Prompt injection | Rules por clientProfile; sem leak cross-client |
| Global promotion | rubric_calibration_adjustments proposed |
| Regression | factual guards + output-learning safety inalterados |

---

## 14. Fases de implementação

| Fase | Entrega | Dependência |
|------|---------|-------------|
| **1** | Auto-promote + backfill + ingestion status + fila paginada | Admin shell phase 1 (rotas quality) |
| **2** | `client_learning_proposals` + agregador + accept → rules | Fase 1 + avaliações no corpus |
| **3** | Prompt injection + cross-client → propostas globais | Fase 2 |
| **4** | UI `/admin/quality/learning` + dashboard KPIs | Admin shell |

---

## 15. Verificação de sucesso

O loop está fechado quando:

1. Toda derivação completed elegível aparece na fila global sem ação manual
2. Após ≥3 avaliações com padrão consistente, proposta cliente aparece no admin
3. Ao aceitar proposta, próxima geração do mesmo `clientProfile` inclui constraint `corpus_quality` no log
4. Com ≥2 clientes approved para o mesmo failure, proposta global aparece
5. Learning impact report mostra `appliedCorpusRuleIds` em gerações pós-aceite
6. Claims gate continua bloqueando claims comerciais até sample real suficiente

---

## 16. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Fila enorme após backfill | Paginação cursor, filtros, KPIs; operador avalia em ritmo próprio |
| Regras cliente conflitantes com brand-taste | Ordem explícita no prompt; corpus_quality não enfraquece factual/CTA |
| Fixture-only corpus infla propostas | Flag na proposta; evidence gate bloqueia claims |
| Prompt bloat com muitas regras | Cap de regras `corpus_quality` ativas por clientProfile (ex.: 10); deprecate antigas |

---

## 17. Débito futuro

- Regenerate com feedback humano do corpus (`intent=regenerate`)
- Renomear `/api/feedback/*` → `/api/admin/quality/*`
- Runtime apply de ajustes globais sem deploy (se Phase 132 evoluir)
- Amostragem inteligente na fila (se auto-promote total gerar overload operacional)
