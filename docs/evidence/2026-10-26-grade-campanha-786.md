# Grade da Campanha lê os Trabalhos agrupados pela listagem da Campanha (#786): evidência local de browser (2026-10-26)

Triagem: caminho A, com as duas recomendações (último comentário da issue #786).
Antes: `main` em `774d4642`. Depois: branch `fix/786-grade-campanha`.

> **Evidência local.** Os números vêm de um Postgres descartável com dados sintéticos e de builds locais.
> Nenhum dado real foi usado, e nenhuma chamada paga foi feita.

## Ambiente

- Postgres 16.15 (container `adscale-test-postgres`, porta 5433), migrado até a `main`.
- Node v24.21.0. As duas versões rodam com `next build` + `next start` e apontam para o mesmo banco de teste:
  - branch na porta 3786;
  - `main` na porta 3787.
- Provider e chaves: `E2E_CONTROLLED_PROVIDER=true`, chaves placeholder do CI e storage local do E2E. Os blocos carregam os PNGs reais pela rota de download.
- Browser: Chromium headless (browser in-app do Traycer), perfil isolado, viewport 1440×1000.

## Seed

- Workspace de dev criado por `scripts/seed-dev-admin.ts --create` (`dev786@adscale.local`).
- Uma marca ("Marca 786") e uma Campanha com essa marca ("Campanha 786"), sem Peças próprias e sem materiais.
- **Um** Trabalho agrupado na Campanha, de 02/10, com uma Peça concluída (PNG "Agrupado (#786)").
- **25** Trabalhos mais novos da mesma marca, de 10/10, fora da Campanha, cada um com uma Peça concluída (PNGs "Recente 01"… "Recente 25").

O feed geral (`/api/creative-work?limit=24`) devolve os Trabalhos "Recente 25" a "Recente 02" na primeira página. O agrupado fica na segunda.

## Resultado

| | `main` | Branch |
| --- | --- | --- |
| Rótulo da grade | "Peças da marca · 24" | "Neste agrupamento · 1" |
| Trabalho agrupado na grade | **não aparece** | aparece, com link `/campaigns/<id>?creativeWork=<workId>`; o clique abre `/creative-work/<workId>` |
| Trabalhos de fora da Campanha na grade | 24 ("Recente 25" a "Recente 02") | nenhum |
| Pedido da grade a `/api/creative-work` | `?limit=24` (feed geral), 16.594 B | `?view=production&clientProfileId&campaignId&limit=24`, 553 B |

Os bytes vêm de `PerformanceResourceTiming.decodedBodySize`. Nas duas versões, a grade também pede `?view=inspirations` (37 B, vazio), como antes.

## Capturas

| Tela | Arquivo |
| --- | --- |
| `main`: o agrupado some, e a grade mostra 24 Trabalhos de fora como "Peças da marca" | [grade-1-antes-main.png](2026-10-26-grade-campanha-786/grade-1-antes-main.png) |
| Branch: a grade mostra só a Peça do Trabalho agrupado | [grade-2-depois-branch.png](2026-10-26-grade-campanha-786/grade-2-depois-branch.png) |

## Depois da revisão independente (F1–F5)

Branch em `8adc104e`, de novo com `next build` + `next start` sobre o mesmo banco. O seed ganhou duas Campanhas da mesma marca:
- "Campanha 786 vazia", sem nada próprio;
- "Campanha 786 com Peça falha", com uma Peça `failed`, sem imagem e sem `outputKey`.

| Campanha | Grade | Pedidos de `/api/creative-work` da grade |
| --- | --- | --- |
| Com o Trabalho agrupado | "Neste agrupamento · 1", **sem mudança** | `view=production&…&campaignId` (+ `view=inspirations`) |
| Vazia | "Peças da marca · 24": os Trabalhos com prévia do feed da marca (F2) | `view=production&…&campaignId`, depois `?limit=24&clientProfileId` (+ `view=inspirations`) |
| Com Peça falha | "Nenhuma peça neste agrupamento", **sem preenchimento da marca** (F3) | `view=production&…&campaignId` (+ `view=inspirations`); o feed da marca não é pedido |

| Tela | Arquivo |
| --- | --- |
| Campanha vazia: preenchimento pelo feed da marca | [grade-3-vazia-pecas-da-marca.png](2026-10-26-grade-campanha-786/grade-3-vazia-pecas-da-marca.png) |
| Campanha com Peça falha sem imagem: sem preenchimento | [grade-4-peca-falha-sem-preenchimento.png](2026-10-26-grade-campanha-786/grade-4-peca-falha-sem-preenchimento.png) |

**Vermelho e verde do teste de página** (`CampaignWorkspace.grouped-works.test.tsx`, com hooks reais e `apiFetch` mockado; o mock de `use-canonical-works` agora é parcial, F4):

| Código | Resultado | Por quê |
| --- | --- | --- |
| `main` (`774d4642`) | 6 falham, 1 passa | O agrupado não aparece (`Unable to find role="link" … Trabalho 1`), o retry não existe, e a listagem da Campanha nunca é pedida (F1 e F3). O caso F2, Campanha vazia com Peças da marca, também passa na `main`. Nenhuma falha vem do mock |
| Versão anterior do PR (`0297135e`) | 3 falham, 4 passam | F1 e F3 mostram "Peças da marca" com o Trabalho de fora vindo da listagem sem `campaignId`; F2 mostra a fonte antiga |
| Branch | 7 passam | — |

O F1 (cache vazio de uma visita anterior, com a resposta da listagem retida) não tem captura de browser, porque o intervalo é curto demais. Ele é coberto por esse teste.

## O que não foi capturado

"Carregar mais" com as três fontes, as páginas só de `derivation` e o teto de 3 páginas por clique estão cobertos por testes jsdom:
- `CampaignPiecesOccupancy.test.tsx`;
- `CampaignWorkspace.grouped-works.test.tsx`, com os hooks reais e `apiFetch` mockado.

Não houve captura de browser desses casos.
