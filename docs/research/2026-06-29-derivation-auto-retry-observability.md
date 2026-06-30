# Pesquisa: Observabilidade e Transparência do Auto-Retry de Derivações

**Data:** 2026-06-29  
**Autor:** Automação Cursor (pesquisa semanal)  
**Status:** Proposta — nenhum código de produção alterado  
**Escopo:** Uma melhoria — tornar o pipeline de auto-retry existente mensurável e, opcionalmente, visível para usuários  
**PR:** https://github.com/jhowtkd/adscale/pull/17

---

## 1. Resumo executivo

O ADScale já executa um **auto-retry silencioso no servidor** dentro do job Inngest `derivationJob` quando códigos específicos de hard failure são detectados (Fase 121). O retry pode substituir a imagem de saída, re-pontuar e reexecutar o quality gate — mas **nada na superfície do produto ou nos analytics registra que isso aconteceu**.

Operadores só descobrem retries via script CLI (`app/scripts/audit-campaign-session.mjs`). Usuários veem a imagem final sem indicação de que foi auto-corrigida. O beta analytics não possui eventos para gatilhos de retry, resultados ou impacto de COGS.

**Recomendação:** adicionar uma **camada de observabilidade somente leitura** antes de expandir a política de retry ou a política de cobrança. A Fase 1 emite eventos de analytics no servidor e expõe `autoRetryAttempted` / `autoRetryReason` nas respostas da API de derivações. A Fase 2 adiciona painel de funil para owners e badge opcional voltado ao usuário. Adiar mudanças na política de créditos até existirem 30+ dias de taxa de sucesso de retry medida em produção.

Esta é a próxima melhoria de maior valor e menor risco para o fluxo criativo: a maquinaria de retry está pronta; o loop de feedback não.

---

## 2. Problema

### 2.1 O que existe hoje

Após a geração inicial, scoring e quality gate, o job de derivação avalia `shouldAutoRetryDerivation()` e pode executar `runDerivationAutoRetry()` uma vez por derivação:

| Camada | Local | Comportamento |
|--------|-------|---------------|
| Política de retry | `app/src/server/ai/derivation-auto-retry-policy.ts` | Allowlist de códigos de hard failure retryáveis por modo |
| Execução do retry | `app/src/server/ai/derivation-auto-retry.ts` | Segunda chamada OpenAI `images.edit` com prompt de correção |
| Orquestração no job | `app/src/server/jobs/derivation.ts` (~L1219–1450) | Steps: `auto-retry-on-text-failure` → `score-derivation-after-retry` → `quality-gate-after-retry` |
| Persistência | `derivations.generation_log` (JSONB) | `autoRetryAttempted: true`, `autoRetryReason: "cta_drift,..."` |
| Visibilidade CLI | `app/scripts/audit-campaign-session.mjs` | Conta `autoRetries` por sessão de campanha |

Códigos retryáveis por modo (verificados em `derivation-auto-retry-policy.test.ts`):

| Modo | Códigos retryáveis |
|------|-------------------|
| `art_variation` | `cta_drift`, `unreadable_required_text`, `decorative_only_variation`, `visual_overload` |
| `format_adaptation` | `cta_drift`, `unreadable_required_text`, `invalid_format_layout`, `cropped_critical_content` |
| `restyling` | `style_reference_contamination`, `cta_drift`, `unreadable_required_text`, `copied_style_reference_facts`¹ |

¹ `copied_style_reference_facts` é normalizado para `style_reference_contamination` via `normalizeHardFailureCode()`.

Explicitamente **não** retryáveis: `missing_dominant_idea`, `invented_factual_entity`, `campaign_identity_drift`, `wrong_brand` e demais códigos de contaminação/identidade.

### 2.2 O que falta

| Lacuna | Evidência | Impacto |
|--------|-----------|---------|
| Sem exposição na API | Tipo `Derivation` em `use-derivations.ts` não tem campos `autoRetry*`; `generationLog` não é retornado por `/api/campaigns/[id]/derivations` | UI não pode mostrar status de retry |
| Sem eventos de analytics | `BETA_EVENT_KEYS` em `beta-analytics/types.ts` não tem chaves `auto_retry_*` | Funil do owner não mede ROI do retry |
| Sem transparência para usuário | Sem chaves i18n de auto-retry em `en.json` / `pt-BR.json` | Usuário não sabe que a saída foi auto-corrigida |
| COGS oculto | Créditos cobrados uma vez na fronteira da API (`spendCreditsOrApiError`); `track-usage` no job conta uma derivação; auto-retry adiciona segunda chamada OpenAI sem custo extra | Ponto cego de margem; impossível justificar política de créditos |
| Sem baseline de taxa de sucesso | `run-creative-validation.ts` mede retry no harness de validação, mas produção não tem agregado | Impossível decidir expandir códigos retryáveis (ex.: `missing_dominant_idea`) |
| Auditoria só para operador | `audit-campaign-session.mjs` exige `DATABASE_URL` + ID de campanha | Não escala para ops de beta nem evidência de release |

