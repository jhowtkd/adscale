# Layerize paid smoke — 2026-08-17

Autorizado pelo dono: 1 chamada sintética por formato, sem retry, teto US$2.
Reconciliado em 2026-08-18: Atlas devolveu US$0.1575 nas 3 calls. ZIPs canônicos gerados. Photoshop aprovado. Photopea/Affinity dispensados pelo dono.

| Formato | Request ID | Preço | Latência | Camadas | Gate | PSD | ZIP |
|---|---|---|---|---|---|---|---|
| 1:1 | `12e343ea295b428dadc2360b60486a72` | US$0.1575 | 73.5s | 6 | pass | [1x1/piece.psd](1x1/piece.psd) | [1x1/diagnostic.zip](1x1/diagnostic.zip) |
| 4:5 | `2555ea2b9e1d41878012f00c8fd607bb` | US$0.1575 | 75.8s | 6 | pass | [4x5/piece.psd](4x5/piece.psd) | [4x5/diagnostic.zip](4x5/diagnostic.zip) |
| 9:16 | `02893205884c42608e6711fbfc04c947` | US$0.1575 | 64.0s | 6 | pass | [9x16/piece.psd](9x16/piece.psd) | [9x16/diagnostic.zip](9x16/diagnostic.zip) |

Total cobrado: US$0.4725. Créditos ADScale: 0. Sem retry.

Contrato vivo vs código (depois de #269 em `feat/178-reference-selection`):

- Fatura: US$0.1575/imagem nas 3 calls. Catálogo US$0.022 estava stale.
- Host: `*.tos-ap-southeast-1.volces.com` agora está na allowlist dessa branch.
- `origin/main` ainda aponta para fal. Isto não é deploy.

ZIP: `original.png` + camadas + preview + manifest sem segredos. Bytes do original sintético conferidos.

Não prova: app autenticado, Inngest, R2, callback, deploy, flag, peça de cliente.
