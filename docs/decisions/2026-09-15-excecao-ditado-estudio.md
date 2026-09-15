# Exceção ao congelamento: ditado por voz no Estúdio

**Data:** 2026-09-15
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**PR de implementação (depois desta exceção):** [#360](https://github.com/jhowtkd/adscale/pull/360)
**Spec:** `docs/superpowers/specs/2026-09-15-ditado-estudio-design.md` (mapa #343)

## Contexto

O anti-expansion gate rejeita qualquer rota de API nova, inclusive aninhada
a uma árvore existente. O ditado por voz no composer do Estúdio precisa de
uma rota de suporte para transcrever o áudio e devolver texto limpo no
cursor, sem substituir o conteúdo existente.

Não é destino novo nem jornada concorrente: é método de entrada dentro do
fluxo canônico do Trabalho (`creative_work_home`). Sem crédito, fora do
Settlement, teto de 15 min/dia por workspace, áudio descartado.

Sem esta exceção na base, o PR de implementação não consegue passar o gate,
porque o snapshot é lido de `main`, não do próprio PR.

## Escopo da exceção

Somente esta rota de suporte entra no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `creative-work/dictation/route.ts` | Receber o take de áudio, transcrever (`gpt-4o-mini-transcribe`) + limpeza leve, devolver texto no cursor. Sem streaming, 2 min por take. |

O manifesto também absorve rotas e a árvore que já existem na `main` e eram
aceitas só pelo reparo de drift do gate (`library`, `calibration`,
`favorite`, `person-references`, `library/favorites`). Isso sincroniza o
snapshot sem autorizar artefato adicional desta mudança.

## Fora do escopo

- Nova página, grupo de dashboard ou árvore de API.
- Streaming de transcrição, novos idiomas além de pt-BR/en, novos limites.
- Crédito, Settlement, persistência de áudio.
- Landing Page e Persona Simulation continuam congelados.

## Consequências

- Depois do merge em `main`, o PR #360 deve incorporar a base; o gate deixa
  de recusar a rota acima.
- Qualquer outra rota nova continua bloqueada.
- Evidência de uso (funil escopado em Trabalho, decisão de 2026-09-12) segue
  exigida para futuras exceções de superfície; esta cobre método de entrada
  dentro do destino existente, sem nova superfície de decisão.