### 2.3 Por que isso importa agora

1. **Confiança no fluxo criativo:** quando o auto-retry funciona, o usuário vê uma saída `acceptable`/`improvable` que não pediu explicitamente. Sem transparência, aumenta confusão em suporte e revisão ("por que isso ficou diferente do preview?").

2. **Evolução do quality gate:** Fases 144+ focam na calibração humana Cenbrap. Resultados do auto-retry (veredito antes vs depois) são sinal valioso de treinamento, mas hoje são descartados exceto em `generation_log`.

3. **Integridade de billing:** o produto já rastreia `creditDelta` quando estimativa diverge do gasto real (`credits.ts`). O auto-retry é o inverso — COGS real excede créditos cobrados sem telemetria.

4. **Expansão adiada:** a Fase 121 adiou explicitamente expandir retry além de uma tentativa. Qualquer decisão de expansão exige dados de taxa de sucesso em produção, não checagens pontuais via CLI.

---

## 3. Solução

### 3.1 Proposta central: Camada de Observabilidade do Auto-Retry

Adicionar três superfícies coordenadas e retrocompatíveis:

#### A. Eventos de analytics no servidor (Fase 1a)

Emitir a partir de `derivation.ts` após o step de auto-retry:

| Chave do evento | Quando | Propriedades (allowlist) |
|-----------------|--------|--------------------------|
| `derivation_auto_retry_triggered` | `shouldAutoRetryDerivation` retorna true e retry inicia | `generationMode`, `failureCodes[]`, `isPreview` |
| `derivation_auto_retry_succeeded` | Saída do retry passa no quality gate OU melhora veredito vs pré-retry | `generationMode`, `failureCodes[]`, `verdictBefore`, `verdictAfter`, `scoreDelta` |
| `derivation_auto_retry_unchanged` | Retry rodou mas veredito ainda bloqueante | `generationMode`, `failureCodes[]`, `verdictAfter` |

Notas de implementação:

- Usar `recordBetaAnalyticsEvent` existente em `server/beta-analytics/record.ts`
- Estender `ALLOWED_PROPERTY_KEYS` com `failureCodes`, `verdictBefore`, `verdictAfter`, `scoreDelta` (snake_case, sem PII)
- Capturar veredito/score pré-retry da row antes de `runDerivationAutoRetry` mutar a saída
- Seguir padrão do evento server-side `credit_spend`

#### B. Campos somente leitura na API (Fase 1b)

Expor campos derivados nas respostas de lista/detalhe de derivações (não o `generationLog` bruto):

```typescript
autoRetryAttempted?: boolean;
autoRetryReason?: string | null;  // códigos de falha separados por vírgula
```

Fonte: `generation_log.autoRetryAttempted` / `autoRetryReason` já persistidos pelo job. Mapear no repositório de derivações ou serializador da rota API. **Sem migration de schema.**

#### C. Funil de analytics do owner (Fase 2)

Estender `buildAnalyticsFunnelSummary` em `aggregate.ts` com:

- Contagem de gatilhos de retry (7d / 30d)
- Taxa de sucesso: `succeeded / triggered`
- Top códigos de falha retentados
- Breakdown por `generationMode`

Expor em `OwnerAnalyticsPanel.tsx` como nova seção sob métricas de cockpit/qualidade. Chaves i18n em EN + PT-BR.

#### D. Badge opcional para usuário (Fase 2, com gate)

Quando `autoRetryAttempted === true` e `qualityVerdict !== 'invalid'`:

- Badge discreto em `DerivationCard` e `DerivationReviewSheet`: "Corrigido automaticamente" / "Auto-corrected"
- Tooltip lista códigos de `autoRetryReason` via chaves i18n existentes de `hardFailure`

**Gate:** liberar somente após Fase 1 rodar por ≥2 semanas e product owner aprovar copy.

### 3.2 Fora de escopo desta proposta

- Expandir códigos em `RETRYABLE_BY_MODE`
- Cobrar créditos extras no auto-retry
- Segunda tentativa de retry (guard `autoRetryAttempted` da Fase 121 permanece)
- UI de admin de corpus ou migrations

---

## 4. Alternativas consideradas

