# Estúdio — Créditos e QA: evidência do Agente D (2026-09-10)

Agente / branch / worktree: D / `codex/estudio-creditos-qa` / `.worktrees/estudio-creditos-qa`
BASE_COMUM: `3063ff4a` (`codex/estudio-integracao` no momento da criação deste worktree)

Escopo deste documento: tarefas 4–6 do plano de confiabilidade e créditos,
fatia da tarefa 4 do plano de qualidade (quality na evidência do provider
controlado + protocolo humano) e preparação da tarefa 7 do plano de
experiência. Backend A/B/D integrado em `9f653226`; execução browser depende do SHA final da interface e da liberação do coordenador.

## 1. Primeiro marco: créditos (Tasks 4–5) — ENTREGUE para merge

### Task 4 — histórico com mesmo recorte, datas e acesso explícito

- `getCreditTransactionsForWorkspace` e `getCreditTransactionSummary`
  passaram a compartilhar o helper privado `transactionWhere`
  (`CreditTransactionFilters = { from?; to?; campaignId? }`); sem duplicação
  de filtros.
- `getCreditTransactionSummary(workspaceId, filters?)` aceita o mesmo recorte
  e retorna também `distinctCampaignCount` (COUNT DISTINCT campaignId).
- `GET /api/billing/history`: listagem e resumo recebem os mesmos filtros;
  média = `round(totalSpent / distinctCampaignCount)` no mesmo recorte
  (opções de campanha continuam all-time); saldo = `creditBalance` da
  autoridade canônica `getWorkspaceBillingAccess` (não soma de grants da
  rota); datas validadas (instantes finitos, from ≤ to, campaignId UUID →
  400 `invalidInput`); date-only compatível (from = início UTC, to = fim UTC
  do dia; 31/02 e vizinhos normalizados dão 400); clientes novos usam ISO
  completo com offset.
- `GET /api/billing/status`: `billing.access.unlimited: boolean` calculado
  por `workspaceHasUnlimitedBillingAccess` — nunca por label/999999/role.
  Resposta antiga sem o campo não autoriza acesso ilimitado (cliente trata
  ausente como `false`).
- Cliente: `allTime` envia `{}` (sem corte 2020); este mês começa dia 1
  local; últimos 3 meses = mês atual−2 (antes: mês−3, ou seja, 4 meses);
  `to` = hoje 23:59:59.999 local; ISO completo, sem split. `SelectValue`
  renderiza `t(dateRange)` / nome da campanha ou "—". Vazio, loading e
  falha separados. Ilimitado exibe rótulo + explicação
  ("uso registrado sem débito"); tabela esclarece que lista movimentações
  de créditos, não todos os eventos de uso. Select global intocado.
- Uso ilimitado continua `usage_events` amount 0; nenhum débito/refund
  financeiro fictício; nenhum backfill; schema intocado.

### Task 5 — débito e histórico na mesma transação

- `createCreditTransaction(data, tx?)`: segundo parâmetro opcional
  `DbOrTx`, mesmo padrão de `repositories/usage` e `repositories/billing`.
- `recordUsage`: ledger movido para dentro do callback transacional, depois
  de `trackUsage`, só com `userId` e sem `unlimitedBillingBypass`. Falha de
  ledger rejeita e reverte (sem catch-e-engole). Replay não insere linha.
- `refundCredits`: ledger de restauração dentro da mesma transação
  (grant + usage/key + linha positiva); bypass ilimitado gera evento
  amount 0 sem débito e **sem refund financeiro** (o teste antigo que
  esperava refund positivo em bypass foi atualizado para a regra sem
  movimentação). 23505 só vira `duplicate` quando o usage esperado existe
  para workspace+chave (consulta fora da tx abortada); divergência real
  relança. Sem ciclo transacional novo nem espera externa dentro de tx.

### Comandos e resultados (Task 4–5 + qualidade-provider)

Em `app/` (2026-09-10, worktree D):

