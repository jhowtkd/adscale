# Gate de política de conteúdo — captura real (BLOCKED, com evidência)

**Data:** 2026-09-17
**Ticket:** [jhowtkd/adscale#391](https://github.com/jhowtkd/adscale/issues/391) (critérios 1 e 7) · **ADR:** [0017](../adr/0017-diagnostico-peca-unica-contrato-rastreabilidade.md)
**Check real:** `app/scripts/check-diagnostics-content-gate.mjs` (teste: `check-diagnostics-content-gate.test.mjs`)

## Veredito: BLOCKED — sem aprovação do responsável; captura real desligada

O critério exige captura de conteúdo real somente após aprovação da política pelo responsável pelo tratamento (modo + allowlist) e exclusão remota comprovada por reconsulta — ou, sem aprovação, o mecanismo implementado com testes, o gate registrado como bloqueado e a captura mantida desligada. Este ambiente é o segundo caso: nenhum agente aprova o próprio gate.

## Evidência da checagem (base `ca5b0353`, 2026-09-17)

1. `DIAGNOSTICS_CONTENT_POLICY_RECEIPT` não configurada; execução do check:
   ```text
   STATUS=BLOCKED
   reason=DIAGNOSTICS_CONTENT_POLICY_RECEIPT is not set: no data-owner approval in this environment
   head=61f604a8
   capture_authorized=false
   ```
   (exit 2 = bloqueado; exit 1 = recibo inválido/não comprovado; exit 0 = PASS com recibo válido.)
2. Configuração efetiva (prova em `content-policy.test.ts` + `getContentCaptureGateStatus`): `OBSERVABILITY_CONTENT_MODE` com default congelado `metadata_only`, `OBSERVABILITY_WORKSPACE_ALLOWLIST` vazia, verificadores de acesso/exclusão não ligados — `resolveContentPolicy` retorna `metadata_only` em todos os caminhos sem aprovação.
3. Mecanismo implementado e testado sem aprovar nada: resolução de política com verificação ordenada (`content-policy.ts`), sanitização sobre `redactTelemetry` com rótulo não-verbatim (`content-sanitize.ts`), leitura auditada com negação em falha de auditoria (`content-access.ts`, escrita em `diagnostic_access_audit` provada em Postgres real), limpeza com `--dry-run` e exclusão remota reconsultada (`content-cleanup.ts` + `diagnostics:cleanup`, remoto provado somente contra endpoint fake local — nenhum Langfuse real, nenhuma credencial).
4. Janelas de retenção como dados não aprovados (`DIAGNOSTIC_RETENTION_WINDOWS`: índice 30d, rastros de IA 7d, auditoria de acesso 90d) — valores propostos do spec #382, efetivos só após aprovação.
5. Nenhuma chamada paga, produção, deploy ou cópia para datasets foi executada neste ticket; o cliente de exclusão remota expõe somente delete + reconsulta (sem operação de dataset).

## O que desbloqueia (trabalho futuro, com autorização própria)

O responsável aprova a política (modo `redacted` + allowlist de workspaces), a exclusão remota é demonstrada contra o endpoint real com reconsulta, e o recibo `{policyVersion: "v1", approvedBy, approvedAt, retentionWindows: {30, 7, 90}, deletionProof: {endpoint, traceIds[], requeriedAt, allConfirmed: true}, allowlistedWorkspaces[]}` é apontado via `DIAGNOSTICS_CONTENT_POLICY_RECEIPT` — o mesmo check passa a retornar `STATUS=PASS` sem mudar código. Testes locais continuam verdes enquanto isso.
