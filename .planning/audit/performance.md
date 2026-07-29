# Ledger revalidado — Performance do ADScale

**Verificado em:** 2026-07-29

**Substitui:** auditoria heurística de 2026-05-23

**Fonte de verdade:** os 20 achados nomeados de A1 a F2

## Reconciliação da contagem

A auditoria anterior declarava 36 problemas no resumo executivo, enquanto o
resumo consolidado registrava 32; o corpo continha 20 achados nomeados. As
contagens posteriores de 18 e 22 também não podem ser reproduzidas a partir do
documento: orçamento, Top 10 e Quick Wins repetiam ou reagrupavam os mesmos
achados, sem formar claims independentes.

Este ledger corrige a fonte de verdade para os **20 achados nomeados**:

| Estado | Quantidade | Entra no backlog ativo? |
|---|---:|---|
| Confirmado | 0 | Não |
| Resolvido | 17 | Não |
| Referência inválida | 3 | Não |
| Não verificado | 0 | Não |
| **Total** | **20** | |

## Critério de estado

- **Confirmado:** o comportamento ainda existe e a evidência basta para uma
  correção delimitada.
- **Resolvido:** o comportamento pedido pela auditoria já está implementado ou
  o claim foi invalidado pelo contrato atual.
- **Referência inválida:** o módulo citado não existe mais ou não contém o
  comportamento descrito; não há correção ativa derivável do claim.
- **Não verificado:** existe comportamento relacionado, mas falta medição de
  impacto ou análise de risco. O próximo passo é verificar, não corrigir.

## Ledger dos 20 achados

