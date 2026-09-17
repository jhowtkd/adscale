# 0018 — Piloto controlado de Quality Recovery + Brand Cortex (ICE-05B)

**Data:** 2026-09-17
**Status:** Aceita
**Decisor:** Jhonatan Soares (founder)
**Ticket:** [jhowtkd/adscale#405](https://github.com/jhowtkd/adscale/issues/405) — ICE-05B: scoped pilot + release decision

## Contexto

Quality Recovery (`quality_recovery_v1`) e Brand Cortex para Peça única (`single`) decidiam por switches globais lidos em vários pontos (prepare, re-prepare, worker), sem coorte definida nem semântica congelada: virar um switch reinterpretava trabalhos já preparados e em voo. O piloto ICE-05B exige escopo controlado — coorte explícita, critérios de parada e decisão humana de go/no-go — antes de qualquer expansão.

## Decisão

1. **Resolvedor único** (`app/src/server/creative-work/quality-policy.ts`, `resolveQualityFeaturePolicy`): toda decisão de quality-feature passa por ele. Snapshots existentes nunca são reinterpretados — o valor congelado decide, seja qual for a configuração viva. Novas preparações decidem por elegibilidade de protocolo + switch + allowlist, e o veredito é congelado no snapshot.
2. **Switches e allowlists separados por feature**: `CREATIVE_WORK_QUALITY_RECOVERY_ENABLED` + `QUALITY_RECOVERY_PILOT_WORKSPACES` para recovery; `BRAND_CORTEX_SINGLE_PIECE_ENABLED` + `BRAND_CORTEX_PILOT_WORKSPACES` para Cortex. Allowlist é CSV de UUIDs de workspace; entrada malformada falha fechado (`invalid_pilot_allowlist`) em vez de escopar errado.
3. **Semântica da allowlist**: vazia = o switch decide sozinho (rollout global quando ligado); preenchida = só workspaces membros recebem a feature. O piloto opera com allowlist preenchida; esvaziá-la é a promoção para geral, feita só após o go.
4. **Worker sem switches** (`app/src/server/jobs/creative-work.ts`): construído com switches/allowlist `undefined`, lê só o snapshot congelado. Trabalhos em voo terminam sob o contrato original quando a configuração muda.
5. **Coorte do piloto**: 1–3 workspaces internos/parceiros, inscritos por UUID nas allowlists de staging/produção. Sem auto-inscrição, sem expansão automática.
6. **Critérios de parada** (qualquer um pausa o piloto via switch → `false`, sem deploy de código): erro de geração acima da linha de base do workspace por 24h; reclamação de qualidade ligada ao recovery/Cortex; allowlist malformada bloqueando prepares; custo de chamadas acima do orçamento congelado por peça.
7. **Go/no-go humano**: não há promoção automática. Após 7 dias de piloto sem critério de parada, o founder decide: go = esvaziar a allowlist (ou ampliá-la); no-go = desligar o switch e manter os snapshots congelados intactos. A decisão fica registrada como comentário no ticket #405.

## Consequências

- O que fica mais fácil: ligar/desligar cada feature por workspace sem tocar em código; auditar quem está no piloto lendo duas variáveis; reverter sem reinterpretar histórico.
- O que fica mais difícil: cada novo workspace piloto exige edição de env + redeploy/restart; esquecer a allowlist preenchida após o go mantém o resto do mundo fora — o go precisa esvaziá-la explicitamente.
- O que destrava: medição isolada de qualidade/custo por coorte antes do rollout geral.

## Alternativas consideradas

- **Allowlist vazia = negar tudo:** rejeitado — quebraria o comportamento atual do switch sozinho e exigiria coorte até para staging sem workspaces fixos.
- **Coorte em banco/tabela:** rejeitado — env versionada no deploy é auditável e dispensa migração; o piloto tem 1–3 workspaces.
- **Resolver por feature em módulos separados:** rejeitado — um único ponto de decisão impede divergência de semântica entre prepare e worker.