```bash
npm test -- src/server/billing/credits.test.ts \
  src/app/api/billing/history/route.test.ts \
  src/app/api/billing/status/route.test.ts \
  src/lib/hooks/use-billing.test.tsx \
  src/components/settings/CreditHistoryTab.test.tsx \
  src/components/settings/BillingTab.test.tsx \
  src/components/layout/AppSidebar.test.tsx \
  src/server/ai/providers/e2e-controlled-provider.test.ts
# 8 arquivos, 90 testes, 90 passed

npm run typecheck  # limpo
```

Vizinhança verificada sem regressão:

```bash
npm test -- src/server/generation/settlement-adapters.test.ts \
  src/server/billing/ src/app/api/billing/
# 18 arquivos, 225 testes, 225 passed

npm test -- src/server/application/generate-creative-work.test.ts \
  src/server/application/retry-creative-work-output.test.ts \
  src/server/application/revise-creative-work-output.test.ts \
  src/server/repositories/usage.test.ts \
  src/components/settings/ src/components/layout/AppSidebar.test.tsx \
  src/lib/hooks/use-billing.test.tsx
# 11 arquivos, 100 testes, 100 passed
```

Ciclo vermelho→verde observado: 5 falhas em history, 2 em status,
4 em credits (ledger/tx/bypass/23505), 1 em provider-quality, falhas de
Ilimitado em CreditHistoryTab/BillingTab/Sidebar — todas verdes após a
correção mínima. Durante o vermelho, um mock com fila `once` vazou entre
testes de refund (a transação faz 3 lookups: pré-check + 2 checks
in-tx); resolvido com fila hermética por teste, sem mudar produção.

## 2. Qualidade — fatia D da tarefa 4 (provider + protocolo)

- `recordProviderCall` grava `quality: input.quality ?? null`; geração
  controlada inalterada. Teste isolado por `E2E_PROVIDER_EVIDENCE_PATH`
  (`mkdtempSync`, cleanup em `finally`).
- Protocolo da comparação humana: ver
  `docs/evidence/2026-09-10-peca-unica-qualidade.md`. Status `not_run` —
  nenhuma geração real executada, nenhum PNG determinístico declarado
  como prova de qualidade.

## 3. Segundo marco: QA após base combinada (Tasks 6–7) — EM VERIFICAÇÃO

- Fixtures/casos E2E e extensão `quality` da evidência: preparados (este
  doc + protocolo acima).
- Estado no primeiro marco D: E2E ainda não executado. Na continuação, o coordenador executou o primeiro subconjunto API no backend integrado; resultados e correções estão no §7. Interface completa ainda aguarda integração C. Nenhum provider de produção é fallback.
- Matriz a executar pós-integração (serial-flows):
  peça→plano→fila→pronta→nota→revisão→variação→adaptação→reload no mesmo
  work; pai intacto; replay e duas abas; sem cobrança ao abrir camadas;
  carrossel salva e mostra erro; restyle não confunde análise com falta;
  seleção manual 1→1; formato auto 4:5; ledger/saldo/datas/ilimitado/
  rollback; snapshot antigo conserva comportamento; provider integrado
  (quality high, 1 chamada inicial, nenhuma autocorreção, retry técnico
  confirmado no máximo 2). Screenshots nos 3 viewports (390×844,
  1045×586, 1440×900). Casos financeiros em `create-post.spec.ts` com
  `withDb`, constraint temporária por UUID de fixture e rollback real.
- Rollback e concorrência reais já foram provados na suíte Postgres: ver marco da continuação abaixo. Unitários também verificam propagação/tx compartilhado.

## 4. Pedido concreto para outro dono (C, via coordenador)

Chaves novas de tradução (bloco exato PT/EN para incorporar em
`app/messages/pt-BR.json` e `app/messages/en.json`; C é dono dos JSONs —
D não os editou):

```json
// creditHistory
"unlimited": "Ilimitado" / "Unlimited",
"unlimitedHint": "Seu acesso é ilimitado. O uso é registrado sem débito de créditos."
  / "Your access is unlimited. Usage is recorded without debiting credits.",
"movementsNote": "Esta tabela lista movimentações de créditos, não todos os eventos de uso."
  / "This table lists credit movements, not every usage event.",
// billing.account.financial
"unlimited": "Ilimitado" / "Unlimited",
// navigation
"unlimited": "Ilimitado" / "Unlimited"
```

