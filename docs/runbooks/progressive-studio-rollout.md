# Rollout do Estúdio progressivo

Este runbook autoriza somente a leitura dos indicadores e, após os gates abaixo, a alteração humana de `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`. Ele não autoriza deploy, geração paga, provisionamento de segredo ou remoção da apresentação controle.

## Consulta e baseline congelado

No painel de owner, consulte `/api/feedback/analytics/funnel` com um intervalo UTC fechado (`from` e `to`, inclusivos). Registre a faixa exata e use a mesma definição para todas as comparações:

- Sessões elegíveis: primeira ocorrência válida de `studio_entry_started` por `{workspaceId, studioSessionId}` cuja janela de 24 horas já esteja completa no fim da faixa consultada. Entradas mais recentes ficam fora do denominador e não são abandonos.
- Gerações confirmadas: pares únicos `{sessão, creativeWorkId}` com `generation_confirmed` dentro da janela.
- Conclusões: sessão com pelo menos um `output_ready` do trabalho confirmado na janela.
- Abandonos: sessão sem `generation_confirmed` na janela.
- Falhas, débitos, compensações e reembolsos: gerações confirmadas correlacionadas pelo `creativeWorkId`; nenhuma linha ou valor financeiro é exposto no painel.

Antes de qualquer tráfego progressivo, mantenha `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=0`, obtenha 14 dias completos e pelo menos 30 sessões elegíveis. Congele os valores abaixo no momento da decisão.

| Faixa UTC | Conclusão | Abandono | Falha | Reembolso | Troca de objetivo | Correção de papel | Refinamento | Retomada | Mediana entrada→briefing | Owner | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | baseline congelado |

O baseline só permite medição: Task 12 aprovada e Gate Humano B aprovado continuam sendo pré-condições para qualquer alteração percentual.

## Checklist de estágios

Cada alteração é uma operação humana explícita no ambiente aprovado: ajuste apenas `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`, confirme o commit implantado e registre a evidência. Não mude outras variáveis, não faça deploy por este runbook e não gere conteúdo para testar o rollout.

| Estágio | Percentual | Observação mínima | Amostra mínima por braço | Critério para avançar |
| --- | --- | --- | --- | --- |
| 10% | 10 | 7 dias | 30 sessões elegíveis e 20 gerações confirmadas | conclusão progressiva no máximo 5 pp abaixo; abandono no máximo 5 pp acima; falha e reembolso no máximo 0,5 pp acima; nenhum incidente crítico |
| 50% | 50 | 7 dias | 60 sessões elegíveis e 40 gerações confirmadas | mesmos limites do estágio de 10%; tempo sozinho nunca avança |
| 100% | 100 | após 50% com 14 dias | 100 sessões elegíveis e 75 gerações confirmadas | compare com o baseline congelado; depois observe 100% por 14 dias completos antes da Task 13 |

Para cada decisão, selecione no painel o estágio correspondente e confirme a amostra suficiente para aquele estágio, a mediana entrada→briefing e a mediana entrada→plano (a última é diagnóstico exclusivo do progressivo). Não trate plano ausente no controle como zero. Se o painel indicar dados incompletos por atingir o limite de eventos, nenhuma decisão de avanço é válida: reduza a faixa UTC ou aguarde uma consulta completa.

## Rollback imediato

Retorne o percentual para `0` e abra investigação se ocorrer qualquer perda de rascunho, fonte, saída ou versão; geração antes de confirmação explícita; cobrança duplicada; divergência entre ledger, job e reembolso; queda de conclusão maior que 5 pp; aumento de falha ou reembolso maior que 0,5 pp; ou incidente crítico.

O retorno a zero é uma alteração humana de ambiente e precisa da mesma evidência registrada abaixo. Ele não substitui uma correção de código nem encerra a investigação.

## Evidência de decisão

| Data/hora UTC | Owner | Ambiente | Commit implantado | Faixa de consulta | Percentual | Métricas e denominadores | Incidentes | Decisão e justificativa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | a preencher | nenhum/a preencher | a preencher |

Mantenha uma linha por baseline, entrada de estágio, avanço, retenção e rollback. A aprovação visual do product owner e a aprovação humana do Gate B são evidências separadas e devem ser vinculadas na coluna de decisão.
