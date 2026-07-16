# Phase 8 — Post-fix agent smoke

**Data:** 2026-07-16

**Fonte:** `technical_regression`

**Jornada humana:** não

## Objetivo

Verificar de forma controlada os contratos corrigidos em `98448874`, sem consumir uma nova geração paga e sem pedir outra rodada manual ao participante.

## Ambiente

- app local em `http://localhost:3000` com health `200`;
- sessão autenticada de `dev-admin@adscale.local`;
- campanha concluída existente para revisar o fluxo de rejeição;
- trabalho de Criar Post concluído existente para revisar a projeção dos três outputs.

## Resultado

| Check | Resultado |
| --- | --- |
| Template materializado vincula automaticamente a marca correspondente | pass |
| Templates está acessível pela navegação desktop | pass |
| Nota de feedback não aparece antes de uma prévia real | pass |
| Rejeitar abre a revisão e `Não entra` revela o campo de direção | pass |
| Criar Post concluído mostra as três propostas | pass |
| A ação inerte `Selecionar` não existe mais | pass |
| Erros HTTP inesperados | 0 |
| Erros inesperados de console | 0 |

O primeiro clique automatizado em `Rejeitar` perdeu o elemento durante a hidratação e foi repetido depois de a página estabilizar. Isso foi uma limitação do harness; o fluxo do produto abriu a revisão e o campo de direção corretamente.

## Decisão

O smoke reduz o risco técnico das correções, mas não entra no denominador das jornadas humanas e não prova superioridade contra o baseline. Posteriormente, em 2026-07-16, o owner aprovou o Gate 8 com a amostra incompleta registrada como dívida aceita; o veredito técnico permanece `iterate`.
