# Exceção ao congelamento: Anúncios veiculados (snapshot)

**Data:** 2026-09-15
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**PR de implementação (depois desta exceção):** [#363](https://github.com/jhowtkd/adscale/pull/363)
**Spec:** `docs/superpowers/specs/2026-09-15-anuncios-veiculados-design.md` (mapa #343)

## Contexto

O anti-expansion gate rejeita qualquer grupo de dashboard, página, árvore
ou rota de API novos. A fatia snapshot de Anúncios veiculados precisa de
uma superfície de leitura (`/served-ads` + `GET /api/served-ads`) sobre
modelo próprio (`meta_connections` → `meta_ad_accounts` → `served_ads` +
métricas, migrations 0103–0106), alimentada por fixture determinístico
(7/30/90 dias) até o Meta App (#348, ainda OPEN).

Não é destino criativo nem jornada concorrente: é observabilidade
somente-leitura de ads servidos, sem escrita, sem crédito, sem Settlement.
A conexão live (OAuth Meta, `META_TOKEN_ENCRYPTION_KEY`, sync 6h, cópia de
mídia, TTL 90d) é esforço próprio posterior, com exceção à parte se criar
superfície nova.

Sem esta exceção na base, o PR de implementação não consegue passar o gate,
porque o snapshot é lido de `main`, não do próprio PR.

## Escopo da exceção

Somente estes artefatos entram no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `served-ads` (grupo) + `served-ads/page.tsx` | Página de leitura dos anúncios veiculados. |
| `served-ads` (árvore) + `served-ads/route.ts` | GET de leitura (fixture até #348). |

O manifesto também absorve o drift do merge da #361 (árvore `mcp`,
`mcp/route.ts`, `workspace/mcp-tokens/*`), que entrou na `main` sem
snapshot e era aceito só pelo reparo de drift do gate. Isso sincroniza o
snapshot sem autorizar artefato adicional desta mudança. `served_ads`
entra em `allowedPrimaryDestinations` como `supporting_module`.

## Fora do escopo

- Conexão live Meta (OAuth, sync, tokens, mídia, TTL 90d).
- Novas páginas, grupos ou árvores além de `served-ads`.
- Escrita, crédito, Settlement.
- Landing Page e Persona Simulation continuam congelados.

## Consequências

- Depois do merge em `main`, o PR #363 deve incorporar a base; o gate deixa
  de recusar os artefatos acima.
- Qualquer outra expansão continua bloqueada.
- Evidência de uso (funil escopado em Trabalho, decisão de 2026-09-12) segue
  exigida para futuras exceções de superfície criativa; esta cobre leitura
  observacional, sem nova superfície de decisão criativa.
