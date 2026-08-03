# Aceitação da primeira onda de microanimações

Data: 2026-08-02

Baseline: `3261b1b2`

Implementação aceita: `ed25eac9`

## Resultado

A primeira onda foi aceita com primitives locais e CSS. `animate-ui` não foi instalado: a auditoria encontrou cobertura suficiente no runtime já existente e o candidato Base UI do ticket #144 não está montado por nenhuma rota autenticada.

| Contrato | Evidência | Resultado |
| --- | --- | --- |
| Movimento normal | dashboard em `180ms`; campanha e biblioteca em `120ms` | passou |
| Movimento reduzido | dashboard, campanha e biblioteca resolvem em `0.01ms`, sem perda semântica | passou |
| Resposta da seleção | `36ms` no modo normal e `26ms` com redução no walkthrough final | passou |
| Teclado e foco | protocolo, checkbox, ação da biblioteca, salvar perfil, falha/retry e seletor de marca | passou |
| Estados e overlays | dashboard, campanhas, workspace, settings, confirmação destrutiva, review sheet e layer harness | passou |
| Gate visual estático | 22 ocorrências de dívida na baseline e 22 após a onda; nenhuma ocorrência nova | passou |
| Build de produção | baseline e implementação compilam com Next.js 16.2.6/Webpack | passou |
| Bundle inicial | `675901` → `677118` bytes, `+1217` bytes (`+0.18%`), abaixo do limite de `2 MB` | passou |
| Volume lazy informativo | `2344947` → `2347863` bytes, `+2916` bytes (`+0.12%`) | passou |

## Matriz visual

Foram exercitados os viewports `390`, `768`, `1024`, `1280`, `1440` e `1920`, em `pt-BR` e `en`, conforme a matriz determinística existente. O shell autenticado força tema escuro; por isso uma solicitação de tema claro resolve para `dark` nas rotas reais. O layer harness isolado continua cobrindo o canvas claro sem alegar suporte a tema claro no produto autenticado.

O antigo cenário `account-dropdown` não é alcançável no shell atual: desktop expõe identidade e logout na sidebar; mobile expõe a sheet “Mais”. A captura stale foi removida da evidência pós-onda, sem criar um controle artificial.

## Verificações

- `npm test`: 635 arquivos passaram, 1 ignorado; 4520 testes passaram, 12 ignorados.
- `npm run typecheck`: passou.
- testes focados de motion/status/reduced-motion: 21 passaram.
- checker do contrato visual: 8 testes e execução completa passaram.
- Playwright: função, foco e semântica passaram em movimento normal e reduzido; tester entitlement revogado ao fim de cada projeto.
- `graphify update .`: grafo atualizado após as mudanças.

## Dívida preexistente observada

O walkthrough ainda registra avisos anteriores à onda sobre contraste, landmarks, campos read-only e hydration de variantes Motion. Eles não foram introduzidos por estes tickets e permanecem separados do aceite de microanimação.
