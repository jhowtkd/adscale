# Jev: processamento manual de observações

A issue [#469](https://github.com/jhowtkd/adscale/issues/469) continua a
[política e coleta](jev-collection-pilot.md). O piloto continua fora da criação:
processar uma observação não altera Trabalho, Prontidão, geração, cobrança,
seleção, exportação ou aprendizado da marca. Sem cron, job ou UI nesta entrega.

## Entrada pública para #472

```ts
processSemanticReviewObservation({
  repository,                 // createSemanticReviewRepository(database)
  workspaceId,                // obrigatório; nunca varre outros workspaces
  observationId,              // opcional: sem ele, pega a mais antiga disponível
  ownerToken,                 // opcional: UUID novo por execução, por padrão
  enabled,                    // padrão: JEV_OBSERVER_ENABLED === "true"
  credential,                 // padrão: TYPESAFE_API_KEY
  fetchImpl,                  // seam HTTP controlado em testes
  clock,                      // () => Date; padrão relógio UTC do processo
  deadline,                   // Date; padrão início + 20s
  diagnosticSink,             // seam do journal; flag diagnóstica continua valendo
})
```

Falha de infraestrutura antes do marcador pode devolver `failed` enquanto o
claim é liberado para `queued`, sem cota ou HTTP. O estado operacional deve ser
lido da observação; o resumo descreve esta execução e não aciona retry interno.

A função processa **uma** observação por chamada e retorna somente
`{status, workspaceId, observationId?, code?, sent}`. `sent` indica que esta
execução invocou o transporte; não é uma confirmação de recebimento/faturamento
remoto. Recuperar uma tentativa anterior pode retornar `outcome_unknown` com
`sent=false`. Não retorna texto, payload, resposta ou decisões.

| status | Significado para o chamador |
| --- | --- |
| disabled / not_configured | Sem claim ou envio; flag off ou credencial ausente/inválida |
| no_observation | Nenhuma observação disponível no escopo; inclui terminal, lease vivo, inexistente e outro workspace |
| deferred | Sem envio; antes do marcador libera claim para queued; interromper a varredura |
| completed | Resposta válida, inclusive decisão semântica negativa |
| failed | Falha técnica conhecida; erro seguro, sem reenvio |
| skipped | Cancelamento terminal seguro, sem envio nesta execução |
| outcome_unknown | Envio anterior possível ou confirmação não persistida; nunca reenviar |
| ownership_lost | Não concluiu nem sobrescreveu a posse de outro executor |

O #472 deve compartilhar um `deadline` de 20s entre **até três chamadas
sequenciais**, parar em `deferred`, `disabled`, `not_configured` ou
`no_observation`, e manter retries do job em zero. A entrada não cria scheduler.
O orçamento é conferido antes de claim, antes da reserva e imediatamente antes
do HTTP: menos de 5s de timeout + 2s restantes impede envio. Configuração e
payload completo UTF-8 são validados antes da reserva da tentativa.

## Persistência e posse para #470/#471

O repositório canônico foi estendido por
`semantic-review-processing-repository.ts`. Não há conexão global importada:

| Método | Contrato |
| --- | --- |
| claimObservation({workspaceId, observationId?, ownerToken, now}) | Até uma linha, SKIP LOCKED, lease 60s; devolve linha ou null. Lease vencido sem marcador recebe novo owner; com marcador termina outcome_unknown e não envia. |
| prepareObservation(scope + now) | Releitura scoped/locked de política, vínculo e Trabalho; reprojeta com hash real. Retorna projeção em memória ou código seguro. |
| reserveObservationAttempt(scope + now) | Revalida contexto e owner/lease em transação; incrementa cota e grava sendStartedAt atomicamente. Não retorna projeção persistida. |
| authorizeObservationSend(scope + now) | Releitura após o commit do marcador, imediatamente antes de enviar; valida política/hash/owner novamente. |
| releaseObservation(scope + now) | Retorna queued e limpa owner/lease somente se running, owner válido, lease vivo e sem marcador. |
| skipObservation(scope + now + code) | Terminal skipped somente com owner, workspace e lease válidos; não apaga marcador nem cota. |
| finishObservation(scope + now + {state, result?, code?, currentAtCompletion?}) | Compara owner/workspace/lease e exige marcador; completed exige resposta validada pelo parser canônico. Relê contexto sob lock e calcula currentAtCompletion; retorna boolean de escrita. |

`scope = {workspaceId, observationId, ownerToken}`. Os métodos também aceitam
`clock?: () => Date` junto de `now`; o processador passa o mesmo relógio injetado
para revalidar tempos depois de esperas por lock e antes das escritas. Os comandos são internos ao
servidor, não endpoints de usuário. Leituras e transações de processamento têm
espera de lock e statements limitados. HTTP ocorre **fora** das transações.
Não há retry automático de SQL ou de HTTP.

A cota é `semanticReviewQuotaDays(workspaceId, dayUtc, attempts)`; `dayUtc` vem de
`clock().toISOString().slice(0,10)`, não do fuso/`current_date` do PostgreSQL.
Se uma espera cruzar meia-noite UTC depois do incremento, toda a reserva é
revertida e o resumo é `deferred/quota_day_changed`; outra execução usará o novo
dia. Expiração de autorização/lease durante um lock também é revalidada antes
do marcador ou da conclusão. O upsert concorrente reserva sob `min(dailyAttemptLimit, 100)`. Trocar política
não zera o contador; falha, cancelamento posterior ao marcador e resultado
incerto não devolvem a tentativa.

| Situação | Estado persistido |
| --- | --- |
| Cota esgotada, orçamento insuficiente ou política disabled antes do marcador | queued, owner/lease liberados; summary deferred com quota_exhausted, budget_insufficient ou policy_disabled |
| Política revogada/vencida, entrada diferente/inelegível ou observação expirada | skipped terminal, código seguro |
| Cancelamento próprio comprovadamente antes de HTTP, após marcador | skipped, marcador/cota preservados |
| Lease vencido após marcador | outcome_unknown / lease_expired_after_send, nunca volta à fila |
| Timeout, rede ou HTTP 5xx | outcome_unknown |
| HTTP 4xx (incluindo 429), redirect, resposta inválida/modelo divergente | failed |
| Resposta válida | completed, mesmo com unsupported/contradicted/violated |
| Falha ao persistir resposta | Tenta outcome_unknown; se persistência seguir indisponível, running com marcador será recuperado como desconhecido após o lease |
| Trabalho excluído ou posse/lease perdido em voo | Não sobrescreve outro owner; exclusão usa cascade existente |

**Identidade não inclui política.** `skipped` é terminal; nova autorização não
recria a mesma revisão. Política apenas desabilitada é reversível e adia antes
do marcador; revogação/expiração não são reversíveis. #470 implementará varredura
de expiração e retenção; esta entrada apenas revalida a observação selecionada.

A migration aditiva gerada pelo Drizzle acrescenta à observação: `decisions`,
`confidence`, `probabilities`, `usage`, `returnedModel`, `currentAtCompletion` e
`errorCode`, todos anuláveis. `usage` ausente permanece null. Resultado válido é
revalidado na fronteira de persistência; só perguntas/classes enumeradas,
números e uso validado são gravados. Nenhum pedido, copy, fatos, payload ou
resposta bruta é armazenado.

`currentAtCompletion` é uma fotografia na transação de conclusão: edição,
revogação ou perda de elegibilidade durante HTTP produz false, preservando o
resultado histórico. Não certifica atualidade futura. #471 deve reconstruir com
hash exato e autorização própria antes de exportar. Para consultar metadados e
resultados usa-se `listObservations` com workspace explícito (até 100 por chamada);
isso não é claim nem mecanismo de paginação para limpeza em #470.

## Transporte e diagnóstico

Reutiliza `projectSemanticReviewOffline`, `buildJevRequest`, `evaluateJev` e
`parseJevResponse`. Modelo, rubrica, projeção `semantic_input_v1`, endpoint,
limites UTF-8, timeout total e uma tentativa continuam os existentes. `tone`
permanece pendente na [#777](https://github.com/jhowtkd/adscale/issues/777).

`runSemanticReviewCall` extrai a sequência do modo autorizado #467 e é usado
pelos dois chamadores. No processador, `OBSERVABILITY_ENABLED` controla a emissão
para o journal existente. `OBSERVABILITY_LANGFUSE_ENABLED` não cria exportador
nem provider neste fluxo. Eventos `operation.*` e `model.call.*` têm o mesmo
contexto de diagnóstico, `operationKind=semantic_review`, sem stage e sem texto.
Falha de journal é best effort e não altera a decisão operacional. Inventário
HTTP atualizado em `ai-call-inventory.json`; não há chamada a `observeModelCall`
nem alteração do contrato v1 ou dos call points congelados CP-01..CP-11.

SQLSTATE é classificado sem ler mensagem/corpo: 40001, 40P01, 55P03, 57014,
23503 e classe 08 têm códigos seguros; demais erros usam persistence_failed.

## Demonstração sem rede real

```sh
cd app
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:process -- demo
```

A CLI aceita somente `demo` e o guard de PostgreSQL loopback `*_test` do #468.
Cria usuário/workspace/Trabalho sintéticos, coleta uma observação, processa pelo
HTTP controlado e repete a entrada. Confere uma tentativa e nenhum novo envio,
resultado persistido com uso null, Trabalho inalterado e nenhuma geração.
Bloqueia fetch global e remove somente seus próprios dados ao terminar. Não
oferece opção CLI de chamada real. A função pública é a entrada manual para a
continuação; execução com dados reais depende de autorização própria.