| Alternativa | Descrição | Por que não primeiro |
|-------------|-----------|----------------------|
| **A. Status quo** | Manter retry invisível; confiar no audit CLI | Sem métricas de produção; bloqueia decisões informadas |
| **B. Só analytics** | Eventos sem campos API/UI | Mais rápido, mas UI de revisão e suporte continuam cegos |
| **C. Só UI** | Expor campos sem analytics | Ajuda usuários, mas sem ROI agregado para operadores |
| **D. Cobrar créditos no retry** | Debitar 1–2 créditos quando auto-retry roda | Prematuro sem dados de sucesso; risco de backlash |
| **E. Expandir códigos primeiro** | Adicionar `missing_dominant_idea` à política agora | Maior risco de COGS sem observabilidade; código comum em fixtures mas sucesso de retry não comprovado |
| **F. `generationLog` completo na API** | Retornar JSON inteiro do log | Expõe demais steps internos; contrato instável |

**Caminho escolhido:** híbrido B+C em fases — analytics primeiro (1a), campos API (1b), painel owner (2), badge opcional (2 com gate).

---

## 5. Prós e contras

### Prós

- **Zero dependências novas** — usa beta analytics, generation log e i18n existentes
- **Sem migration de schema** — lê `generation_log` JSONB já persistido
- **Sem mudança de contrato de billing** nas Fases 1–2
- **Habilita expansão data-driven** — taxas de sucesso por código de falha antes de mudar política
- **Fecha o loop da Fase 121** — infra implementada mas não mensurada
- **Baixo blast radius** — adições somente leitura na API; analytics emitidos no servidor

### Contras

- **Proliferação de chaves de analytics** — três novas event keys precisam de allowlist + testes de agregação
- **Captura de veredito pré-retry** — job precisa snapshot antes da mutação (pequena mudança na Fase 1a)
- **Badge pode gerar dúvidas** — "por que falhou na primeira vez?" exige copy cuidadosa
- **Sem backfill histórico** — derivações pré-deploy têm `generation_log` mas sem eventos de analytics; painel owner começa na data do deploy salvo script de backfill

---

## 6. Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Rejeição na allowlist de propriedades de analytics | Média | Adicionar chaves em `ALLOWED_PROPERTY_KEYS` + testes em `aggregate.test.ts` |
| Race no snapshot pré-retry | Baixa | Ler row dentro do mesmo step Inngest antes de `runDerivationAutoRetry` |
| Pressão de COGS se taxa de retry for alta | Média | Monitorar `triggered / total_derivations`; threshold de alerta no painel owner |
| Confusão do usuário com badge | Baixa | Gate atrás de aprovação do owner; copy neutra "corrigido automaticamente" |
| PII em mensagens de falha | Baixa | Emitir só códigos nas propriedades de analytics, não texto livre |
| Drift de i18n | Baixa | Atualizar `en.json` e `pt-BR.json` conforme convenção do projeto |

---

## 7. Esforço

Escopo técnico (sem estimativas de calendário):

| Fase | Componentes | Complexidade |
|------|-------------|--------------|
| 1a | Emissão de eventos em `derivation.ts`, `beta-analytics/types.ts`, testes em `record.ts` | Pequena — ~80 LOC + testes |
| 1b | Mapper no repositório, tipo em `use-derivations.ts`, rota API de derivações | Pequena — ~40 LOC |
| 2 | Funil em `aggregate.ts`, `OwnerAnalyticsPanel.tsx`, i18n | Média — ~150 LOC + testes |
| 2 (badge) | `DerivationCard.tsx`, `DerivationReviewSheet.tsx`, i18n | Pequena — ~60 LOC + testes |

**Total:** pequeno a médio. Sem migrations, pacotes novos ou mudanças de CI/CD.

---

## 8. Fases de implementação

### Fase 1a — Analytics no servidor (prioridade)

1. Adicionar `derivation_auto_retry_triggered`, `derivation_auto_retry_succeeded`, `derivation_auto_retry_unchanged` em `BETA_EVENT_KEYS`
2. Adicionar propriedades allowlisted: `failureCodes`, `verdictBefore`, `verdictAfter`, `scoreDelta`
3. No step de auto-retry em `derivation.ts`:
   - Snapshot de `qualityVerdict`, `qualityScore`, `hardFailures` antes do retry
   - Emitir `triggered` no início
   - Após re-gate, emitir `succeeded` ou `unchanged` conforme comparação de veredito
4. Testes: unit test de shape das propriedades; estender asserções em `derivation.test.ts`

**Critério de saída:** eventos aparecem em `beta_analytics_events` para derivações de staging com falhas retryáveis.

