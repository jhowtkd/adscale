# Fase 7 — matriz de aposentadoria da árvore `/v6`

**Data:** 2026-07-14

**Escopo:** itens 51–54 do plano de convergência

**Decisão:** nenhuma diferença exclusiva da árvore preview precisa ser migrada.

## Comparação

| Preview | Superfície produtiva | Decisão |
| --- | --- | --- |
| `/v6/dashboard` | `/` e `/dashboard`, usando `DashboardV6View` | apagar preview |
| `/v6/campaigns` | `/campaigns`, usando `CampaignsV6View` | apagar preview |
| `/v6/campaign-workspace` | `/campaigns/[id]`, usando o chrome e briefing compartilhados | apagar preview e a interface não interativa |
| `/v6/library` | `/library`, usando `LibraryV6View` | apagar preview |
| `/v6/settings` | `/settings`, usando `SettingsV6View` | apagar preview |
| `/v6/login` | `/login` e demais rotas de auth, usando os mesmos modules de auth | apagar preview |
| `/v6/chat-full` e `/v6/chat-thread-curta` | `/assistant`, com threads reais | apagar mockups |
| `/v6/chat-drawer` | drawer produtivo de campanha | apagar mockup |
| `/v6/assistant-empty` | estado vazio produtivo do Assistente | apagar mockup |
| `/v6/library-empty` | estado vazio produtivo da Biblioteca | apagar mockup |
| `/v6/error-state` | estados de erro e retry exercitados no Gate 6 | apagar mockup |
| `/v6/onboarding` | intenção-first da Home | apagar conceito anterior à convergência |
| `/v6/topbar-promo` | roteador de intenção e entrada do Assistente | apagar conceito promocional paralelo |
| `/v6` | nenhuma; era apenas índice dos mockups | apagar índice |

## Evidência por item

- **51 — comparação:** matriz acima; zero diferença aprovada pendente.
- **52 — migração:** nenhuma migração necessária. As cinco interfaces visuais reutilizáveis já eram consumidas pela produção.
- **53 — fixtures:** dashboard, campanhas, workspace, biblioteca e configurações já usavam adapters de fixtures sobre os mesmos modules visuais. Com a aposentadoria, fixtures de produto paralelas deixam de existir.
- **54 — remoção:** árvore `app/src/app/(preview)/v6`, a11y gate exclusivo, script de screenshots e branches de navegação/autenticação removidos.

## Proteção contra regressão

`scripts/check-no-parallel-preview.mjs` faz parte do `convergence:gate` e rejeita:

1. qualquer arquivo novo em `src/app/(preview)/v6`;
2. qualquer literal de rota `/v6` em `src`.

O nome interno `components/**/v6` permanece temporariamente porque esses modules são a implementação produtiva atual, não uma segunda árvore de produto.
