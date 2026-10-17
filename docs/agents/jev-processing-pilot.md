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
  observationId,              // opcional: sem ele, pega a mais antiga elegível
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
O orçamento é conferido antes de claim, antes da reserva, **dentro da transação
de reserva após os locks e imediatamente antes do marcador**, e antes do HTTP: menos de 5s de timeout + 2s restantes impede envio. Configuração e
payload completo UTF-8 são validados antes da reserva da tentativa. Credenciais
aceitam somente 1–4096 caracteres ASCII imprimíveis sem espaços, inclusive nas
pontas; configuração inválida retorna not_configured/invalid_credential sem claim.
Se o orçamento cair abaixo do mínimo dentro da reserva, o incremento é revertido
e a observação é adiada; depois do marcador o cancelamento mantém a cota.

## Persistência e posse para #470/#471

O repositório canônico foi estendido por
`semantic-review-processing-repository.ts`. Não há conexão global importada:

| Método | Contrato |
| --- | --- |
| claimObservation({workspaceId, observationId?, ownerToken, now}) | Até uma linha, SKIP LOCKED, lease 60s. Sem ID, somente filas de políticas enabled/válidas/versões atuais; com ID, permite diagnosticar política inativa. Running vencida COM marcador é recuperada como outcome_unknown independentemente da política. |
| prepareObservation(scope + now) | Trava somente observação; relê política, vínculo e Trabalho por SELECT MVCC e reprojeta o hash real. Retorna projeção em memória ou código seguro. |
| reserveObservationAttempt(scope + now + deadline) | Upsert real de cota antes do lock NOWAIT da observação; revalida contexto, owner/lease e deadline dentro da transação. Falha em guard reverte o incremento; marcador e cota são atômicos. |
| authorizeObservationSend(scope + now) | Releitura FORA de transação após o commit do marcador, imediatamente antes do HTTP; valida política/vínculo/validade/versões/hash/owner por MVCC, sem locks. |
| releaseObservation(scope + now) | Retorna queued e limpa owner/lease somente se running, owner válido, lease vivo e sem marcador. |
| skipObservation(scope + now + code) | Terminal skipped somente com owner, workspace e lease válidos; não apaga marcador nem cota. |
| finishObservation(scope + now + {state, result?, code?}) | Compara owner/workspace/lease e exige marcador; completed exige resposta validada pelo parser canônico. Lê somente a entrada semântica em savepoint e calcula currentAtCompletion; falha de leitura preserva completed/false com context_unavailable. Retorna boolean de escrita. |

`scope = {workspaceId, observationId, ownerToken}`. Os métodos também aceitam
`clock?: () => Date` junto de `now`; o processador passa o mesmo relógio injetado
para revalidar tempos depois de esperas por lock e antes das escritas. Os comandos são internos ao
servidor, não endpoints de usuário. Todas as transações têm lock_timeout local
de 2s e statement_timeout de 5s. A releitura final é fora de transação, por SELECTs
MVCC. HTTP ocorre **fora** das transações.
Não há retry automático de SQL ou de HTTP.

A cota é `semanticReviewQuotaDays(workspaceId, dayUtc, attempts)`; `dayUtc` vem de
`clock().toISOString().slice(0,10)`, não do fuso/`current_date` do PostgreSQL.
Se uma espera cruzar meia-noite UTC depois do incremento, toda a reserva é
revertida e o resumo é `deferred/quota_day_changed`; outra execução usará o novo
dia. Expiração de autorização/lease durante um lock também é revalidada antes
do marcador; na conclusão, o lease é revalidado sem misturar autorização com currency. O upsert concorrente reserva sob `min(dailyAttemptLimit, 100)`. Trocar política
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

A ordem cota → observação evita o ciclo com DELETE de workspace. O NOWAIT da
observação faz o observador desistir caso uma cascata já a possua, mesmo se a
ordem de cascata mudar. Contenção nesse ponto pode retornar failed/db_lock_timeout
sem consumo de tentativa. Não há FOR SHARE/FOR UPDATE em linha de negócio.
Exclusões podem esperar uma transação curta do piloto pelas FKs em cascata; nunca
esperam o HTTP nem são escolhidas como vítima de deadlock do observador.

**Identidade não inclui política.** `skipped` é terminal; nova autorização não
recria a mesma revisão. Política apenas desabilitada é reversível e adia antes
do marcador; revogação/expiração não são reversíveis. #470 implementará varredura
de expiração e retenção; esta entrada apenas revalida a observação selecionada.
Sem ID explícito, queued e running SEM marcador de políticas inativas ficam fora
do claim até reativação ou expiração em #470. No relatório, essas perdas aparecem
na expiração, em vez de um skip imediato authorization_revoked. A recuperação de
running vencida COM marcador continua independente da política.

A migration aditiva gerada pelo Drizzle acrescenta à observação: `decisions`,
`confidence`, `probabilities`, `usage`, `returnedModel`, `currentAtCompletion` e
`errorCode`, todos anuláveis. `usage` ausente permanece null. Resultado válido é
revalidado na fronteira de persistência; só perguntas/classes enumeradas,
números e uso validado são gravados. Nenhum pedido, copy, fatos, payload ou
resposta bruta é armazenado.

`currentAtCompletion` compara **somente hash e versões da entrada semântica do
Trabalho** no instante da leitura de conclusão, sem travar linhas de negócio.
Mudança/inelegibilidade/ausência da entrada produz false. Pausa, revogação ou
vencimento da política durante HTTP não alteram essa marca: o envio já ocorreu e
a resposta recebida é preservada. Falha da leitura semântica é contida em savepoint
e preserva completed com currency false; falha da própria escrita ainda exige
desfecho desconhecido. Se a observação sumiu em cascata, não escreve e devolve
ownership_lost, sem lançar erro. Não certifica atualidade futura. #471 deve reconstruir com
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
Política synthetic define context.dataOrigin=synthetic. Para authorized,
createDiagnosticContext preserva a coorte configurada (test sob Vitest, padrão
production fora de testes). O atributo escalar livre semanticReviewDataOrigin
preserva o literal da política (synthetic/authorized), sem mudar o contrato v1.
O ambiente continua vindo da configuração existente.
Falha de journal é best effort e não altera a decisão operacional. Inventário
HTTP atualizado em `ai-call-inventory.json`; não há chamada a `observeModelCall`
nem alteração do contrato v1 ou dos call points congelados CP-01..CP-11.

SQLSTATE é classificado sem ler mensagem/corpo: 40001, 40P01, 55P03, 57014,
23503 e classe 08 têm códigos seguros; demais erros usam persistence_failed.

O relógio é injetado por processo; os executores devem manter relógios
sincronizados. Deriva entre processos pode antecipar perda de lease e descartar
uma resposta tardia, sem duplicar envio. Lease de 60s e margem de 2s limitam a
janela operacional; esta entrega não introduz serviço de sincronização de relógio.

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
