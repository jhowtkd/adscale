# Rollout da rastreabilidade de Peça única (alertas + captura)

Este runbook autoriza somente a leitura dos alertas de rastreabilidade e, após os gates abaixo, a execução humana dos estágios de captura. Ele não autoriza deploy, geração paga, chamadas ao provedor, provisionamento de segredo, captura de conteúdo real sem recibo de aprovação, remediação autônoma, kill/restart de jobs, nem mudanças de prompt/modelo/cobrança.

Ticket: [jhowtkd/adscale#397](https://github.com/jhowtkd/adscale/issues/397) · Spec: #382 · Diagnóstico tab: #394 · E2E/staging: #396 · Política de conteúdo: mecanismo #391 entregue (#430); captura `redacted` exige aprovação humana + recibo (abaixo).

## Responsável técnico e contatos operacionais

- Responsável técnico: platform owner (`PLATFORM_OWNER_EMAILS` no `render.yaml`) — aprova cada estágio e cada mudança de limiar.
- Contatos operacionais: issues em `jhowtkd/adscale` (tag de rastreabilidade) para alertas acionados; decisões e evidências vão na tabela de evidência abaixo. Não há rotação de plantão — alertas fora do horário comercial aguardam o próximo dia útil, exceto `terminal_failure_rate` em produção, que o responsável técnico trata como prioridade.

## Catálogo de alertas

Fonte: `app/src/server/diagnostics/alerts.ts` (avaliadores puros, somente leitura — nunca tocam geração, settlement, retry, lease ou Inngest). Emissão = `logger.warn/error` estruturado + evento Sentry opcional pela via single-capture (`captureExceptionOnce`; ver #406). Agregação por `(protocol, environment, dataOrigin)` — nunca por `workItemId` ou usuário. Amostras abaixo do mínimo retornam `insufficient_sample` (sinalizado, nunca zerado).

| Regra | Sinal | Proposta de limiar (dados ajustáveis, não contrato) | Onde olhar |
| --- | --- | --- | --- |
| `terminal_failure_rate` | taxa de falha terminal por coorte | `TERMINAL_FAILURE_ALERT_PROPOSAL`: ≥5 terminais, ≥20 concluídos, taxa ≥0,10, janela 15min | Diagnóstico tab (#394) → journal → deep links Sentry/Inngest |
| `stalled_operation` | operação além do lease real de geração | `STALLED_OPERATION_ALERT_PROPOSAL`: queued >60min, processing >10min (leases de output em `creative-work/[id]/route.ts`; o lease de 5min da rota rege `creative_work_sources`, fora desta regra) | fila/lease no journal; nunca aciona failStale/requeue |
| `missing_expected_events` | terminais canônicos ausentes do journal | `MISSING_EVENTS_ALERT_PROPOSAL`: ≥10 terminais canônicos, razão ausente ≥0,20, janela 15min | funil canônico × journal (`envelope.ts` reentrada parcial) |
| `telemetry_drop` | perda nova de telemetria desde a última avaliação | `TELEMETRY_DROP_ALERT_PROPOSAL`: ≥1 nova perda (contadores `degraded`/drop do journal + `droppedSpans/failedFlushes` do AI-tracer + linhas stderr `[diagnostic-journal]`/`[ai-tracing]` com sufixo `; telemetry affected, generation unaffected`) | logs stderr de emergência; geração segue inalterada |

Mudança de limiar é mudança de comportamento: os objetos de proposta são dados com testes fixando os valores (`alerts.test.ts`), ajustáveis sem mudar o formato do código.

## Procedimento de investigação

1. Console `/feedback`, aba Diagnóstico (#394): filtre por workspace/work/stage/provider/model/state na janela UTC do alerta; confirme a coorte `(protocol, environment, dataOrigin)` — nunca misture produção/staging/sintético/teste.
2. Detalhe do Trabalho: `work` canônico + `telemetry` do journal (`status ok|unavailable`, flag `partial`, envelopes, `nextCursor`).
3. Detalhe da chamada (requer `reason` de auditoria de 1–500 chars): projeção + conteúdo redigido + `externalRefs` (Sentry/Inngest/Langfuse).
4. Causa provável por regra: falha terminal → Sentry/Inngest runs; stall → idade da operação × leases (sem tocar failStale); eventos ausentes → reentrada parcial/envelope legado; drop → contadores + stderr de emergência.
5. Registre a decisão na tabela de evidência abaixo (SHA, configuração, evidência, ação).

## Ações permitidas × proibidas

Permitidas (humano explícito): alterar flags `OBSERVABILITY_*` por estágio autorizado; rodar `diagnostics:cleanup` em dry-run/apply; consultar console/journal/APIs de leitura.

Proibidas: remediação autônoma; kill/restart de jobs; mudanças de prompt, modelo, provedor, preço ou liquidação; captura `redacted` sem recibo `DIAGNOSTICS_CONTENT_POLICY_RECEIPT` válido; expansão de allowlist sem aceite do estágio.

## Estágios de rollout (execução BLOQUEADA — ver registro de decisão)

Pré-condições para qualquer estágio: aba #394 no ar, matriz #396 verde com recibo de staging, recibo de política de conteúdo válido para o estágio (só estágio 3+), evidência de overhead dentro do orçamento, prova de exclusão (#428).

| Estágio | Configuração | Critério para avançar |
| --- | --- | --- |
| 0 — desligado (atual) | `OBSERVABILITY_ENABLED=false`, demais defaults congelados | #394 + #396 concluídos |
| 1 — staging metadata | staging: `OBSERVABILITY_ENABLED=true`, `OBSERVABILITY_CONTENT_MODE=metadata_only`, allowlist vazia | recibo de staging PASS + aceitação humana |
| 2 — 1 workspace interno | + allowlist com 1 workspace interno, ainda `metadata_only` | observação sem alertas espúrios + aceite |
| 3 — redacted autorizado | modo `redacted` + recibo `DIAGNOSTICS_CONTENT_POLICY_RECEIPT` válido (aprovação do responsável + exclusão remota demonstrada contra endpoint real; mecanismo #391 entregue em #430) | aceite formal; sem recibo este estágio não executa |
| 4 — expansão | allowlist ampliada por decisão registrada | evidência por expansão |

## Reversão

`OBSERVABILITY_ENABLED=false` (ou `shutdownContentCapture()`) interrompe novas emissões; a aba pode ser ocultada atrás do mesmo check de owner + flag (`isDiagnosticCaptureEnabled()`); linhas anteriores seguem a retenção (índice 30d, rastros de IA 7d, auditoria 90d); `diagnostics:cleanup` continua ativo. Reversão é alteração humana de ambiente com evidência registrada — não substitui correção nem encerra investigação.

## Release checklist (todos vinculados a SHA + evidência)

- [ ] Recibo de staging PASS (etapa humana — #396 registra BLOCKED ou recibo).
- [ ] Aba #394 no ar atrás de owner + flag.
- [ ] Matriz #396 verde (restart/lost-context/duplicados/exporter-indisponível/bounded-vendor).
- [ ] Recibo de política de conteúdo válido (exigido a partir do estágio 3).
- [ ] Overhead dentro do orçamento (p95 ≤ +5%, RSS ≤ +20 MiB, n≥200/condição).
- [ ] Prova de exclusão remota persistida (#428).

## Evidência de decisão

| Data/hora UTC | Owner | Ambiente | Commit | Decisão e justificativa |
| --- | --- | --- | --- | --- |
| 2026-09-18 | agent (#397) | n/a — código + docs, sem execução | (branch `feat/397-alerts-runbook`) | Alertas + runbook + vars em defaults congelados entregues; execução dos estágios BLOQUEADA em #394/#396 + aprovação humana do estágio 3 — ver `docs/decisions/2026-09-18-trace-397-rollout-record.md`. |