Até a incorporação, QA visual integrado das superfícies financeiras não
está concluído (componentes referenciam as chaves; teste usa overlay de
fixture sobre o catálogo real). Sem as chaves, `t()` renderiza o caminho
da chave — comportamento interim conhecido, não defeito.

## 5. Arquivos alterados (somente ownership D)

- `app/src/server/repositories/credit-transactions.ts`
- `app/src/server/billing/credits.ts` (+ `credits.test.ts`)
- `app/src/app/api/billing/history/route.ts` (+ teste)
- `app/src/app/api/billing/status/route.ts` (+ teste)
- `app/src/lib/hooks/use-billing.ts` (+ teste)
- `app/src/components/settings/CreditHistoryTab.tsx` (+ teste novo)
- `app/src/components/settings/BillingTab.tsx` (+ teste)
- `app/src/components/layout/AppSidebar.tsx` (+ teste, só saldo/ilimitado)
- `app/src/server/ai/providers/e2e-controlled-provider.ts` (+ teste)
- `docs/evidence/2026-09-10-estudio-creditos-qa.md` (este)
- `docs/evidence/2026-09-10-peca-unica-qualidade.md` (protocolo, not_run)

Não editados: motor/revisão/hooks criativos/caixa, schema/migrações,
messages JSON. Os quatro E2E specs e a suíte SQL foram estendidos na continuação descrita abaixo.

## 6. Limitações e produção

- Produção/chamadas pagas: não executadas. Comparação humana de 6
  gerações aguarda autorização concreta de orçamento/calls.
- E2E: subconjunto API executado pelo coordenador; restante pendente (ver §7). "Comando verde" parcial acima
  refere-se a unitários/rota/hook/componentes — 90 testes efetivos,
  0 skips, 0 bloqueios nesse recorte.


## 7. Continuação de D em worktree isolado — 2026-09-10

A sessão original de D ficou indisponível por quota. A continuação autorizada
ocorre exclusivamente em `.worktrees/estudio-qa-continuacao`, branch
`codex/estudio-qa-continuacao`, preservando o WIP e o worktree original.
Base herdada: `562d2dc6`; contratos/motor finais consumidos: `9f653226`.

Commits iniciais entregues para revisão:

- `5f869bd9`: API integrada + dois guardas SQL adicionais.
- `7ce633d7`: QA exige 409/código canônico/isSelected=false; filtro de fim do dia
  inclui sentinela na mesma campanha para não confundir filtros de data/campanha.
- `8a524ced`: download autenticado entrega PNG local; contabilização distingue
  charge/refund dos registros `dispatch-ack` de valor zero.
- `5824da72`: colisão de key com outra base válida exige resposta canônica
  400/invalidInput e mantém outputs, chamada e saldo intactos.

### Prova real de banco concluída

Comando em `app/`:

```bash
NODE_ENV=test \
DATABASE_URL=postgres://test:test@127.0.0.1:5434/adscale_estudio_qa \
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5434/adscale_estudio_qa \
npm test -- tests/integration/creative-work-recovery.test.ts \
  --project=node --maxWorkers=1 --no-file-parallelism
```

Resultado: **10 passed, 0 failed, 0 skipped**. Apenas fixtures próprias,
identificadas pelo RUN_ID e removidas ao final. Não executa seed, migrations,
setup/teardown de banco ou provider. As duas URLs são verificadas antes da
primeira consulta: localhost, porta 5434, banco `adscale_estudio_qa`, NODE_ENV=test.

A primeira tentativa no sandbox não alcançou `select 1` e ficou com 10 casos
não executados; ela não é evidência verde. A repetição do mesmo comando com
acesso local autorizado ao banco passou 10/10. O coordenador também confirmou 10/10.

Além dos oito casos herdados (CAS, replay, liquidação, rollback débito/refund
quando ledger falha), os dois novos comprovam:

1. `failed + generation_failed_terminal_refund_pending` rejeita retry no serviço,
   claim e requeue, sem alterar output/ledger nem despachar Inngest.
