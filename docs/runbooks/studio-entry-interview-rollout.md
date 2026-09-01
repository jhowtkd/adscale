# Rollout da entrevista de entrada do Estúdio

Este runbook autoriza somente a leitura dos indicadores e, após os gates abaixo, a alteração humana de `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT`. Ele não autoriza deploy, geração paga, provisionamento de segredo ou elevação do percentual como parte da implementação de engenharia.

## Contexto e braços

O Estúdio progressivo já está em 100% em produção (`STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100`). Não existe braço de controle sobrando fora do progressivo. Este rollout compara dois braços **dentro** do progressivo:

- **Entrevista ligada:** workspace incluído por `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` via `isStudioEntryInterviewEnabled(workspaceId, percent)`.
- **Entrevista desligada:** workspace progressivo cujo bucket está fora do percentual da entrevista.

Ambos os braços usam o mesmo `studioRolloutBucket(workspaceId)` determinístico do Estúdio progressivo. O percentual bruto nunca chega ao browser — a página do dashboard deriva um booleano a partir dele.

Variável de ambiente: `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` (0–100, padrão `0`).

## Consulta e baseline congelado

No painel de owner, consulte `/api/feedback/analytics/funnel` com um intervalo UTC fechado (`from` e `to`, inclusivos). Registre a faixa exata e use a mesma definição para todas as comparações:

- Sessões elegíveis: primeira ocorrência válida de `studio_entry_started` por `{workspaceId, studioSessionId}` cuja janela de 24 horas já esteja completa no fim da faixa consultada. Entradas mais recentes ficam fora do denominador e não são abandonos.
- Gerações confirmadas: pares únicos `{sessão, creativeWorkId}` com `generation_confirmed` dentro da janela.
- Conclusões: sessão com pelo menos um `output_ready` do trabalho confirmado na janela.
- Abandonos antes da geração: sessão sem `generation_confirmed` na janela.
- Falhas, débitos, compensações e reembolsos: gerações confirmadas correlacionadas pelo `creativeWorkId`; nenhuma linha ou valor financeiro é exposto no painel.

Antes de qualquer tráfego da entrevista, mantenha `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT=0`, obtenha 14 dias completos e pelo menos 30 sessões elegíveis **por braço** (entrevista ligada e desligada). Congele os valores abaixo no momento da decisão.

| Faixa UTC | Braço | Conclusão | Abandono antes da geração | Falha | Reembolso | Erros de redação visíveis na entrada | Chips mostrados | Chip selecionado | Pedido escrito (`requestSource`) | Pedido preservado | Mediana entrada→briefing | Owner | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a preencher | entrevista ligada | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | baseline congelado |
| a preencher | entrevista desligada | a preencher | a preencher | a preencher | a preencher | a preencher | n/a | n/a | n/a | n/a | a preencher | a preencher | baseline congelado |

O baseline só permite medição: nenhuma alteração percentual é válida enquanto o percentual permanecer em zero por decisão de engenharia.

## Eventos para análise

Consulte estes eventos no funil e nos logs analíticos ao comparar braços. Eles não substituem as métricas de conclusão e abandono acima:

- `studio_entry_chips_shown` — propriedades: `workCount`, `slots`, `usedFallback`
- `studio_entry_chip_selected` — propriedade: `slot`
- `studio_entry_request_written` — propriedade: `requestSource` (`template` ou `model`)
- `studio_entry_request_preserved`

Separe conclusão com pedido escrito à mão (`requestSource` ausente ou entrada sem entrevista) de conclusão com pedido herdado da entrevista.

## Checklist de estágios

Cada alteração é uma operação humana explícita no ambiente aprovado: ajuste apenas `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT`, confirme o commit implantado e registre a evidência. Não mude outras variáveis, não faça deploy por este runbook e não gere conteúdo para testar o rollout.

| Estágio | Percentual | Observação mínima | Amostra mínima por braço | Critério para avançar |
| --- | --- | --- | --- | --- |
| 10% | 10 | 7 dias | 30 sessões elegíveis e 20 gerações confirmadas | conclusão da entrevista no máximo 5 pp abaixo do braço desligado; abandono antes da geração no máximo 5 pp acima; nenhum erro de redação visível na entrada; nenhum incidente crítico |
| 50% | 50 | 7 dias | 60 sessões elegíveis e 40 gerações confirmadas | mesmos limites do estágio de 10%; tempo sozinho nunca avança |
| 100% | 100 | após 50% com 14 dias | 100 sessões elegíveis e 75 gerações confirmadas | compare com o baseline congelado; depois observe 100% por 14 dias completos |

Para cada decisão, selecione no painel o estágio correspondente e confirme a amostra suficiente **em cada braço** (entrevista ligada e desligada), a mediana entrada→briefing e a distribuição de `requestSource` em `studio_entry_request_written`. Se o painel indicar dados incompletos por atingir o limite de eventos, nenhuma decisão de avanço é válida: reduza a faixa UTC ou aguarde uma consulta completa.

## Rollback imediato

Retorne `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` para `0` e abra investigação se ocorrer qualquer um destes:

- queda de conclusão maior que 5 pp em relação ao braço desligado ou ao baseline congelado;
- aumento de abandono antes da geração maior que 5 pp;
- erro de redação visível na entrada (falha do POST de redação exposta à pessoa na primeira tela).

O retorno a zero é uma alteração humana de ambiente e precisa da mesma evidência registrada abaixo. Ele não substitui uma correção de código nem encerra a investigação.

## Evidência de decisão

| Data/hora UTC | Owner | Ambiente | Commit implantado | Faixa de consulta | Percentual | Braço | Métricas e denominadores | Incidentes | Decisão e justificativa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a preencher | a preencher | a preencher | a preencher | a preencher | 0 | n/a | baseline congelado pendente | nenhum | a preencher |

Mantenha uma linha por baseline, entrada de estágio, avanço, retenção e rollback. Registre separadamente métricas do braço entrevista ligada e entrevista desligada quando a decisão comparar os dois.