### Fase 1b — Exposição na API

1. Mapear `generation_log.autoRetryAttempted` / `autoRetryReason` para DTO de resposta
2. Estender interface `Derivation` em `use-derivations.ts`
3. Teste de rota API confirma campos presentes quando log os contém

**Critério de saída:** `GET /api/campaigns/:id/derivations` retorna `autoRetryAttempted: true` para rows retentadas.

### Fase 2 — Funil do owner

1. Padrão `aggregateCreditSurprises` → novo `aggregateAutoRetryFunnel(events)`
2. Seção no painel owner: contagem de gatilhos, taxa de sucesso, top códigos, tabela por modo
3. Linha no export CSV em `feedback/analytics/export.csv/route.ts`
4. i18n EN + PT-BR

**Critério de saída:** analytics do owner mostra métricas de retry não-zero em staging após cenários forçados.

### Fase 2b — Badge do usuário (opcional, com gate)

1. Componente de badge em `DerivationCard` / `DerivationReviewSheet`
2. i18n: `autoRetryBadge`, `autoRetryTooltip`
3. Feature flag ou env `AUTO_RETRY_BADGE_ENABLED` se desejado

**Critério de saída:** badge visível somente quando `autoRetryAttempted && qualityVerdict !== 'invalid'`.

### Fase 3 futura (proposta separada — fora desta run)

- Avaliar expandir `RETRYABLE_BY_MODE` para `missing_dominant_idea` se taxa de sucesso ≥40%
- Dashboard de COGS: contagem de retry × custo estimado da API de imagem
- Política de créditos: cobrança parcial ou inclusa nos 5 créditos com teto declarado

---

## 9. Perguntas em aberto

1. **Badge por padrão:** saídas auto-corrigidas devem mostrar badge por padrão, ou só em modo owner/debug até validar copy?

2. **Definição de sucesso:** "succeeded" = veredito melhorou (ex.: `invalid` → `improvable`), ou estritamente `invalid` → `acceptable`? Recomendação: qualquer melhora estrita na ordem do enum de veredito.

3. **Batches de preview:** derivações preview devem emitir analytics de retry separados (`isPreview: true`)? Recomendação: sim, tagueados mas excluídos de views de COGS de billing.

4. **Backfill histórico:** rodar script one-off para emitir eventos `triggered` sintéticos a partir de rows existentes em `generation_log`, ou aceitar cold-start nas métricas?

5. **Retry vs regeneração manual:** quando auto-retry falha e usuário clica "Regenerar com correções", analytics devem ligar os dois? Recomendação: adicionar `sourceDerivationId` em eventos de regen manual numa fase posterior.

6. **Calibração Cenbrap:** contact sheets devem mostrar flag de auto-retry para revisores humanos saberem que a imagem é pós-correção? Provavelmente sim — alinha com honestidade de evidência da Fase 144.

---

## Referências

| Artefato | Caminho |
|----------|---------|
| Política de auto-retry | `app/src/server/ai/derivation-auto-retry-policy.ts` |
| Executor de auto-retry | `app/src/server/ai/derivation-auto-retry.ts` |
| Orquestração no job | `app/src/server/jobs/derivation.ts` (steps 5c, score/gate pós-retry) |
| Schema do generation log | `app/src/server/ai/generation-log.ts` |
| Audit CLI | `app/scripts/audit-campaign-session.mjs` |
| Tipos de beta analytics | `app/src/server/beta-analytics/types.ts` |
| Pesquisa Fase 121 | `.planning/phases/121-score-ceilings-and-retry/121-RESEARCH.md` |
| Harness de validação | `app/scripts/run-creative-validation.ts` |
| Documentação de arquitetura | `docs/ARCHITECTURE.md` (módulo derivation-auto-retry) |

---

## Verificação realizada

- [x] Confirmado que `autoRetryAttempted` / `autoRetryReason` são persistidos em `generation_log` via revisão de código
- [x] Confirmado que não há chaves `auto_retry` em `BETA_EVENT_KEYS`
- [x] Confirmado que tipo `Derivation` no client não tem campos de auto-retry
- [x] Confirmado que não há chaves i18n de auto-retry em `en.json` / `pt-BR.json`
- [x] Confirmado que `audit-campaign-session.mjs` é a única ferramenta de visibilidade adjacente à produção
- [x] Confirmado que Fase 121 adiou expansão de retry e trabalho de UI
- [ ] Suite de testes não executada (somente pesquisa; sem mudanças de código)
- [ ] Taxa de retry em produção desconhecida (requer query em DB de produção/staging — indisponível neste ambiente)
