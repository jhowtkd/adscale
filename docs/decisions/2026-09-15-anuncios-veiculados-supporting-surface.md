# Decisão: Anúncios veiculados é superfície de leitura, não destino criativo

**Data:** 2026-09-15
**Status:** Aprovada no mapa [Wayfinder: Meta Ads, voz no pedido e MCP/skills](https://github.com/jhowtkd/adscale/issues/343)
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**Spec:** [`2026-09-15-anuncios-veiculados-design.md`](../superpowers/specs/2026-09-15-anuncios-veiculados-design.md)

## O que muda

A superfície **Anúncios veiculados** (rota `/served-ads`) entra como **módulo de apoio**. Não é pipeline de geração, não cria Trabalho nem Peça, não alimenta Referência visual.

O freeze de destinos primários **permanece** para jornadas criativas. Esta exceção autoriza um 5º ícone **no desktop**, a rota `/served-ads`, APIs de leitura, e uma entrada `supporting_module` no manifesto — não `primary_destination`.

Landing Page e Persona Simulation continuam congelados.

## Como o gate passa (obrigatório)

`app/scripts/check-primary-destinations.mjs` lê `snapshots` de **`origin/main`**, não do checkout do PR. Um PR que cria a rota **e** atualiza o JSON falha.

1. **PR de exceção** mergeia em main só o manifesto: `supporting_module` + `snapshots` já contendo `served-ads` (páginas e APIs futuras).
2. **PR de implementação** cria esses arquivos. Aí o current set ⊆ snapshot de main.

Sem `PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP` neste esforço.
