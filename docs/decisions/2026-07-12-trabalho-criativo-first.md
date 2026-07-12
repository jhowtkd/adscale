# Decisão: Trabalho criativo-first

> **Esta decisão foi promovida para ADR.** Texto canônico:
> [`docs/adr/0013-trabalho-criativo-first.md`](../adr/0013-trabalho-criativo-first.md).
> Este arquivo permanece como atalho histórico; a fonte da verdade é o ADR.

**Data:** 2026-07-12
**Status:** Aprovada (Gate 0 do plano de convergência)
**ADR:** [0013 — Trabalho criativo-first](../adr/0013-trabalho-criativo-first.md)
**Plano de execução:** [docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md](../plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md)

## Resumo

A espinha do produto é **um único trabalho criativo**. Todas as
superfícies são adapters sobre o mesmo contrato canônico:

```text
Marca/cliente
  → intenção e briefing
  → trabalho criativo
  → geração
  → revisão e aprovação
  → entrega
  → aprendizado
```

Princípios, papéis canônicos por superfície, mapeamento contra o
Cognitive Atlas (ADR 0012) e alternativas consideradas estão no ADR.

## Artefatos operacionais

| Artefato | Caminho |
| -------- | ------- |
| ADR canônico | `docs/adr/0013-trabalho-criativo-first.md` |
| Manifesto de destinos + snapshot | `docs/decisions/allowed-primary-destinations.json` |
| Marcador de congelamento in-tree | `app/src/server/ai/FROZEN.md` |
| Funil canônico | `app/src/server/creative-work/funnel-events.ts` |
| Baseline por origem | `app/scripts/capture-convergence-baseline.mjs` |
| Anti-expansion gate | `app/scripts/check-primary-destinations.mjs` |
| Frozen-modules gate | `app/scripts/check-frozen-modules.mjs` |
| Wrapper de gate | `app/scripts/run-convergence-gate.mjs` |

## Como acionar

```bash
# CI e release gate rodam o wrapper automaticamente. Manualmente:
cd app
npm run convergence:gate           # anti-expansion + frozen-modules
npm run convergence:baseline       # snapshot por origem (precisa DATABASE_URL)
```
