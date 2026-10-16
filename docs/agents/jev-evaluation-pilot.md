# Jev: exportação cega e avaliação por arquivos

Para continuar a #471 ou consumir seu relatório na #473, use este contrato junto
com a [spec #465](https://github.com/jhowtkd/adscale/issues/465) e os contratos de
[coleta](jev-collection-pilot.md) e [processamento](jev-processing-pilot.md).
O corpus e os julgamentos ficam em arquivos privados externos ao repositório e
ao banco. O tooling não concede autorização operacional para dados reais.

## Fluxo de arquivos

1. Preparar um plano explícito de famílias com `version: 1`, `workspaceId`,
   `selectedAt`, `selectedBy`, `selectedBeforeResults: true` e `entries`:
   `{reviewId, familyId, split: "calibration" | "holdout", primary}`.
   Cada família inteira pertence a um split e tem exatamente um representante
   principal. Variantes não substituem um representante indisponível.
2. Calcular `semanticDigest(plan)` e obter uma aprovação JSON específica:
   `reference` HTTPS sem credenciais/query/fragmento, `authorizedBy`, `approvedAt`,
   `expiresAt` (no máximo 14 dias), `purpose: "blind_semantic_review_export"`,
   `workspaceId`, `clientProfileIds`, `reviewIds` explícitos e `planHash`.
   A lista de IDs precisa coincidir exatamente com o plano. A referência registra
   onde conferir a decisão; validar sua sintaxe não comprova consentimento.
3. `exportSemanticReviewCases` congela e hasheia o plano antes de consultar
   observações/resultados. Reprojeta o Trabalho atual com o projetor do #466 e
   exige o mesmo hash. Edição/exclusão/versão incompatível é `unavailable`, sem
   reconstituição aproximada. IDs ausentes e de outro workspace são indistintos;
   uma marca encontrada fora da aprovação é recusada.
4. Distribuir **somente `blind.json`** aos dois revisores. Ele contém IDs aleatórios
   de caso/família, hash, versões da projeção/rubrica, rubrica/classes e contexto
   textual autorizado. Não contém IDs técnicos originais, identidade do candidato,
   decisões, confiança, probabilidades, uso ou baseline. O nome da marca no
   contexto textual é necessário para avaliar apoio factual.
5. Importar os arquivos independentes e eventual adjudicação; gerar um relatório
   novo. O importador confere integridade de plano/mapa/pacote, hashes e histórico.
   Nenhum julgamento é persistido no banco.

`selectedBy` e `selectedBeforeResults` registram a ordem declarada. O plano
congelado impede trocar família/representante no pacote; ele não prova
retrospectivamente que o responsável nunca viu resultados anteriores.

A API recebe conexão explícita em `createSemanticReviewExportRepository(db)`.
A CLI de exportação oferece apenas `TEST_DATABASE_URL` segura (loopback, `_test`,
sem fallback para `DATABASE_URL`). Um operador futuro de dados autorizados precisa
conectar explicitamente a API ao banco autorizado, sob a aprovação própria.

```sh
cd app
export TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test
npm run jev:evaluate -- export --authorization /private/approval.json \
  --plan /private/plan.json --output-dir /private/new-export
npm run jev:evaluate -- import --directory /private/new-export --input /private/reviewer-a.json
npm run jev:evaluate -- import --directory /private/new-export --input /private/reviewer-b.json
npm run jev:evaluate -- report --directory /private/new-export
npm run jev:evaluate -- demo
```

Arquivos de entrada são regulares e privados (`0600`); o diretório de exportação
precisa ser novo e nasce `0700`. Saídas são `0600`, exclusivas, sem sobrescrita.
O caminho é absoluto, sem `..` e sem symlink em nenhum componente. Operações usam
descritores ancorados em `/proc/self/fd` (Linux), inclusive a escrita e a trava.
O manifesto privado é `private-map.json`; `complete.json`, gravado por último,
marca uma exportação completa. Um diretório parcial não é uma execução válida.
Julgamentos e relatórios têm nomes derivados de hash e preservam o histórico.
Uma trava `lock` após crash exige verificar que não há execução ativa antes de
remover somente essa trava. Os arquivos privados têm retenção própria: a limpeza
do banco não os elimina.

## Julgamentos

Um arquivo tem `version: 1`, `kind: "review"`, `exportId`, `planHash`, `blindHash`,
`reviewerId`, `createdAt`, `referenceKind: "independent_human" | "synthetic_fixture"`
e `cases`. Cada caso contém `caseId`, `familyId` opaco, `semanticHash`,
`versions: {inputVersion, rubricVersion, rubricHash}`, `labels` com exatamente as
seis perguntas e classes da rubrica, e `ambiguous: boolean`.

IDs de revisores são normalizados com trim/lowercase. Exigem-se exatamente dois
IDs distintos por caso antes de haver referência clara. Um primeiro arquivo
parcial é aceito como `missing_second_review`; discordância fica
`awaiting_adjudication`, sem entrar nas métricas de referência clara. A adjudicação
usa `kind: "adjudication"`, terceiro revisor distinto e `resolves: [hashA, hashB]`
ligando os dois arquivos canônicos; deve ocorrer depois de ambos. Um caso com
`ambiguous: true` ou algum rótulo `insufficient_context` continua `ambiguous`.
Não se converte Aprovação estética ou Seleção por agente em julgamento factual.

A referência sintética nunca pode ser declarada `independent_human`. As duas
revisões da demonstração são arquivos de fixture, explicitamente sintéticos.
Histórico parcial/discordante não é descartado nem sobrescrito por uma revisão
nova; um terceiro julgamento comum é recusado, e a adjudicação é a continuação.

## Contrato do relatório v1 para #473

`buildSemanticEvaluationReport(manifest, judgments, now)` recalcula resultados.
Não recebe taxas, matrizes, preços ou decisões de gate autodeclaradas. Campos:

| Campo | Escopo/semântica |
| --- | --- |
| `version`, `exportId`, `planHash`, `blindHash`, `generatedAt` | Identidade e integridade da avaliação |
| `humanReference` | `independent_human` somente quando todos os arquivos se declaram humanos e o corpus não é sintético; caso contrário `synthetic_or_not_collected`. Conferir também estados/contagens de referência |
| `collection` | Histórico das políticas das observações selecionadas: consultados, elegíveis, amostrados (`unique + duplicates`), únicos, exclusões, falhas e `byPolicy` com origem. Não atribuir esse funil inteiro ao subconjunto rotulado |
| `collection.historyComplete` | Ausência do marcador `initialPage` da janela inicial indica lacuna histórica/retida. Histórico inexistente/incompleto produz contagens `null`, não zero; `knownCounts` conserva apenas páginas registradas |
| `selected`, `recoverable`, `unavailable` | Todas as observações explicitamente selecionadas, inclusive variantes |
| `cohorts[]` | Separação por origem da política e versões observadas; cada coorte inclui ambiente/modo declarados |
| `cohorts[].splits` / `byBrand` / `byQuestion` | Calibração/holdout, marca e pergunta; sem reunir as seis perguntas como unidades independentes |
| `counts.primaryFamilies` / `secondaryVariants` | Representantes independentes e variantes; só representantes entram nas métricas e em Wilson |
| `counts.sendsStarted`, `validResponses`, `failed`, `outcomeUnknown` | Todas as observações selecionadas, inclusive variantes; envios conservadores usam marcador durável, com falhas/desconhecidos no denominador |
| `counts.referenceStates`, `unavailabilityReasons`, `processingErrors` | Referência clara/incompleta/ambígua e motivos seguros |
| `metrics` | Métricas por família principal; cada taxa traz `numerator`, `denominator`, `value`, `wilson95`; denominador zero => `value: null`, Wilson `null` |
| `matrix` | Matriz humano → candidato por pergunta; só representantes com referência clara e resposta válida |
| `httpElapsedMs`, `queueAgeMs` | `count`, p50/p95 por nearest rank; HTTP inclui leitura do corpo, fila é marcador − criação; medição ausente => `null` |
| `usage` | Quantos envios informaram uso e quantos não; `totals` soma apenas uso informado. Não é estimativa de uso ausente |
| `cost` | `null`: esta entrega não estima custo sem preço datado |

Ambiente vem da resolução de configuração do contexto diagnóstico no instante
da exportação: `test → controlled`, `staging/production → live_authorized`,
outro valor → `null`. Isso é **declarado**, não uma comprovação do ambiente/modo
de cada envio anterior. `synthetic/authorized` vem da política. A #473 precisa
considerar essas limitações e evidência operacional própria ao decidir gates.

Precisão = TP/(TP+FP), falso alerta = FP/(FP+TN), ambos com referência clara e
candidato não abstido. Falso alerta e abstenção também aparecem sobre todas as
famílias humanas sem problema. Detecção incremental divide problemas alertados
pelo candidato e perdidos pelo baseline por **todos** os problemas humanos
perdidos pelo baseline, inclusive falhas/abstenções do candidato. O baseline é
recalculado pelos verificadores determinísticos existentes.

Na agregação de família, um alerta em qualquer pergunta prevalece; sem alertas,
algum `insufficient_context` torna a resposta abstida. O relatório discrimina
cada pergunta separadamente. `abstention` usa respostas válidas com referência
clara; `abstentionAllSends` inclui todo marcador dos representantes selecionados.
Os verificadores do baseline retornam achados por Trabalho, sem atribuição comum
às seis perguntas: detecção incremental por pergunta é `null`, e a taxa da
família é a comparação factual disponível. Wilson usa só famílias principais.

## Extensão deliberada de #468/#469

O coordenador autorizou a migration aditiva `0161` nesta branch: a #470 não gera
migration, então não há colisão. `semantic_review_collection_runs` grava contagens
sem texto, política/workspace, janela e resultado na **mesma transação** da página.
Rollback do savepoint grava `failed`, contagens zeradas e
`errorCode: "collection_page_failed"`; não aparenta uma página vazia bem-sucedida.
`semantic_review_observations.http_elapsed_ms` é anulável e recebe a duração
monotônica apenas do dispatch/leitura HTTP, junto com o desfecho. Sem HTTP ou
medição histórica, permanece `null`; zero medido é válido.

Nenhuma migration/consulta em produção, chamada real, julgamento humano real,
corpus real, job/cron, UI, habilitação ou decisão G0/G1/G2 faz parte desta entrega.
