# Jev: política e coleta manual de Trabalhos preparados

A issue [#468](https://github.com/jhowtkd/adscale/issues/468) acrescenta autorização
persistida e coleta de metadados. Não registra job, processa observações nem envia
HTTP. A projeção continua sendo `projectSemanticReviewOffline`, com
`semantic_input_v1` e as versões fixas existentes. O `tone` não foi acrescentado.

## Entrada pública e limites

`createSemanticReviewRepository(database)` recebe uma conexão Drizzle explícita;
não importa a conexão global em runtime. Exporta:

- `registerPolicy(input, now?)`: valida autorização, fornecedor/finalidade,
  workspace/marcas, janela, versões e limites; sempre cria `disabled`.
- `setPolicyEnabled({workspaceId, policyId, enabled}, now?)`: comando explícito,
  separado do cadastro; recusa autorização expirada/revogada e outra política
  habilitada no workspace. Desabilitar preserva o cursor.
- `revokePolicy({workspaceId, policyId}, now?)`: terminal para essa autorização;
  preserva observações. Retomar exige outra política/autorização.
- `getPolicy({workspaceId, policyId})`: metadados e IDs das marcas; retorna
  `null` fora do escopo ou se não existir.
- `listObservations({workspaceId, policyId?, limit?})`: até 100 metadados,
  ordenados por criação/ID. Não é um mecanismo para reservar processamento.

`collectSemanticReview({repository, enabled?, now?})` é a entrada do coletor.
Sem override explícito, só executa com `JEV_OBSERVER_ENABLED=true`. Credencial não
habilita coleta. Seleciona uma política válida por execução, em ordem de última
coleta (as nunca visitadas primeiro), e lê uma página de até 25 Trabalhos. O
relógio injetável controla validade/janela; o relógio do PostgreSQL ordena visitas
para manter justiça mesmo em replay com relógio de domínio fixo.

O resumo contém `status`, IDs da política/workspace, `consulted`, `eligible`,
`unique`, `duplicates`, `outOfScope`, `invalid`, `notSampled`, `exclusions` e
`windowComplete`. As contagens satisfazem:

```text
consulted = eligible + outOfScope + invalid
eligible = unique + duplicates + notSampled
```

A primeira janela começa em `authorizedAt`, sem histórico automático. O teto da
janela fica persistido entre páginas. A paginação ordena `(updatedAt,id)` e
preserva os microssegundos do PostgreSQL no cursor. Ao completar uma janela, a
próxima começa em `max(authorizedAt, último teto - 10 minutos)`. Deduplicação e
sobreposição reduzem perdas, mas não capturam necessariamente revisões
transitórias. Edição que mova um Trabalho além do teto fica para outra janela;
nenhum snapshot antigo é reconstruído.

Inserções e avanço de cursor ocorrem na mesma transação curta, com bloqueio da
política e `SKIP LOCKED`; uma política ocupada pode produzir `no_policy` se não
houver outra disponível. Exclusões também avançam o cursor. Uma política sem
marcas não lê Trabalhos. Há limites locais de espera por lock (2s) e de cada
statement (5s); não há loop de workspaces nem transporte dentro da transação.

## Persistência e continuação em #469

`semanticReviewPolicies`, `semanticReviewPolicyBrands` e
`semanticReviewObservations` ficam no schema existente. A tabela de associação
foi aprovada como ajuste técnico à proposta de duas tabelas: FKs compostas
impõem que marcas e política pertençam ao mesmo workspace. Para isso foi
adicionada a unique `client_profiles(id,workspace_id)`. A unique já existente de
Trabalho/workspace é reutilizada. Revogar não remove o vínculo; excluir marca
remove o vínculo, e excluir Trabalho/workspace remove as observações relacionadas.

O índice único parcial impede duas políticas `enabled` no mesmo workspace.
Validade máxima é 14 dias; teto é 100 tentativas por workspace/dia UTC. Para dados
`authorized`, amostragem é exatamente 10%; políticas `synthetic` aceitam 0–100%.
Amostragem determinística usa a identidade completa, sem ID da política ou tempo.

A chave única de observação inclui workspace, marca, Trabalho, hash semântico,
projeção, rubrica/hash, perfil e modelo. Outra autorização não cria uma nova
tentativa para a mesma identidade. Observações nascem `queued`, expiram após 24h
e guardam apenas chaves, hashes, versões, estado e tempos. Nenhum texto projetado
ou resposta é persistido. Os campos de owner/lease/envio já existem para #469,
mas este ticket não oferece comandos de claim/conclusão.

O processador de #469 deverá reler Trabalho, projetor/hash, política/vínculos e
validade, reservar cota do **workspace/dia UTC** e comparar owner em transação.
`dailyAttempts`/`attemptDayUtc` ainda não são consumidos pela coleta; a cota não
pode ser somada separadamente por marca ou burlada por troca de política no mesmo
dia. Antes de HTTP, exige marcador durável de envio e nova conferência de
revogação. A coleta não concede autorização de envio nem certifica que uma
observação enfileirada continua atual. Decisões/distribuições/uso e comandos de
processamento pertencem ao ticket seguinte.

## CLI restrita ao banco de teste

Esta entrega oferece somente tooling manual para `TEST_DATABASE_URL` explícita,
PostgreSQL em loopback e nome terminando em `_test`. Não há fallback para
`DATABASE_URL`. Nenhuma política real foi cadastrada ou ativada.

```sh
cd app
export TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test
npm run jev:collect -- register --input /private/path/policy.json
npm run jev:collect -- enable --workspace WORKSPACE_UUID --policy POLICY_UUID
JEV_OBSERVER_ENABLED=true npm run jev:collect -- collect
npm run jev:collect -- revoke --workspace WORKSPACE_UUID --policy POLICY_UUID
npm run jev:collect -- demo
```

O JSON de cadastro inclui `workspaceId`, `clientProfileIds`,
`authorizationReference` (HTTPS, sem credencial), `authorizedBy`, `authorizedAt`,
`expiresAt` (ISO), `provider: "typesafe"`,
`purpose: "prepared_work_semantic_review"`, `dataOrigin`, `samplePercent`,
`dailyAttemptLimit` e todos os campos de `SEMANTIC_REVIEW_VERSIONS`.
A referência precisa apontar para uma autorização humana verificável quando o
piloto usar dados autorizados; validação sintática não comprova consentimento.

A demonstração cria fixture sintética isolada, cadastra política desabilitada,
habilita para coleta local, coleta, repete, revoga e confere que não há nova
coleta. Bloqueia `fetch`, verifica Trabalho inalterado e remove seu workspace e
usuário ao terminar. Não lê marcas atuais para reconstruir contexto.

A migration foi gerada por `npm run db:generate`. O SQL gerado teve somente a
ordem corrigida: índices únicos referenciados precedem as FKs compostas. A
aplicação foi verificada exclusivamente no banco de teste, incluindo uma
execução em schema fixture limpo seguida de rollback. Merge/deploy em produção
continua dependendo de autorização própria, pois o deploy executa migrations.
