# Registro de rollout da rastreabilidade — estágio 0, execução bloqueada

**Data:** 2026-09-18
**Ticket:** [jhowtkd/adscale#397](https://github.com/jhowtkd/adscale/issues/397) · **Spec:** #382 · **Runbook:** [diagnostics-traceability-rollout.md](../runbooks/diagnostics-traceability-rollout.md)

## Veredito: código + docs entregues; execução dos estágios BLOCKED

Este ticket entrega o mecanismo (regras de alerta puras + testes, helper `isDiagnosticCaptureEnabled()`, runbook, checklist, vars `OBSERVABILITY_*` declaradas em defaults congelados) sem executar nenhum estágio de captura. Nenhum agente aprova o próprio rollout.

## Evidência do mecanismo (branch `feat/397-alerts-runbook`)

1. `app/src/server/diagnostics/alerts.ts` — 4 regras (`terminal_failure_rate`, `stalled_operation`, `missing_expected_events`, `telemetry_drop`), propostas de limiar como dados, coortes `(protocol, environment, dataOrigin)`, `insufficient_sample` sem zerar, emissão só via log estruturado + `captureExceptionOnce` (single-capture; #406).
2. `alerts.test.ts` — 31 testes (regras, fronteiras, separação de coortes, baixa amostra, single-capture pelo logger real contra regressão #406); `alerts.pg.test.ts` — 7 testes, prova pg-backed somente-leitura.
3. `isDiagnosticCaptureEnabled()` em `observability.ts` (+ testes) — leitura pura de env para o gate da aba; `render.yaml` + `.env.example` com os 4 vars em defaults congelados (captura desligada); produção inalterada em comportamento.
4. Nenhuma migration, nenhuma mudança em geração/settlement/retry/lease/Inngest, nenhum novo destino primário (tudo sob `/feedback`).

## O que desbloqueia cada estágio (trabalho futuro, com autorização própria)

- Estágio 1 (staging metadata): #394 (aba Diagnóstico) no ar + #396 (matriz verde + recibo de staging) + aceite humano; sem acesso a staging este registro continua BLOCKED.
- Estágio 2 (1 workspace interno): estágio 1 observado sem alertas espúrios + aceite.
- Estágio 3 (redacted autorizado): recibo `DIAGNOSTICS_CONTENT_POLICY_RECEIPT` válido (aprovação do responsável + exclusão remota demonstrada contra endpoint real; mecanismo #391 entregue em #430) — sem recibo este estágio nunca executa.
- Estágio 4 (expansão): decisão registrada por ampliação, com evidência.
