# Jev: interrupção, expiração e retenção

A [#470](https://github.com/jhowtkd/adscale/issues/470) completa o ciclo manual da
[coleta](jev-collection-pilot.md) e do [processamento](jev-processing-pilot.md).
As operações usam o repositório canônico, sem conexão global, HTTP, retry ou
mudança em Trabalho, fontes, Prontidão, geração, cobrança, seleção e exportação.

## Interromper e confirmar

1. Desligue `JEV_OBSERVER_ENABLED` em todos os executores e/ou revogue a política
   pelo comando `repository.revokePolicy({workspaceId, policyId}, now)`. A pausa
   reversível usa `setPolicyEnabled({...scope, enabled:false}, now)`; revogação e
   autorização vencida exigem **nova autorização**. Credencial não habilita nada.
2. Registre o instante da interrupção e os marcadores existentes. Confirme que
   não apareceram **novos** `sendStartedAt` depois de os executores observarem o
   desligamento. Conte também a cota diária: ela nunca é devolvida. Um marcador
   pode anteceder um cancelamento local sem HTTP; não prova recebimento remoto.
3. Deixe chamadas já enviadas concluir. Desligamento não as retira do fornecedor.
   Aguarde leases de 60s, execute a recuperação explícita e registre os
   `outcome_unknown`. Nunca apague marcador nem retorne desconhecido à fila.

A revalidação final de política acontece fora de transação imediatamente antes
do HTTP, sem locks de negócio. Existe a janela inevitável entre essa leitura e
o envio. O fechamento não promete cancelar o que já passou pela autorização.
Desligar só a flag impede claim/HTTP e permite rodar manutenção, que não depende
da flag nem da credencial. A flag de ambiente deve ser propagada a cada executor;
um override `enabled:true` é próprio dos testes/entrada interna autorizada.

Em banco descartável, os comandos equivalentes de política são:

```sh
cd app
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:collect -- revoke --workspace "$WORKSPACE_ID" --policy "$POLICY_ID"
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:retain -- expire --workspace "$WORKSPACE_ID"
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:retain -- cleanup --workspace "$WORKSPACE_ID"
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:retain -- cleanup --workspace "$WORKSPACE_ID" --apply
```

As CLIs exigem `TEST_DATABASE_URL` explícita, PostgreSQL loopback e nome `*_test`,
sem fallback a `DATABASE_URL`, query string ou fragmento. Não são comandos de
produção nem autorização para dados reais. As funções do repositório são as
entradas para integração futura em ambiente com autorização própria.

Para confirmar o fechamento no banco autorizado, registre `stopped_at` em UTC
depois do retorno da revogação e compare os IDs/marcadores com a prévia. Exemplo
de consulta com variáveis literais do psql `workspace_id` e `stopped_at`:

```sql
select id, state, send_started_at
from adscale_app.semantic_review_observations
where workspace_id = :'workspace_id'::uuid
  and send_started_at > :'stopped_at'::timestamp
order by send_started_at, id;
```

O esperado é zero novos marcadores após a revalidação do desligamento. Não faça
limpeza antes dessa conferência: excluir metadados também excluiria a evidência.
Um marcador já existente pode terminar completed/failed/outcome_unknown após
o corte; acompanhe o mesmo ID, preservando a incerteza de envio/faturamento.

## Contratos para #472

```ts
const repository = createSemanticReviewRepository(database);
await repository.listWorkspacesWithExpirableObservations({now, clock, limit: 100, afterWorkspaceId});
await repository.expireObservations({workspaceId, now, clock, limit: 100});
await repository.cleanObservations({workspaceId, now, clock, limit: 100}); // dry run
await repository.cleanObservations({workspaceId, now, clock, limit: 100, apply: true});
await repository.cleanCollectionRuns({workspaceId, now, clock, limit: 100, apply: true});
await repository.cleanQuotaDays({workspaceId, now, clock, limit: 100, apply: true});
```

`now` é obrigatório em todas as entradas; `workspaceId` é obrigatório nas
operações de expiração e limpeza. `clock?:()=>Date` permite revalidar o
relógio após locks. Quando fornecido, `clock` tem precedência em **todas** as
leituras de tempo, inclusive na seleção; `now` é o fallback. O relógio é relido
após o lock, inclusive para não transicionar candidatos se ele retroceder.
`limit` padrão 100 aceita inteiros de 1 a 100. Cada chamada é
uma página em transação curta, `lock_timeout=2s`, `statement_timeout=5s`,
`FOR UPDATE SKIP LOCKED` apenas em tabelas do piloto. Nenhum lock em Trabalho,
marca ou workspace. Não há tentativa automática em falha de SQL.

| Operação | Resultado seguro |
| --- | --- |
| listWorkspacesWithExpirableObservations | workspaceIds em ordem estável, nextCursor |
| expireObservations | workspaceId, examined, expired, recovered, outcomeUnknown, observationIds por categoria |
| cleanObservations | workspaceId, mode, status, cutoff, eligible, deleted, observationIds |
| cleanCollectionRuns (#471) | workspaceId, mode, status, cutoff, eligible, deleted, runIds |
| cleanQuotaDays | workspaceId, mode, cutoffDayUtc, eligible, deleted, dayUtc |

`observationIds` e `dayUtc` identificam **somente a página**, sem conteúdo.
Na expiração, `observationIds={expired, recovered, outcomeUnknown}` lista os
IDs efetivamente alterados; cada contador confere com o tamanho de sua lista.
Registre esses IDs antes da limpeza, sobretudo os desconhecidos recuperados.
`SKIP LOCKED` pode deixar linhas ocupadas de fora; página vazia não certifica
ausência definitiva de pendências concorrentes. Nova chamada drena a próxima
página após o commit anterior. Dry run não move cursor nem modifica estado;
repeti-lo pode mostrar a mesma página. Apply recalcula elegibilidade e pode
divergir da prévia se o estado mudar. O #472 deve limitar o trabalho pelo seu
deadline; não criar loop sem teto nem interpretar expiração como retry de HTTP.
`listWorkspacesWithExpirableObservations` lista somente workspaces com linhas
expiráveis, sem ler conteúdo ou depender do estado da política. `now` é
obrigatório; `limit` padrão 100 aceita 1–100 e `afterWorkspaceId` é UUID opcional
exclusivo. Passe `nextCursor` para a próxima página; página cheia pode levar a
uma página vazia final. Reinicie sem cursor na varredura seguinte para alcançar
pendências novas em IDs anteriores. A lista é uma fotografia, não um claim:
revalide sempre em `expireObservations`, que mantém workspace explícito.

A #472 automatiza **somente a expiração**. Limpeza permanece manual, sempre com
workspace explícito, prévia e aplicação própria; nunca agendar `apply`. Feche a
exportação da #471 e o relatório da #473 antes de remover a evidência que eles
precisam. A #471 acrescenta `cleanCollectionRuns` ao mesmo repositório e à CLI manual:
workspace explícito, dry run padrão, página de até 100 e `recordedAt < now−30d`.
A mesma guarda de janela ativa bloqueia seleção/aplicação/DELETE; a pausa de uma
política válida não libera o ledger. Marcadores `initialPage` saem antes das
outras páginas da política, e um marcador ocupado impede limpar suas páginas
seguintes: a retenção parcial não aparenta uma história completa. Cada chamada
é independente; não combina locks do ledger com observações/cotas. A CLI só
chama o ledger se a limpeza de observações estiver `ready`. Esta entrega não registra job.

| Estado encontrado | Expiração explícita |
| --- | --- |
| queued com expiresAt ≤ now (24h da coleta) | skipped / queue_expired, sem HTTP |
| running com lease vivo | intacto, mesmo com observação vencida |
| running com lease vencido e sendStartedAt | outcome_unknown / lease_expired_after_send, marcador e cota preservados, qualquer política |
| running com lease vencido, sem marcador, observação vencida | skipped / queue_expired |
| running com lease vencido, sem marcador, observação ainda válida | queued, owner e lease limpos; nova execução ainda revalida política |
| terminal | intacto pela expiração; nunca se torna reenviável |

Como defesa, queued com marcador e sem lease ativo também vira desconhecido.
Running sem lease conhecido não é presumido vencido: requer investigação.
Chamadas tardias de um owner expirado não sobrescrevem a recuperação.

## Limites da retenção

Limpeza não expira pendências implicitamente. Execute expiração, confira o
resultado, depois faça dry run da limpeza. Somente `completed`, `failed`,
`skipped` e `outcome_unknown` com `createdAt < now − 30 dias` e sem lease ativo
podem sair. A idade conta desde a criação do metadado, inclusive desconhecido
recuperado recentemente; não é uma janela nova desde `finishedAt`.

**Deduplicação ativa:** uma política não revogada com `expiresAt > now` bloqueia
a limpeza de observações, seja `enabled` ou `disabled`. Uma política já vencida
não bloqueia, mesmo que o campo state continue `enabled`: ela não coleta nem
pode ser reativada sem nova autorização. Dry run e apply
retornam `status=blocked_active_pilot_window`, zero IDs e zero exclusões. O
operador deve encerrar o piloto (revogar ou deixar vencer) antes da remoção;
pausar política válida não basta. A condição é relida antes da aplicação e integra o predicado do DELETE.
Fora desse bloqueio, status é `ready`. A verificação usa o estado confirmado no
banco em cada leitura, não autoriza cadastro/reativação concorrente ao encerramento.

Os 30 dias são um **piso de idade para elegibilidade**, não um teto de retenção
durante uma janela ativa contínua. Renovações encadeadas mantêm os metadados e
resultados enumerados por mais de 30 dias até a janela fechar, para preservar
identidades e deduplicação. Não se armazena texto criativo bruto. Esta decisão
não aplica uma lápide nem remove resultados durante a janela.

Remover uma identidade fora da retenção encerra sua deduplicação histórica;
após nova autorização, um Trabalho tocado sem mudança de hash pode ser coletado
novamente. Não use a limpeza para reiniciar experimento. Outro experimento exige
perfil/versionamento explícito. Dentro da janela, nova ativação não recria
identidade terminal; `skipped` também é terminal.

Cota tem operação separada para evitar combinar locks de observações e cotas.
Ela preserva o dia UTC corrente e toda a janela de 30 dias, inclusive o **dia
inteiro** da fronteira. Só remove `dayUtc < data UTC(now − 30 dias)`, até 100
dias por chamada. A CLI só a chama se a limpeza de observações não foi bloqueada.
Reservas atuais não disputam essas linhas antigas. Nunca diminui attempts nem
devolve tentativa; nenhuma cota dentro da janela sai ao trocar/revogar política.

Políticas e vínculos permanecem como evidência de autorização. Não são removidos
Trabalhos, fontes, cobrança, corpus externo, journal global nem arquivos da
exportação. Exclusão referencial de Trabalho/marca/workspace continua com os
cascades existentes. Não há rollback destrutivo ou migration nesta etapa.

## Demonstração controlada

```sh
cd app
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run jev:retain -- demo
```

Cria três observações sintéticas, simula crash após um marcador durável sem
invocar HTTP, revoga a política e confirma zero novos marcadores. Avança o
relógio para expiração/recuperação e depois retenção; confere dry run sem
escrita, aplicação explícita, cota antiga e ledger (#471) removidos e Trabalhos intactos. Usa o
advisory lock compartilhado das suítes Jev e relógio isolado além das políticas
residuais. Bloqueia fetch global e remove só seus próprios dados ao terminar.
Nada dessa evidência demonstra chamada ou retenção do fornecedor real.