2. Clear usa `manualRetryAttempt` null-safe **e** retryCount. Um recovery antigo
   não apaga o marker de tentativa nova. Clear correspondente após refund
   aplicado habilita retry elegível; replay do clear é no-op. O segundo ciclo
   desse teste isola o predicado SQL, não finge uma segunda liquidação financeira.

### Ensaios iniciais API executados pelo coordenador

No backend integrado `446f021b`, a primeira rodada teve **2 passed/2 failed**
(`/tmp/estudio-integrado-e2e/api-first.log`). High e histórico passaram. Os dois
outros casos pararam no helper de download que tentava consumir `e2e-storage://`
como URL HTTP e na contagem que ignorava o ack zero do dispatch. Corrigidos os
helpers/asserts pelo contrato existente, sem alterar produto.

A segunda rodada teve **3 passed/1 failed**
(`/tmp/estudio-integrado-e2e/api-second.log`): high, histórico e QA preview/refund
passaram. CAS provou a corrida, reserva/cobrança/chamada únicas e replay, mas
parou na última negativa: colisão de base retorna 400/invalidInput no contrato
canônico, enquanto o teste exigia 409. `5824da72` corrige apenas essa expectativa
com prova de ausência de efeitos; rerun desse caso fica com o coordenador.
Não contar um caso com falha final como passed.

Com `IMAGE_JOB_TARGET=worker`, o coordenador repetiu CAS + high no integrado
`f30eb34d`: **2 passed, 0 failed** em 22,2s. Evidências lidas:
`/tmp/estudio-integrado-e2e/api-worker.log` e
`/tmp/estudio-integrado-e2e/worker-smoke-evidence.json`. O último registra conexão
`adscale-image-worker`, PID 71891 e eventos terminais de peça inicial/revisão com
uma chamada cada. Next estava no PID 71874. A UI Inngest, conforme registro do
coordenador, listou 8 funções e 5 handlers de falha. Isto não é 4/4 no mesmo alvo:
QA/refund e histórico acima foram provados na rodada anterior.

### Matriz Playwright preparada, execução visual ainda pendente

`--list --grep integrated --project=serial-flows` encontra **17 casos em 4 arquivos**:

| Arquivo | Casos preparados | O que a evidência permite afirmar |
|---|---:|---|
| create-post.spec.ts | 13 | 9 API: primeira corridaCAS, primeira reserva concorrente, high, QA fail/refund, inconclusivo, retry técnico com refund/reativação, base/adaptaçãoPNG, auto 4:5/manual 9:16, fontes pending/ready, histórico; 4 UI: retry confirmado, direção manual 1→1, fila persistida, ilimitado/filtros |
| first-studio-piece.spec.ts | 2 | jornada completa no mesmo work, notas por teclado e ponto real, editar/remover/reload, 3 ações, pai intacto, 3 viewports; QA fail com preview e Escolher bloqueado |
| creative-work-carousel.spec.ts | 1 | erro 422 de apresentação uma vez; sucesso real após texto novo e clique antes do debounce |
| layer-editor.spec.ts | 1 | seed ready, abrir/reabrir inline,3 viewports, uso sem débito ao abrir, publicar filho no mesmo work |

Casos anteriores permanecem no arquivo. Para R-010/Córtex, o snapshot legado
é persistido **antes** do dispatch com typographyPlan V1 real; mantém os asserts
históricos de fonte/composição/autocorreção. As gerações novas usam integrated_v1.

A fila usa um output queued sintético persistido sem evento, exclusivamente
para provar hidratação e reload. Isso não comprova dispatch: o caso real de
concorrência exige 202, um filho, uma chamada, um débito e PNG persistido. O
restyle modifica temporariamente o status de uma fonte **depois** da análise
real, restaurando-o em finally; não simula uma resposta de sucesso do servidor.

A UI financeira insere entitlement tester com UUID próprio apenas no workspace
sintético, verifica unlimited real pela API, uso amount 0/ledger intacto e o remove
em finally. Executar serialmente; nunca concorrer com os snapshots financeiros.

Comandos preparados em `app/`, após source do ambiente sintético fornecido
pelo coordenador (sem ler/copiar .env de produção):

