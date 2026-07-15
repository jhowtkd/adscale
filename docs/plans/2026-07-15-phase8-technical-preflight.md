# Fase 8 — preflight técnico para sessões humanas

**Status:** verde em ambiente local controlado; evidência humana continua pendente.

Este preflight existe para que participantes humanos não sejam usados como depuradores de infraestrutura. Ele não conta como jornada da amostra e não altera o status `collecting` do Gate 8.

## Correções incluídas

- `6e38cf19`: criação sem imagem, jobs serializados, retomada, Assistente e contrato MiniMax.
- `e52397da`: associação de output ao nível criativo pelo próprio `creativeLevel`, card sem botão interativo aninhado e autenticação determinística do UAT na conta Dev Admin.
- Harness: fallback pela mesma API canônica quando a hidratação do Next dev aborta uma mutation; rotas continuam falhando o teste em qualquer resposta não 2xx.

## Evidência automatizada

Executada em 2026-07-15 com Next local, Postgres, Inngest e provider controlado:

| Cenário técnico | Resultado |
|---|---|
| S03 — Criar Post, gerar três outputs e aparecer em Trabalhos | pass |
| S07 — preview aceitável, continuação automática e cobrança | pass |
| S08 — preview inválida, quality gate e continuação explícita | pass |
| S09 — créditos da UI iguais ao resolver e ao ledger | pass |
| S11 — salvar na Biblioteca e reabrir imagem pelo proxy | pass |
| S12 — estados empty/loading/error/retry | pass |

Validações locais: 31 testes direcionados, `npm run typecheck`, ESLint dos arquivos tocados e `PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP=1 npm run convergence:gate` passaram.

## Handoff ao moderador

O proprietário do produto não precisa repetir o preflight. O próximo operador deve:

1. iniciar o app com `E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true npm run dev:next`;
2. iniciar Inngest local e executar `npm run seed:phase8-human`;
3. entregar ao participante apenas a instrução neutra definida no protocolo;
4. registrar as jornadas em `.planning/convergence/phase8-human-journeys.json` sem orientação passo a passo;
5. executar `npm run convergence:phase8-check` somente depois da amostra completa.

Fonte de verdade da amostra: `docs/plans/2026-07-14-phase8-human-evidence-protocol.md`.
