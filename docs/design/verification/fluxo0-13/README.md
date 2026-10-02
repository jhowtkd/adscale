# Correções da revisão de tela do PR 614 · ticket 13

Capturas de 01/10/2026 depois das correções T1 a T8, Chromium (Playwright) contra `next dev` com o gate ligado, tema escuro, movimento reduzido, fuso de São Paulo, banco de teste descartável e leitores de mentira. Os estados são os do parecer de tela (`review-pr-614-c3c280db-tela`): os mesmos roteiros (`app/scripts/pilot-states.ts`, mais um `UPDATE` do cartão do handoff nos casos de falha e de paleta) e o "É isso" de verdade seguido do comando real `diagnosis_fail` (`app/scripts/pilot-diagnosis-fail.ts`). Os nomes repetem os do parecer para comparar um a um; só `t1-arrival-*` e `t8-later-pt-d1440` são novos (o parecer tinha apenas o "antes" cortado). O que o parecer mostrou e esta pasta não repete não mudou.

| Item | Depois | Antes (parecer) | O que mostra |
| --- | --- | --- | --- |
| **T1** (P2) | [1440×900](t1-arrival-d1440x900.png) · [1280×800](t1-arrival-d1280x800.png) · [1536×864](t1-arrival-d1536x864.png) · [1440×820](t1-arrival-d1440x820.png) · [430×932](t1-arrival-m430x932.png) | `d12-arrival-cut-*` | "Falar com uma pessoa" e a frase de baixo **inteiros à vista** ao abrir a conversa com o crédito esgotado |
| **T2** (P2) | [desktop](id-palette-identity-d1440.png) · [celular](id-palette-identity-m390.png) | `id-palette-identity-*` | Cores: "Não encontrado" e "Não encontrei as cores da marca. Informe em Editar Cores, ou continue sem." |
| **T3** | [id-logo-small-d1440](id-logo-small-d1440.png) | `id-logo-small-d1440` | Mesa de 4 cartas centralizada, sem vão no meio |
| **T4** | [desktop](d10-fail-generic-d1440.png) · [celular](d10-fail-generic-m390.png) | `d10-fail-generic-*` | Aviso a 14 px no tom de erro do card; "Tentar de novo" do tamanho do texto |
| **T5** | [desktop](d10-fail-limit-d1440.png) · [celular](d10-fail-limit-m390.png) | `d10-fail-limit-*` | 3ª leitura que falha: a causa, depois "Você usou as 3 leituras…", uma vez só |
| **T6** | [Editar Cores](id-palette-typing-d1440.png) · [depois do pedido](d12-requested-d1440.png) | `id-palette-typing-d1440`, `d12-requested-d1440` | O foco vai ao campo; depois de "Falar com uma pessoa" vai à confirmação (anel visível), em vez de cair na página |
| **T7** | [en, 2ª mensagem](d12-en-chat-2-d1440.png) | `d12-en-chat-2-d1440` | A resposta fixa, guardada em pt-BR, aparece em inglês |
| **T8** | [pt-BR](t8-later-pt-d1440.png) · [en](d12-en-later-d1440.png) | `d12-en-later-d1440` | "Agora não" no cartão do plano: a linha fixa "Tudo bem. Quando quiser, é só dizer “quero assinar”.", sem cartão novo e sem modelo |

## T1 em números

Pixels do botão e da frase embaixo dele que ficavam abaixo do fim da conversa na chegada (três chegadas por janela, sempre o mesmo número):

| Janela | Antes (botão / frase) | Depois |
| --- | --- | --- |
| 1440×900 | 24 / 48 | 0 / 0 |
| 1536×864 | 60 / 84 | 0 / 0 |
| 1280×800 | 124 / 148 | 0 / 0 |
| 1440×820 | 104 / 128 | 0 / 0 |
| 430×932 | 90 / 130 | 0 / 0 |
| 1920×1080, 1440×1000, 768×1024, 390×844 | 0 / 0 | 0 / 0 |

Depois, em todas as janelas com rolagem, a conversa termina no fim (`scrollTop` igual ao máximo).

## Como reproduzir

- **No navegador:** `app/tests/e2e/credit-ended-assistant.spec.ts` confere T1 (oito janelas, três chegadas cada, e a pessoa que espera na página), e T7 e T8 (o fluxo do "Agora não" em pt-BR e en, com o que a conta guarda). Precisa do servidor com o gate ligado e leitores de mentira, como em [fluxo0-09](../fluxo0-09/README.md); o estado de crédito esgotado sai do "É isso" de verdade e de `NODE_OPTIONS=--conditions=react-server npx tsx scripts/pilot-diagnosis-fail.ts budget_exceeded`.
- **T2 a T6** também estão nos testes de componente (`HandoffCard.screen-review.test.tsx`, `Mesa.test.tsx`, `EquipePlanOffer.test.tsx`, `DiagnosisCard.budget.test.tsx`).
- Para o E2E local, o servidor precisa de `E2E_DISABLE_RATE_LIMIT=true` (o login tem limite de 3 em 10 s e cada teste entra de novo).
