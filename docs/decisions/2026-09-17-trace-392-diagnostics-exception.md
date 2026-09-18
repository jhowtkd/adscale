# Exceção ao congelamento: API de diagnóstico de Peça única (trace-392)

**Data:** 2026-09-17
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**PR de implementação (depois desta exceção):** a abrir a partir de `codex/trace-392-diagnostics-api`
**Spec:** [jhowtkd/adscale#382](https://github.com/jhowtkd/adscale/issues/382) · **Ticket:** [jhowtkd/adscale#392](https://github.com/jhowtkd/adscale/issues/392) · **Classificação:** [2026-09-16-trace-384-routes-and-destinations.md](./2026-09-16-trace-384-routes-and-destinations.md)

## Contexto

O anti-expansion gate rejeita qualquer grupo de dashboard, página, árvore
ou rota de API novos. A API somente-leitura de diagnóstico precisa de três
endpoints GET aninhados ao ramo `feedback` existente (lista/busca de
Trabalhos, detalhe do Trabalho, detalhe de chamada), servindo a aba
Diagnóstico do console `/feedback` existente — sem página nova, sem botão
na navegação principal do Estúdio.

Não é destino criativo nem jornada concorrente: é observabilidade
somente-leitura para Dono da plataforma, sem escrita de negócio, sem
crédito, sem Settlement, sem replay, sem controle de geração. Guard
`requirePlatformOwner` obrigatório no servidor, `Cache-Control: private,
no-store`, associação Trabalho→workspace→Peça/chamada validada no
servidor, leitura de conteúdo auditada (negada se a auditoria falhar).

Sem esta exceção na base, o PR de implementação não consegue passar o gate,
porque o snapshot é lido de `main`, não do próprio PR.

## Escopo da exceção

Somente estes artefatos entram no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `feedback/diagnostics/works/route.ts` | GET lista/busca de Trabalhos (busca exata, filtros, cursor). |
| `feedback/diagnostics/works/[workItemId]/route.ts` | GET detalhe do Trabalho (estado canônico, eventos, disponibilidade, links privados). |
| `feedback/diagnostics/works/[workItemId]/calls/[callId]/route.ts` | GET detalhe de chamada (somente projeção permitida, auditada). |

`single_piece_diagnostics` entra em `allowedPrimaryDestinations` como
`supporting_module`. Nenhuma árvore nova (tudo aninhado ao ramo `feedback`
existente), nenhuma página nova.

## Fora do escopo

- Aba Diagnóstico no console (ticket #394, edita `feedback/page.tsx` existente).
- Replay, controle/ação de geração, métricas financeiras, editor de consultas.
- Novas páginas, grupos ou árvores além do ramo `feedback` existente.
- Landing Page e Persona Simulation continuam congelados.

## Consequências

- Depois do merge em `main`, o PR de implementação deve incorporar a base;
  o gate deixa de recusar os artefatos acima.
- Qualquer outra expansão continua bloqueada.
