# Gate de homologação — evento sintético (BLOCKED, com evidência)

**Data:** 2026-09-16
**Ticket:** [jhowtkd/adscale#384](https://github.com/jhowtkd/adscale/issues/384) (critério 6) · **ADR:** [0017](../adr/0017-diagnostico-peca-unica-contrato-rastreabilidade.md)
**Check real:** `app/scripts/check-diagnostics-staging-gate.mjs` (teste: `check-diagnostics-staging-gate.test.mjs`)

## Veredito: BLOCKED — sem acesso a staging; nenhum rollout autorizado

O critério exige evento sintético emitido por processo (web + worker) em staging com recebimento verificado (IDs, SHA, tempo) — ou, sem acesso ao ambiente, o gate registrado como bloqueado, testes locais seguindo e nenhum rollout real autorizado. Este ambiente é o segundo caso.

## Evidência da checagem (base `92bc0ed2`, 2026-09-16)

1. `DIAGNOSTICS_STAGING_RECEIPT` não configurada; execução do check:
   ```text
   STATUS=BLOCKED
   reason=DIAGNOSTICS_STAGING_RECEIPT is not set: no staging receipt configured in this environment
   head=92bc0ed2
   rollout_authorized=false
   ```
   (exit 2 = bloqueado; exit 1 = recibo inválido; exit 0 = PASS com recibo válido.)
2. `render.yaml`: serviços `adscale-app` (web), `adscale-image-worker` (worker) e `adscale-postgres` — **nenhum serviço, branch ou env de staging**; zero ocorrências de `staging`/`STAG*`.
3. `app/src/server/validation/env.ts`: schema sem qualquer variável de staging.
4. Nenhuma chamada paga, produção ou deploy foi executada neste ticket.

## O que desbloqueia (trabalho futuro, com autorização própria)

Emitir um evento sintético (`dataOrigin: "synthetic"`) por processo em staging, coletar o recibo `{environment, dataOrigin, releaseSha, receivedAt, processes: ["web","worker"], eventIds[]}` e apontar `DIAGNOSTICS_STAGING_RECEIPT` para ele — o mesmo check passa a retornar `STATUS=PASS` sem mudar código. Testes locais continuam verdes enquanto isso.