```bash
source /tmp/estudio-integrado-e2e/local-env.sh
# Primeiro ensaio entregue: 4 casos API; o coordenador executa e registra o resultado.
./node_modules/.bin/playwright test tests/e2e/create-post.spec.ts \
  --project=serial-flows --workers=1 \
  --grep 'integrated API.*(CAS simultâneo|high chega|QA preview|histórico)'

# Demais jornadas: somente após integração de C/liberação; não omitir casos pelo filtro.
./node_modules/.bin/playwright test tests/e2e/create-post.spec.ts \
  tests/e2e/first-studio-piece.spec.ts tests/e2e/creative-work-carousel.spec.ts \
  --project=serial-flows --workers=1 --grep integrated
```

Camadas devem rodar **depois** da primeira jornada: `seed:layer-editor-e2e`
adiciona perfil no workspace comum e afeta suites que esperam um perfil único.
Coordenador escolhe o momento. Comando proposto, ainda não executado nesta
continuação:

```bash
LAYER_EDITOR_E2E_FIXTURE_PATH=/tmp/estudio-integrado-e2e/layer-editor.json \
  npm run seed:layer-editor-e2e
LAYER_EDITOR_E2E_FIXTURE_PATH=/tmp/estudio-integrado-e2e/layer-editor.json \
  ./node_modules/.bin/playwright test tests/e2e/layer-editor.spec.ts \
  --project=serial-flows --workers=1 --grep 'integrated layers ready fixture'
```

O seed usa apenas PNGs Sharp e dados sintéticos, mas remove suas fixtures anteriores
`Layer Editor E2E%`/usage keys próprias; não pode ser executado sem coordenação.
Não altera create-post.json. O novo teste converte temporariamente apenas o
work da fixture de social_post para single e restaura em finally para testar a caixa.
Abertura/publish não invocam separação: qualquer PATCH layerizeOutput ou
regenerateLayer é bloqueado no browser e faz o teste falhar. Seedream/AtlasCloud
real não é controlado por E2E_CONTROLLED_PROVIDER; separação/regeneração paga
não foi executada nem considerada testada.

Screenshots têm viewport definido **antes** da captura e ficam em test-results
via `testInfo.outputPath`; são artefatos para inspeção, não aprovação visual.
Nenhum snapshot visual é atualizado automaticamente para fazer o teste passar.

### Checagens estáticas desta preparação

`npm run typecheck`, eslint dos cinco arquivos de teste, `git diff --check` e
Playwright `--list` passaram. A enumeração não conta como execução E2E. O
coordenador executa os subconjuntos no SHA integrado; a continuação não
executa simultaneamente browser ou seed. Qualidade humana: todos os pares
`not_run`; texto de evento/anexos originais faltantes explicitados no protocolo.


### Ajustes de contrato após revisão dos testes preparados

O caso de direção manual espera respostas reais de `/suggest` antes e depois do
reload e verifica a decisão pendente "Manter seleção". Solicitar sugestões é
permitido; o aceite exige pool idêntico, uma escolha, quote de uma unidade,
nenhum débito ao sugerir e uma cobrança efetiva ao gerar. Não há expectativa de
silenciar requests nem alteração no hook para fazê-lo.

O restyle diferencia 422/creativeWorkInputRequired com zero fontes de
409/creativeWorkNotReady com content ready + style analyzing. O adapter não
expõe o código interno sources_not_ready em details/reason; o GET canônico
comprova o motivo. Em seguida a fonte é restaurada e prepare deve responder 200.

Na rodada de cinco APIs restantes, o coordenador observou 4 passed/1 failed em
`/tmp/estudio-integrado-e2e/api-remaining.log`: passaram inconclusivo, retry
financeiro/técnico, adaptação sem upload e auto 4:5/manual 9:16; restyle parou no
assert do código interno, corrigido pela semântica pública acima. A repetição
seletiva fica com o coordenador. Nenhuma falha do teste conta como passed.

O teste de camadas verifica no viewport móvel ausência de edição, publish e
scanner em uma fixture ready. O interceptor confere a action de primeiro nível
do PATCH (`layerizeOutput`/`regenerateLayer`) contra a rota vigente; qualquer
chamada dessas é bloqueada e reprova o teste. Os três registros financeiros
permanecem iguais ao abrir também em modo inspect.
