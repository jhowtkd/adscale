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

## O que não foi capturado

"Carregar mais" com as três fontes, as páginas só de `derivation` e o teto de 3 páginas por clique estão cobertos por testes jsdom:
- `CampaignPiecesOccupancy.test.tsx`;
- `CampaignWorkspace.grouped-works.test.tsx`, com os hooks reais e `apiFetch` mockado.

Não houve captura de browser desses casos.