| ID | Módulo de domínio | Estado | Evidência em 2026-07-28 | Próximo passo |
|---|---|---|---|---|
| A1 | Listagem de campanhas | Resolvido | A listagem padrão limita 50 campanhas, ordenadas pela atualização mais recente; a variante paginada aceita limite e deslocamento. | Fora do backlog. |
| A2 | Persistência de derivações e assets de campanha | Resolvido | Consumidores enumerados; payload, plano e p50/p95/p99 medidos em cenário local real e benchmark representativo; sem impacto material confirmado. | [#115](https://github.com/jhowtkd/adscale/issues/115) |
| A3 | Persistência de campanhas e derivações | Resolvido | Consultas candidatas associadas a callsites, volume, latência e planos; índices existentes e sobrepostos considerados; nenhum índice novo justificado. | [#117](https://github.com/jhowtkd/adscale/issues/117) |
| A4 | Métricas de campanha | Resolvido | Contagens agregadas medidas em 24.000 derivações sintéticas e schema local real; consistência e custo de escrita não justificam denormalização. | [#116](https://github.com/jhowtkd/adscale/issues/116) |
| B1 | Leitura de derivações e object storage | Resolvido | URLs assinadas, consulta e serialização medidas separadamente em cenário de 120 derivações; concorrência e LRU existentes considerados; sem correção confirmada. | [#121](https://github.com/jhowtkd/adscale/issues/121) |
| B2 | Exportação de campanhas | Resolvido | O download e o batch upload usam streams de entrada, `generateNodeStream` e upload/response por stream; conversão de formato só mantém o buffer da imagem individual. | Fora do backlog. |
| B3 | Clientes de provedores de IA | Resolvido | Os clientes têm timeouts explícitos de 60–180 s. O provedor de imagem usa zero retry deliberadamente porque cada chamada é cobrada e o orquestrador controla repetição e teto durável. | Fora do backlog; preservar a invariante de billing. |
| B4 | Proteção das APIs de leitura | Resolvido | Inventário reproduzível classificou 87 GETs por ameaça, autorização, custo e controles; não há evidência de impacto que justifique rate limit genérico; segurança permanece separada de performance. | [#118](https://github.com/jhowtkd/adscale/issues/118) |
| C1 | Polling de derivações | Resolvido | O polling para quando não há trabalho pendente e usa intervalos progressivos de 3 s, 5 s e 10 s. | Fora do backlog. |
| C2 | Provider de consultas do cliente | Resolvido | Devtools são importados dinamicamente e renderizados somente em desenvolvimento. | Fora do backlog. |
| C3 | Sistema de animações | Resolvido | `MotionBoundary` concentra o carregamento preguiçoso e os callers migrados não importam diretamente `framer-motion` ou `motion/react`. | Fora do backlog. |
| C4 | Estado de notificações do cliente | Resolvido | A coleção tem teto determinístico e preserva auto-dismiss e ações atuais. | Fora do backlog. |
| D1 | Pipeline de imagem | Referência inválida | O job citado apenas reexporta a normalização. A implementação canônica usa um único pipeline Sharp de resize, PNG e buffer; não há evidência dos três buffers descritos. | Fora do backlog. |
| D2 | Creative score | Resolvido | A preparação cria apenas o data URL aceito pelo contrato, com teste de payload e limites/erros preservados. | Fora do backlog. |
| D3 | Orquestração da geração | Resolvido | Benchmark local mediu overhead por lote/unidade em 20 execuções por tamanho; testes cobrem cobrança, ACK, cancelamento, reentrega e isolamento; batching adicional não foi implementado. | [#119](https://github.com/jhowtkd/adscale/issues/119) |
| E1 | Cache de URLs assinadas do object storage | Referência inválida | O módulo citado não existe. O adaptador atual usa LRU com teto de 1.000 entradas e TTL de 4 minutos. | Fora do backlog. |
| E2 | Cliente do object storage | Referência inválida | O módulo citado não existe. O adaptador atual cria um cliente por instância e a aplicação exporta uma única instância compartilhada. | Fora do backlog. |
| E3 | Cache de consultas do cliente | Resolvido | O provider global configura coleta após 5 minutos, exatamente o valor recomendado. | Fora do backlog. |
| F1 | Ferramenta de acessibilidade | Resolvido | `@axe-core/react` está em `devDependencies`, com import dinâmico condicionado a desenvolvimento. | Fora do backlog. |
| F2 | Configuração de build | Resolvido | O gate de bundle e a compressão foram medidos separadamente; o carregamento inicial não teve redução material e os headers existentes foram preservados. | Fora do backlog. |

## Backlog ativo

### Correções concluídas

1. [#108 — Limitar notificações efêmeras no cliente](https://github.com/jhowtkd/adscale/issues/108)
2. [#109 — Transmitir exportações ZIP incrementalmente](https://github.com/jhowtkd/adscale/issues/109)
3. [#110 — Remover a residência duplicada da imagem no creative score](https://github.com/jhowtkd/adscale/issues/110)
4. [#111 — Restringir a ferramenta de acessibilidade ao desenvolvimento](https://github.com/jhowtkd/adscale/issues/111)
5. [#112](https://github.com/jhowtkd/adscale/issues/112), [#113](https://github.com/jhowtkd/adscale/issues/113) e [#114](https://github.com/jhowtkd/adscale/issues/114) — Migrar o sistema de animações para carregamento preguiçoso
6. [#120 — Verificar compressão e imports otimizados no build](https://github.com/jhowtkd/adscale/issues/120) — sem ganho material; nenhuma correção adicional foi aberta.

### Verificações concluídas — sem correção confirmada

1. [#115 — Projeções de derivações e assets](https://github.com/jhowtkd/adscale/issues/115) — sem impacto material confirmado.
2. [#116 — Contagens de campanha](https://github.com/jhowtkd/adscale/issues/116) — sem denormalização justificada.
3. [#117 — Necessidade real de novos índices](https://github.com/jhowtkd/adscale/issues/117) — nenhum índice novo justificado.
4. [#118 — Rate limit em leituras](https://github.com/jhowtkd/adscale/issues/118) — sem evidência para limite genérico; segurança separada.
5. [#119 — Batching do orquestrador](https://github.com/jhowtkd/adscale/issues/119) — sem batching adicional; sem critério de mudança confirmado.
6. [#121 — URLs assinadas na listagem de derivações](https://github.com/jhowtkd/adscale/issues/121) — custo medido sem correção confirmada.

## Invariantes

- Teste automatizado verde prova ausência de regressão funcional; não prova
  ganho de latência.
- Ganho de performance exige medição antes/depois no ambiente real de
  hospedagem.
- O cliente do provedor de imagem não deve ganhar retry automático: o
  orquestrador já controla repetição e cada chamada pode gerar cobrança.
- Itens resolvidos ou com referência inválida só voltam ao backlog mediante
  nova evidência datada.

## Instrumentação da geração — tickets #95–#106

| Ticket | Estado no worktree | Evidência principal |
|---|---|---|
| #95 | Resolvido no ponto fixo | eventos estruturados de `image_pipeline_stage` e consultas por campos; issue fechada. |
| #96 | Implementado | migration `0078`, coluna durável no work item/output e propagação para dispatch/reentrega; revisões também preservam uma correlação própria. |
| #97 | Implementado | lifecycle `requested` antes do settlement, `accepted` após a liquidação e `dispatched` após transporte na geração inicial e nas revisões, todos correlacionados com unidades/créditos. |
| #98 | Implementado | migration `0079`, `queuedAt` persistido e espera calculada sem reset em requeue. |
| #99 | Implementado | `creative_work_output_stage` com início, conclusão, duração e falha por estágio. |
| #100 | Implementado | `image_pipeline_external_call` por planner/imagem/selector/QA/score; chamadas de imagem direct carregam o `imageCallCount` do claim durável e o teste determinístico valida a sequência `[1,2]`; torneio legado mantém `providerCalls` separado. |
| #101 | Implementado | eventos de retry/requeue/lease, estágio de perda durante heartbeat do provider e teto durável de chamadas antes do provider. |
| #102 | Implementado | terminal por unidade somente após transição CAS vencedora; o endpoint de cancelamento também usa CAS em `queued/processing`, emite `outcome: canceled` e usa a chave idempotente de refund terminal; compensação/stale/late paths e falha do sink permanecem cobertos. |
| #103 | Implementado | migrations `0080`/`0081`, marcadores CAS de primeira saída/conclusão e agregação também na recuperação stale. |
| #104 | Implementado | RSS/heap/external e `activeUnitCount` no terminal; amostragem protegida contra falha. |
| #105 | Verificado localmente | matriz determinística R-010: 12/12 testes, sem provider pago. |
| #106 | Pendente de ambiente | falta preview Render com 20 execuções por braço; não é substituído pelo E2E local. |

Os estados acima descrevem implementação/evidência no worktree, não o estado
das issues no GitHub. #106 permanece deliberadamente aberto até existir o
ambiente externo exigido pelo próprio ticket.

## Medição datada dos tickets #115–#121

**Executado em:** 2026-07-28; revalidado em 2026-07-29 00:29 BRT

**Escopo observado:** banco configurado em `app/.env.local`, somente leitura,
com 7 campanhas, 8 derivações e 9 assets de workspace. O maior grupo de
derivações contém 2 itens; portanto os números abaixo são evidência do estado
atual, não um benchmark de alto volume.

### #115–#117 — consultas, payload e planos

- `getDerivationsByCampaign`: 1.259 bytes para 1 linha; plano com
  `derivations_campaign_id_idx`; execução observada de 0,016 ms.
- `getAssetsByCampaign`: 0 linhas no workspace observado; não há amostra para
  classificar o payload de assets de campanha.
- `getWorkspaceAssets` (página de 24): 9 linhas, 6.873 bytes, média de 763,67
  bytes e máximo de 1.026 bytes; plano com sequential scan e execução de
  0,044 ms para 89 linhas na tabela.
- A agregação de métricas de campanha processou 8 derivações em 7 grupos; o
  plano executou em 0,029 ms. O benchmark do dashboard, em 5 execuções, ficou
  em p50 5 ms e p95 6 ms.
- Os índices existentes incluem `derivations_workspace_campaign_idx`,
  `derivations_workspace_created_at_idx`, `campaign_assets_campaign_id_idx` e
  `workspace_assets_workspace_id_idx`. Nenhum novo índice ou coluna
  denormalizada é justificado por esta amostra.

O índice `creative_work_outputs_correlation_idx` da migration 0078 pertence à
correlação durável de #96 e à consulta do agregado de geração; ele não foi
proposto como correção de #115–#117. Os benchmarks abaixo medem as projeções
`SELECT *` porque os repositórios atuais usam `.select().from()` nesses
consumidores, e não porque o script esteja propondo ampliar projeções.

Os consumidores foram enumerados por callsite no código (isso é frequência de
uso estrutural, não volume de tráfego): `getDerivationsByCampaign` alimenta
detalhe/listagem de campanha, derivações, approval package, restyle, seleção de
base do assistant, finalização/projeção/promoção do assistant e consultas
canônicas; `getAssetsByCampaign` é usado no detalhe/assets/derivações/plan,
diagnóstico, smart resize, restyle e nos jobs/aplicações de derivação; assets de
workspace são lidos pela rota paginada de workspace; `getDashboardStats` tem um
consumer HTTP (`/api/dashboard/stats`); e exportação usa
`getApprovedDerivationsByCampaign`. A frequência real desses consumers ainda
não está disponível no banco/telemetria local.

As consultas candidatas são, portanto: (a) campanha/workspace + ordenação por
`created_at` em derivações, (b) campanha/workspace em assets, (c)
workspace + filtros/ordenação em assets de workspace, e (d) agregações de
derivações no dashboard. Para cada uma, o plano observado e os índices de
escopo existentes foram preservados; não há frequência, volume ou custo de
escrita que justifique criar índice ou coluna denormalizada.

**Classificação:** sem impacto material observado no cenário sintético
representativo e no schema local real. A frequência de tráfego real não está
disponível, mas não há claim de produção nem correção confirmada; #115–#117
ficam encerrados como verificações sem mudança, preservando payload, plano,
latência e custo de escrita como critérios para qualquer ticket futuro.

#### Reexecução representativa reproduzível

Para reduzir a dependência da amostra local de 7 campanhas, o comando
`NODE_OPTIONS='--conditions=react-server' DATABASE_URL=postgres://test:test@localhost:5433/adscale_test pnpm exec tsx scripts/measure-performance-audit.ts`
foi executado em 2026-07-28. Ele cria tabelas temporárias dentro de uma
transação e faz rollback, com 200 campanhas, 24.000 derivações, 1.600 assets
de campanha, 2.500 assets de workspace e 20 execuções por consulta.

- `getDerivationsByCampaign`: 120 linhas, 326.552 bytes; p50 2,26 ms, p95
  3,02 ms e p99 indicativo 4,57 ms; plano usando o índice
  `(workspace_id, campaign_id)`.
- `getAssetsByCampaign`: 8 linhas, 5.345 bytes; p50 0,58 ms e p95 0,72 ms;
  plano usando os índices de campanha/workspace.
- `getWorkspaceAssets` (página 24): 24 linhas, 37.003 bytes; p50 1,08 ms e
  p95 1,83 ms; o planner preferiu scan/ordenação para este volume.
- Contagens agregadas de campanha: 50 grupos e 24.000 linhas processadas;
  p50 20,24 ms e p95 22,48 ms, sem índice adicional ou estado denormalizado
  justificado.

Essa execução classifica #115–#117 como **sem impacto material observado no
cenário sintético declarado**. Ela não substitui a frequência real de
consumers nem autoriza uma correção baseada em produção; os índices existentes
e o custo de escrita continuam sendo parte do critério de qualquer ticket
posterior.

#### Reexecução no schema local real

O mesmo comando aceita `--real`:
`NODE_OPTIONS='--conditions=react-server' pnpm exec tsx scripts/measure-performance-audit.ts --real`.
Executado contra o `DATABASE_URL` local em uma transação `READ ONLY`, ele
encontrou 170 campanhas, 301 derivações, 3 assets de campanha, 89 assets de
workspace e 16 workspaces. A campanha com maior volume local tinha 8
derivações.

- Derivações: 8 linhas, 385.676 bytes; p50 4,10 ms, p95 5,00 ms e p99
  indicativo 7,71 ms; plano usando `derivations_workspace_campaign_idx`.
- Assets da campanha: 1 linha, 4.905 bytes; p50 0,33 ms, p95 0,46 ms; sem
  índice adicional escolhido pelo planner.
- Assets de workspace: página de 24, 10.530 bytes; p50 0,43 ms, p95 0,57 ms;
  sem índice adicional escolhido pelo planner.
- Contagens: 14 grupos, 2.171 bytes; p50 0,40 ms, p95 0,54 ms.
- URLs assinadas: 8 invocações; consulta p50 4,23 ms/p95 5,06 ms, presign
  local p50 0,01 ms/p95 0,05 ms e serialização p50 1,38 ms/p95 1,61 ms,
  com resposta de 389.774 bytes.

Essa medição confirma os planos e consumidores no schema real local. As 20
repetições são frequência controlada do benchmark, não frequência de tráfego.
O presign usa o adaptador R2 real e seu cache, mas não baixa objetos nem mede a
rede R2.

### #118 — leituras e rate limit

O inventário estático encontrou 87 handlers `GET`: 45 invocam
`requireWorkspaceAccess` no corpo do GET (44 sem rate limit local e 1 com ele)
e 42 não invocam esse helper. O inventário agora grava, por rota, classe de
ameaça, classe de acesso, sinais/classe de custo e controles encontrados. As
classes de ameaça são 45 `tenant-scoped`, 10 `admin`, 3 `infra-or-auth`, 22
`shared-feedback`, 2 `session-authenticated`, 1 `share-token` e 4
`public-or-unverified`. Esta última classe significa “nenhum controle estático
detectado”; não é claim de publicidade e exige confirmação runtime antes de
qualquer correção de segurança. O proxy limita mutations, não substitui uma
política de leitura. A configuração local de produção também emitiu o aviso
de fallback para `MemoryStore` sem Upstash.

Isso separa o achado de segurança do impacto de performance e não inventa um
claim de scraping em produção. O inventário reproduzível é suficiente para
rejeitar uma correção global neste ticket; qualquer mitigação de segurança deve
nascer em ticket próprio por classe de rota.

O inventário agora também é reproduzível por
`node scripts/audit-read-routes.mjs`. O JSON contém a linha de cada handler com
`threatClass`, `accessClass`, `costSignals`, `costClass` e `authControls`; a
análise é sintática do corpo do GET e a ausência de helper continua não sendo
prova de endpoint público.

O mesmo inventário registra os controles adicionais encontrados no corpo do
handler: 27 rotas com `requirePlatformOwner`, 2 com autenticação de sessão e 1
com token de compartilhamento. Também encontrou sinais sintáticos de consulta
ao banco em 75 handlers e de object storage em 10. Esses últimos números
classificam superfície de custo potencial, não frequência, latência ou volume
de tráfego, e por isso não justificam rate limit ou outra correção global.

Classificação operacional: handlers com `requireWorkspaceAccess` são leituras
com autorização de workspace (ameaça: abuso autenticado; custo: banco e, em
alguns casos, presign; controle: autorização de workspace, com rate limit local
em 1/45); handlers administrativos, de feedback, sessão, token e infra foram
mantidos nas classes próprias. As quatro rotas `public-or-unverified` ficam
explicitamente pendentes de confirmação runtime, sem serem tratadas como
públicas. Essa classificação não autoriza aplicar rate limit global nem trata
um achado de segurança como ganho de performance.

### #119 — despacho e batching

O adapter atual envia um array de eventos ao `inngest.send` — uma chamada de
transporte por geração e um evento por unidade — e os testes preservam cobrança,
ACK, reentrega, cancelamento e refund por unidade. A verificação unitária
executada foi `pnpm exec vitest run --config config/vitest.config.ts
src/server/generation/settlement-adapters.test.ts
src/server/jobs/creative-work.test.ts
src/server/application/cancel-creative-work-output.test.ts` (**132/132**).
O recovery transacional foi executado separadamente com
`DATABASE_URL=postgres://test:test@localhost:5433/adscale_test pnpm exec vitest
run --config config/vitest.config.ts tests/integration/creative-work-recovery.test.ts`
(**5/5**). O benchmark de transporte não executa esses handlers. Não foi
implementado batching adicional.
O overhead em ambiente Render não é inferido deste ticket; #106 permanece o
gate específico para medição de geração no preview. Não foi implementado
batching adicional.

O transporte local foi medido separadamente com
`INNGEST_DEV=1 node scripts/bench-inngest-dispatch.mjs`, após um evento de
warmup, em 20 execuções por tamanho, sem registrar handlers de geração. O JSON
agora separa `semanticEvidence` (testes executados separadamente) da medição
de transporte. Os
tamanhos 1/4/16/32 tiveram, respectivamente, p50/p95 de 0,97/1,54 ms,
0,93/1,14 ms, 1,50/1,74 ms e 2,28/2,57 ms; os p99 indicativos foram
2,33/1,14/1,76/2,62 ms. O custo por unidade caiu de 0,97 ms para 0,07 ms no
p50 entre 1 e 32 eventos. O script também verifica IDs únicos por geração,
correlação comum entre unidades e uma chamada de transporte por lote; as
chamadas do cliente são sequenciais. Isso mede apenas o transporte local de
um array de eventos, não o custo completo de banco, settlement, handlers ou
rede Render. A análise, portanto, conclui o ticket sem alterar batching;
qualquer mudança futura precisaria de tamanho, limites e critério de sucesso
mensuráveis.

### #106 — baseline de geração no preview

Em 2026-07-29 o inventário Render autenticado, executado com
`render services list --include-previews --output json`, mostrou apenas o
serviço web `adscale-app` em `Production`; não havia serviço/preview de PR
ativo e `gh pr list --state open` não retornou PR aberto relacionado. O deploy
live do web service estava no commit `ecac51f2249cced4a3e498bb92194aaebc37ef3c`,
diferente do ponto de trabalho `80cd0a1a` e do WIP local.

Os logs de produção preservam evidência de duas gerações antigas em
2026-07-22, incluindo três candidatos por execução, latências agregadas de
76.920 ms e 87.094 ms e RSS de 416–418 MB. Isso confirma que há tráfego
histórico observável, mas não é uma baseline válida para o ticket: é produção,
anterior ao WIP e não contém as 20 execuções por braço exigidas. Nenhuma nova
geração paga foi disparada.

**Classificação:** #106 continua pendente de um preview Render reproduzível,
com 20 execuções por braço e p50/p95/p99 correlacionados a fila, estágios,
provedor, memória, concorrência e falhas. O gate local determinístico de #105
está verde, mas não substitui esse ambiente.

### #105 — timeline determinística e R-010

Em 2026-07-28, `tests/e2e/create-post.spec.ts --grep "Creative Work v1
quality-recovery matrix"` passou com **12/12 testes** usando `E2E_CONTROLLED_PROVIDER=true`.
O caminho executou Next, PostgreSQL, Inngest, object storage e billing reais do
ambiente local; não chamou OpenAI nem consumiu créditos de produção. A matriz
cobriu single, variações, adaptação, restyle, revisão, retry de transporte,
correção objetiva, QA inconclusivo, falha factual, lote parcial e retry manual.

O log confirmou correlação estável entre request, fila, stages, chamadas
externas e terminal; no lote parcial, dois outputs completaram, o terceiro
falhou após duas chamadas e recebeu uma única refund. Essa evidência prova a
semântica/reentrega local de #105, não substitui a amostra de 20 execuções por
braço nem os percentis de performance exigidos por #106.

### #109 — exportação incremental

A verificação estrutural reproduzível cobre as duas superfícies: a rota
legada entrega `generateNodeStream` diretamente ao `Response`, e o serviço de
exportação em lote usa streams de object storage, `streamFiles: true` e
`putStream`. O teste do serviço monta um ZIP real com JSZip, confirma nomes e
conteúdo e prova que `get`/`put` por `Buffer` não são chamados no caminho sem
conversão. A conversão de formato continua limitada ao buffer da imagem
individual; o arquivo ZIP não é materializado antes do upload. A regressão de
cancelamento confirma tanto o abort antes do upload quanto a destruição do
stream do ZIP depois do primeiro chunk; um abort não é convertido em item
ausente nem segue para upload parcial. O teste de residência usa 64 chunks de
1 KiB e exige que o primeiro chunk do arquivo seja emitido antes de todos os
64 KiB de origem serem consumidos — um limite reproduzível de streaming, sem
tratar RSS ruidoso como prova de um número exato.

### #120 — build e compressão

- O gate reproduzível é `cd app && pnpm analyze:ci`; executado em 2026-07-28,
  retornou `pass: true`, `initialLoadBytes: 675895` (0,64 MB) e 54 chunks
  lazy somando 2.345.068 bytes (2,24 MB), contra o limite inicial de 2 MB.
- Baseline em `80cd0a1a` (antes da migração de animações): 676.069 bytes (0,64
  MB) no carregamento inicial e 56 chunks lazy somando 2,23 MB.
- WIP atual: 675.895 bytes (0,64 MB) no carregamento inicial e 54 chunks lazy
  somando 2,24 MB. O carregamento inicial permanece abaixo do limite de 2 MB;
  os chunks lazy são informativos.
- Em `next start` local, `/login` respondeu com 49.661 bytes gzip contra
  170.675 bytes sem compressão. Brotli não foi negociado; o servidor entregou
  gzip e expôs `Vary: ... Accept-Encoding`.
- Os headers existentes incluem CSP, `X-Frame-Options`, HSTS, `nosniff` e
  `Cache-Control` privado da página. A comparação não demonstra redução do
  carregamento inicial; não há correção adicional de build justificada sem
  medição em preview/produção.
- A comparação estática de imports é separada do tamanho: o ponto fixo tinha
  imports diretos de `framer-motion`/`motion/react` em 20 arquivos de produto;
  o WIP mantém um único import aprovado em `MotionBoundary.tsx`. Isso confirma a
  migração de ownership, mas não equivale a ganho material no bundle.

### #121 — URLs assinadas

Na campanha sintética representativa (120 derivações), o comando de benchmark
observou 120 chamadas de URL assinada por leitura. Em 20 execuções, a consulta
ficou em p50 2,02 ms/p95 3,02 ms, o presign local em p50 0,08 ms/p95 0,13 ms e
a serialização em p50 0,95 ms/p95 1,09 ms; o payload serializado mediu 382.740
bytes. O p99 indicativo foi 7,36 ms para consulta, 74,97 ms para presign e
1,15 ms para serialização. A medição executou a concorrência `Promise.all` da
rota e considerou o LRU de 1.000 entradas com TTL de 4 minutos.

Na campanha pequena anterior (2 derivações), 5 execuções observaram 2
chamadas de URL assinada por leitura. A primeira execução mediu 2,71 ms de
consulta, 7,30 ms de espera paralela do storage, 0,05 ms de serialização e
2.946 bytes de resposta; nas execuções aquecidas, consulta ficou entre 0,62 e
1,09 ms, storage entre 0 e 0,04 ms e serialização entre 0,01 e 0,05 ms.
O adaptador usa `Promise.all` e cache LRU de 1.000 entradas com TTL de 4
minutos.

O presign do benchmark é local e não baixa objetos nem mede latência de rede do
R2. O custo observado não justifica correção no ticket de verificação; nenhuma
mudança foi implementada. O cenário local real continua limitado a 8 invocações,
enquanto a campanha sintética representativa cobriu 120 derivações.
