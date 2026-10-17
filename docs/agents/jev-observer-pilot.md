# Jev: varredura periódica limitada

A [#472](https://github.com/jhowtkd/adscale/issues/472) registra
`semantic-review-observer` no `serve` HTTP Inngest existente. O cron é
`*/5 * * * *`, `retries: 0`, `concurrency: 1`. O worker de imagem não participa.
A proteção de assinatura e a recusa de `INNGEST_DEV` em produção continuam
as do runtime existente.
O registro do cron permanece presente com a flag off: são 288 horários por
dia. O guard impede banco e HTTP Jev, mas a invocação/step continua no Inngest.

Uma execução faz um único `step.run("semantic-review-sweep", ...)`. O callback
retorna somente os resumos seguros das fases; nenhum dado criativo intermediário
é serializado no Inngest. Erros de infraestrutura são convertidos em códigos
seguros antes de sair do callback, sem mensagem SQL, credencial ou resposta bruta.

```text
flag off / credencial ausente ou inválida → retorna antes de importar db
deadline único = início + 20.000 ms
  → listar 1 workspace com observações expiráveis
  → expirar até 100 observações desse workspace
  → coletar 1 página de até 25 Trabalhos da política escolhida justamente
  → processar até 3 observações sequenciais do workspace devolvido pela coleta
  → resumos separados: expiration, collection, processing
```

As entradas são as canônicas de
[coleta](jev-collection-pilot.md), [processamento](jev-processing-pilot.md) e
[expiração](jev-retention-pilot.md). Não há segunda fila, claim, reserva ou cota.
`no_policy` encerra sem processar. Uma página `failed` ainda permite processar a
fila já existente do workspace escolhido, para uma falha persistente de projeção
não impedir seu progresso. A falha da coleta permanece explícita no resumo.
`status: completed` na raiz significa que a orquestração terminou; os desfechos
de coleta e processamento devem ser lidos em seus próprios resumos.
Sem cursor entre varreduras de expiração: cada execução reinicia a listagem;
uma página ocupada ou uma fila grande pode exigir outras execuções.
Falha de infraestrutura na listagem/expiração encerra a varredura com
`failed/expiration`; coleta e processamento aguardam outra execução. Apenas a
falha segura de página, contida pelo savepoint canônico da coleta e com
workspace conhecido, permite continuar a fila nesta execução.

O deadline é conferido entre as fases e antes de cada processamento; o mesmo
`Date` é passado às três chamadas. O processador revalida os 5 segundos de timeout
HTTP mais 2 segundos de margem, inclusive depois de locks e antes do marcador e
do envio. `deferred`, `disabled`, `not_configured` ou `no_observation` interrompem
o loop. O orçamento limita o início de novo trabalho; não cancela uma transação
em andamento nem uma leitura MVCC já pendente. Os limites de SQL são os dos
repositórios; indisponibilidade pode alongar o retorno além de 20 segundos,
sem autorizar novo HTTP fora do orçamento. Relógios dos executores devem estar
sincronizados, conforme o contrato do processador.

Replay de um step já confirmado devolve seu resumo persistido. Se a execução
voltar a entrar no callback, dedupe, owner/lease, marcador e cota duráveis
continuam sendo a autoridade. Uma observação enviada nunca volta à fila:
timeout, falha incerta e lease vencido com marcador conservam `outcome_unknown`.
A concorrência Inngest é uma proteção adicional, sem substituir o banco.

`runSemanticReviewSweep` e `createSemanticReviewObserverJob` aceitam repositório,
relógio e transporte injetados para testes. Na função registrada em produção,
`enabled` é resolvido por `JEV_OBSERVER_ENABLED === "true"`, e a credencial por
`TYPESAFE_API_KEY`. As duas entradas precisam estar configuradas; uma credencial
válida por si só não habilita nada. Não há padrão que ligue a flag ou a política.

## Não interferência e carga controlada

`npm run convergence:check-jev` percorre os imports executáveis usando o parser e
a resolução de módulos TypeScript existentes, incluindo imports dinâmicos
literais e reexports; imports apagados de tipos ficam fora. O fechamento do
piloto usa uma allowlist auditada de arquivos e specifiers npm/node exatos,
com raízes em todos os módulos de produção `semantic-review*` e nas CLIs
`scripts/jev-*.ts`, inclusive exportação/avaliação da #471.
Uma dependência nova é recusada até revisão, incluindo repositórios de billing,
seleção, exportação e SDKs. Na outra direção, o grafo invertido de todo `src`
de produção recusa importações do piloto fora dos módulos internos e da rota
Inngest. A propagação continua através da rota, para ela também não servir de
ponte a um comando criativo. No fechamento do piloto, import não literal ou
local sem resolução é recusado; fora dele, assets e imports calculados não
resolvidos não entram no grafo, e a compilação continua sendo uma verificação
separada. Não havia checagem de imports nos gates existentes; o novo gate entra
no wrapper `convergence:gate`, com fixtures negativas no `convergence:test`.
A rota precisa existir e importar o job em runtime; a varredura recusa uma
árvore de produção vazia. Filtros de arquivos usam caminhos relativos à raiz
para que um diretório ancestral chamado `tests` não esconda o código.

As suítes da função registrada entram no passo dedicado Jev do CI. A carga é
uma execução local explícita, com banco de teste e provedores controlados:

```sh
cd app
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run harness:jev-observer
```

O harness compara a preparação real com o observador off/on sob a mesma carga
sintética e registra p95, erros, chamadas, fila e pool. O alvo do incremento é
`max(50 ms, 5% do baseline)`. Resultado local com amostra pequena, provedor
controlado e banco compartilhado não comprova desempenho real: deve ser
registrado como inconclusivo para habilitação. Os números de uma execução e
suas limitações pertencem à evidência do PR; não são garantia do runtime.

## Integração de observabilidade

O processador herdado da #469 importava o bootstrap OTel/Langfuse apenas para
ler a flag de captura. Ao entrar na rota nesta etapa, esse import violava o
guard de dependências do bootstrap. Com autorização do coordenador, esta #472
extrai a mesma leitura para `diagnostics/capture-enabled.ts`, sem dependências
de SDK, e conserva o reexport público de `observability.ts`. O contrato v1 e a
allowlist do teste de bootstrap não mudam. Não há segundo provider ou logger.

## Evidências para #473 e operação futura

| Evidência G0 | Onde conferir |
| --- | --- |
| Job único, cron, guards, deadline, limites e resumos | `app/src/server/jobs/semantic-review.ts`, registro em `app/src/app/api/inngest/route.ts` |
| Replay, revogação, falhas, expiração e timeout sem reenvio | `app/src/server/jobs/semantic-review*.test.ts`, passo Jev no CI |
| Ausência de dependência criativa executável | `app/scripts/check-jev-dependencies.mjs`, `npm run convergence:check-jev` |
| Carga sintética off/on, fila/pool e limitações | `app/src/server/jobs/semantic-review-load.pg.test.ts`, saída JSON do harness e evidência do PR |
| Contagens de coleta, estados, marcadores e cota | tabelas canônicas do piloto; ledger da #471 após integração |
| Verificação local e decisão de habilitação pendente | corpo do PR #472 e registro da execução do piloto no Traycer |

Essas evidências demonstram instrumentação controlada. Não medem a qualidade
real do fornecedor, custo real, referência humana ou G1/G2. A #473 deve manter
hold onde a evidência exigida estiver ausente; o job não decide gates nem ativa
comportamento. Deploy desligado não equivale a ativação.

O cron automatiza somente expiração, coleta e processamento delimitados.
`cleanObservations`, `cleanQuotaDays` e a limpeza do ledger permanecem manuais,
com workspace explícito e prévia, após preservar exportações e o relatório.
Desligamento, confirmação de ausência de novos marcadores e recuperação sem
reenvio seguem o runbook de retenção. Não foi criada migration, UI, preço,
alteração de domínio ou `tone`; a 0161 pertence à base #471, e o observador usa
as extensões canônicas de ledger/latência sem duplicação. Uso real, deploy,
migrations e ativação exigem
as autorizações próprias da sequência.
