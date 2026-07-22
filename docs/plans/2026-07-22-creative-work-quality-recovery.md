# Plano de implementação — recuperação de qualidade do Creative Work

- Status: READY_FOR_APPROVAL
- Repository: `/Users/jhonatan/Repos/ADScale_2`
- Requested outcome: recuperar contexto, fidelidade, diferenciação entre protocolos, variações de formato e confiabilidade operacional do Creative Work da Home, com um Gate 8 humano que prove a melhoria antes do rollout geral.

## OBJECTIVE

Entregar os quatro protocolos da Home — Peça única, Variações, Adaptar formatos e Mudar estilo — sobre o agregado canônico `creative_work`, cada um com comportamento próprio e observável, preservação factual e de marca, no máximo duas chamadas de imagem por output e estados/cobrança coerentes mesmo sob timeout, retry, lote parcial ou reentrega do job.

A mudança estará pronta para liberação geral somente quando testes determinísticos cobrirem o contrato completo e um novo Gate 8 comparar cegamente o Creative Work corrigido contra o snapshot da produção atual e a geração direta. O Gate 8 deve provar qualidade e operação: zero regressões objetivas, preferência humana mínima, p95, memória, chamadas e refunds dentro dos limites aprovados.

## AUTHORITATIVE CONTEXT

- Repository instructions: `app/AGENTS.md` exige GPT Image 2 como único provider, preservação do seam usado pelo provider determinístico, manutenção dos metadados de candidatos e uso do agregado/API/jobs de `creative_work` para a Home.
- Product/architecture decision: `docs/adr/0013-trabalho-criativo-first.md` fixa a espinha `marca → briefing → creative work → geração → revisão → entrega → aprendizado`, uma implementação canônica por comportamento, Postgres como verdade operacional, Brand Training independente e Gate 8 antes de expansão.
- Approved design: `docs/superpowers/specs/2026-07-22-creative-work-quality-recovery-design.md` é a autoridade para escopo, contratos dos protocolos, fact pack, referências, QA, retry, créditos, desempenho e rollout.
- Historical evidence: `.planning/validation/image-harness-blind-gate.json` e `.planning/validation/image-harness-blind-gate-REPORT.md` registram o gate anterior reprovado por regressões objetivas; esse resultado serve como baseline diagnóstico, não como aprovação da nova implementação.
- Historical human protocol: `docs/plans/2026-07-14-phase8-human-evidence-protocol.md` e `app/scripts/check-phase8-human-evidence.mjs` fornecem o padrão de honestidade da coleta humana, mas a aprovação excepcional com 1/10 jornadas não satisfaz este novo Gate 8.
- Current behavior — protocol collapse: `app/src/server/jobs/creative-work.ts` constrói prompt de social post para todos os protocolos e envia `social_post`; `app/src/server/generation/pipeline/execute.ts` traduz esse modo para `art_variation` e aciona route planner; `app/src/server/ai/image-generation.ts` pode gerar três candidatos internos e refinement. O efeito é um torneio oculto por output.
- Current behavior — output plan: `app/src/server/creative-work/contracts.ts:quoteCreativeWork` já persiste três outputs para `variations`, um por formato para `format_adaptation` e um para `single`/`restyle`, mas o modo real enviado ao executor não preserva essa intenção.
- Current behavior — context: `app/src/server/creative-work/prepare.ts:deriveCreativeWorkTitle` reduz o título a 80 caracteres; `inferSocialPostBrief` usa apenas a primeira análise e preenche audiência genérica; `app/src/server/application/prepare-creative-work.ts` passa esse briefing reduzido para `app/src/server/creative-work/copy.ts`.
- Current behavior — references: `app/src/server/jobs/creative-work.ts` usa um limite único de quatro imagens, pode priorizar identidade antes de fontes e não envia conteúdo visual em todos os protocolos; isso permite que uma referência obrigatória seja omitida.
- Current behavior — quality: `app/src/server/generation/pipeline/post-generation.ts` e `app/src/server/generation/canonical/policies.ts` usam score/threshold para aceitar ou rejeitar Creative Work. `app/src/server/ai/creative-qa.ts` e `app/src/server/ai/creative-quality-gate.ts` já contêm checklist e classificação objetiva reutilizáveis, mas ainda não produzem o contrato `pass | fail | inconclusive` persistido por output da Home.
- Current behavior — retry and billing: `app/src/server/jobs/creative-work.ts` redispara uma falha de transporte; `app/src/server/repositories/creative-work.ts` usa `retryCount` para requeue automático e manual, sem contador durável de chamadas ao provider; `app/src/server/application/retry-creative-work-output.ts` faz retry manual gratuito na mesma linha; a política atual não reembolsa toda falha pós-provider.
- Current behavior — state: `app/src/app/api/creative-work/[id]/generate/route.ts` responde `202`; `app/src/lib/hooks/use-creative-work.ts` faz polling de 2 segundos; `app/src/components/creative-work/useCreativeComposer.ts` reconstrói trabalhos persistidos e protege contra submit duplicado. Esses contratos devem permanecer.
- Current behavior — analytics 400: `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` emite quatro eventos `output_learning_recommendation_*` e três propriedades que não existem nas allowlists de `app/src/server/beta-analytics/types.ts`; `recordBetaAnalyticsEvent` rejeita o payload antes do insert.
- Current behavior — capacity: `render.yaml` mantém a aplicação no plano web `starter`; a especificação aprovada registra RSS acima do alvo e cinco refinements produtivos terminando em timeout. O worker dedicado permanece fora desta entrega.
- Existing pattern to reuse: CAS e idempotência de `app/src/server/repositories/creative-work.ts`, snapshot JSONB em `creative_work_items.input_snapshot`, provider determinístico em `app/src/server/ai/providers/e2e-controlled-provider.ts`, classificação pura em `app/src/server/ai/creative-quality-gate.ts`, refunds em `app/src/server/billing/credits.ts`, polling/resultado parcial da Home e scripts de evidência em `app/scripts/`.
- Candidate implementation reference: `origin/codex/imagegen-stabilize-accelerate` pode ser consultada somente para timeout único, heartbeat, normalização, refund idempotente, descarte tardio e cancelamento por lease. A branch não é base de merge ou cherry-pick: contém mudanças amplas e riscos já identificados.
- Validation commands are rooted in `app/package.json`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:create-post-e2e`, `npm run convergence:gate` e `npm run release-gate`.

## SCOPE

### In scope

- Corrigir os contratos e a execução de Peça única, Variações, Adaptar formatos, Mudar estilo e revisão dentro do fluxo canônico `creative_work`.
- Preservar pedido integral, fatos com proveniência, marca resolvida e papéis de conteúdo/estilo.
- Remover route planner, judge, candidatos internos e refinement implícitos apenas para Creative Work.
- Introduzir QA objetivo tri-state, correção automática limitada, teto durável de chamadas, refund idempotente, heartbeat, normalização e descarte tardio.
- Manter lote parcial, polling, retomada após fechar a aba e retry manual restrito ao output elegível.
- Corrigir o `400` dos eventos `output_learning_recommendation_*` sem acoplar analytics à geração.
- Cobrir o contrato com testes unitários, integração, banco e E2E determinístico.
- Implantar sob switch temporário congelado no snapshot e executar um Gate 8 humano novo, após aprovação separada do gasto.

### Out of scope

- Alterar Assistente, Goal Agent, campanhas/derivações, Brand Training ou a arquitetura de aprendizado.
- Trocar ou adicionar provider/modelo de imagem; OpenAI GPT Image 2 continua único.
- Criar executor, persistência, tabela, jornada, endpoint raiz ou dashboard paralelo por protocolo.
- Implantar worker dedicado de 2 GB nesta entrega.
- Adicionar controles de CTA, paleta, fidelity ou um wizard à Home.
- Fazer score subjetivo ou aparência “genérica” disparar retry automático.
- Executar gerações reais pagas ou o Gate 8 produtivo sem orçamento e aprovação explícitos.
- Usar a aprovação histórica incompleta da Fase 8 ou o blind gate reprovado como evidência de release.
- Remover route planner, judge ou metadados de candidatos de superfícies que ainda os utilizam.

## REQUIREMENTS

### R-001 — Resolver protocolo, modo canônico e outputs visíveis sem torneio oculto

- Current evidence: `app/src/server/creative-work/contracts.ts:quoteCreativeWork`, `app/src/server/application/generate-creative-work.ts:generateCreativeWork`, `app/src/server/jobs/creative-work.ts:creativeWorkOutputJob`, `app/src/server/generation/pipeline/execute.ts:executeCanonicalGeneration` e `app/src/server/ai/image-generation.ts:generateAndStoreImage`.
- Required behavior: uma tradução pura e única deve resolver `toolKind`, revisão, modo canônico, plano de outputs e política de execução. `single` gera um `social_post` direto em alta qualidade; `variations` gera exatamente três outputs persistidos (`conservative`, `balanced`, `bold`) em `art_variation`; `format_adaptation` gera um output `format_adaptation` por formato alvo; `restyle` gera um `restyling`; revisão gera um `creative_revision` ligado ao pai. Para destinos `creative_work_output`, o executor não pode chamar route planner, selector/judge, candidatos ocultos ou refinement. O legado explícito `toolKind: "social_post"` mantém sua compatibilidade atual até uma migração própria e não redefine Peça única.
- Likely surfaces: modificar `app/src/server/creative-work/contracts.ts`, `app/src/server/application/generate-creative-work.ts`, `app/src/server/jobs/creative-work.ts` e `app/src/server/generation/pipeline/execute.ts`; ajustar testes nos mesmos módulos. Se um helper for necessário, criá-lo sob `app/src/server/creative-work/`, não como novo módulo em `src/server/ai/`.
- Preserve: provider seam, `GenerationRequest`, metadados canônicos de candidato, comportamento de campanhas/derivações e idempotência de `operationKey`/plan rows.
- Acceptance criteria:
  1. Cada protocolo envia o modo canônico definido na especificação, inclusive revisão.
  2. Peça única, Mudar estilo e revisão criam um output; Variações cria exatamente três; Adaptação cria exatamente um por formato alvo sem duplicatas.
  3. Uma execução normal faz uma chamada de imagem por output visível e nenhuma chamada oculta de rota, judge ou refinement.
  4. Os três outputs de Variações usam o mesmo snapshot/fact pack e níveis distintos persistidos.
  5. Chamadores não-Creative-Work que hoje usam rotas/candidatos continuam com o comportamento e metadados atuais.
  6. Reentrega da mesma confirmação não cria output, cobrança ou evento adicional.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/creative-work/contracts.test.ts src/server/application/generate-creative-work.test.ts src/server/generation/pipeline/execute.test.ts src/server/ai/image-generation.test.ts src/server/jobs/creative-work.test.ts`
  - Os testes devem espiar `mode`, `creativeLevel`, quantidade de outputs e chamadas, e demonstrar zero chamadas ao planner/selector/refinement para `destination.kind = creative_work_output`.

### R-002 — Persistir um fact pack completo e validar a copy antes de cobrar ou gerar

- Current evidence: `app/src/server/creative-work/prepare.ts:inferSocialPostBrief` considera apenas `analyses[0]` e cria “Público da marca”; `deriveCreativeWorkTitle` trunca; `app/src/server/application/prepare-creative-work.ts:prepareCreativeWork` congela request/sources sem fact pack; `app/src/server/creative-work/copy.ts:generateSocialPostCopy` recebe somente o briefing reduzido.
- Required behavior: `CreativeWorkInputSnapshot` deve aceitar um `factPack` opcional, versionado e compatível com linhas antigas. A projeção conserva o pedido integral, todas as análises `content|both`, fatos obrigatórios e permitidos, elementos de marca obrigatórios/proibidos, identidade resolvida e proveniência `request | source | brand` com identificador da fonte quando aplicável. Números, datas, oferta, condições, credenciais, marca, produto e serviço explícitos nunca podem ser inferidos. A copy é gerada desse contrato e passa por validação estruturada; uma alegação sem origem pode sofrer uma única reescrita textual, mas, se persistir ou a validação não for segura, o preparo falha como `invalid_context` antes de cobrança e provider. `deriveCreativeWorkTitle` permanece apenas apresentação.
- Likely surfaces: modificar `app/src/server/creative-work/contracts.ts`, `app/src/server/creative-work/prepare.ts`, `app/src/server/creative-work/copy.ts` e `app/src/server/application/prepare-creative-work.ts`; provável helper novo `app/src/server/creative-work/fact-pack.ts`; testes em `contracts.test.ts`, `prepare.test.ts`, `copy.test.ts` e `prepare-creative-work.test.ts`.
- Preserve: coluna JSONB `input_snapshot`, snapshots antigos sem `factPack`, copy editável existente, lock/CAS de preparo e isolamento por workspace.
- Acceptance criteria:
  1. O pedido completo, sem truncamento, chega ao snapshot e à geração de copy.
  2. Todas as fontes efetivas `content|both` contribuem; nenhuma verdade factual vem de uma fonte exclusivamente `style`.
  3. Cada fato normalizado contém valor, classe, obrigatoriedade e proveniência auditável; informação ausente não recebe placeholder factual genérico.
  4. Para adaptação, fatos e texto essencial da arte original são obrigatórios; para variação/restyle, o mesmo contrato factual é compartilhado entre outputs.
  5. Copy com preço, data, benefício, prova, condição, credencial, marca, produto ou serviço sem origem é reescrita uma vez e depois bloqueada se continuar inválida.
  6. Falha de fact pack/copy retorna erro tipado antes de `recordImageGenerationBatch` e antes de qualquer chamada de imagem.
  7. Um snapshot antigo sem `factPack` continua legível; um trabalho antigo ainda em `ready` reconstrói somente o bloco ausente sem duplicar cobrança.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/creative-work/contracts.test.ts src/server/creative-work/prepare.test.ts src/server/creative-work/copy.test.ts src/server/application/prepare-creative-work.test.ts src/server/application/generate-creative-work.test.ts`
  - Fixtures devem incluir o pedido de Psicologia com “agosto” e “vagas limitadas”, duas fontes de conteúdo, uma fonte de estilo contendo fatos alheios e uma copy com alegação inventada.

### R-003 — Tornar conteúdo, estilo e marca autoridades explícitas e não expulsáveis

- Current evidence: `app/src/server/application/prepare-creative-work.ts` infere papéis de restyle; `app/src/server/jobs/creative-work.ts` agrega referências num limite de quatro, omite conteúdo visual em parte dos modos e pode colocar referências de identidade antes das fontes; `app/src/server/creative-work/identity.ts` já ranqueia assets de marca; `app/src/server/ai/image-analysis.ts` já produz `ContentBrief` e `StyleBrief`.
- Required behavior: o plano de referências deve ser derivado do protocolo e ordenar primeiro tudo que é obrigatório. Adaptação exige a arte original na primeira posição e nunca cai para geração sem referência. Restyle exige uma referência de conteúdo e outra de estilo, nessa ordem; estilo transfere apenas linguagem visual e não transfere marca, produto, copy ou anúncio. Referências de Brand Training ocupam somente vagas restantes do limite. Quando a análise identificar com confiança uma marca explícita na arte de conteúdo diferente da marca ativa, `prepare` retorna conflito tipado e bloqueia cobrança até o usuário escolher `source` ou `active`; a escolha é persistida opcionalmente em `CreativeWorkSettings`. Ausência ou ambiguidade de conflito segue automaticamente com a marca ativa.
- Likely surfaces: modificar `app/src/server/creative-work/contracts.ts`, `app/src/server/application/prepare-creative-work.ts`, `app/src/server/creative-work/identity.ts`, `app/src/server/jobs/creative-work.ts`, `app/src/app/api/creative-work/[id]/route.ts`, `app/src/lib/hooks/use-creative-work.ts`, `app/src/components/creative-work/useCreativeComposer.ts` e o componente do composer que renderizará a escolha; provável helper sob `app/src/server/creative-work/` para resolver referências/conflito.
- Preserve: máximo de referências aceito pelo provider, seleção ranqueada de identidade, escopo de assets por workspace, fluxo direto sem pergunta quando não existe conflito e independência do Brand Training.
- Acceptance criteria:
  1. Adaptação sem original pronto ou com download inválido termina como `reference_failure` e realiza zero chamadas de imagem; não existe fallback generate.
  2. Restyle envia conteúdo primeiro, estilo segundo e, somente depois, até o limite, assets opcionais da marca autorizada.
  3. Uma fonte obrigatória nunca é descartada para dar lugar a identidade opcional.
  4. Marca explicitamente conflitante bloqueia `prepare`, não cobra e apresenta exatamente duas escolhas curtas; a escolha salva permite retomar o mesmo draft.
  5. Sem conflito explícito de alta confiança, a marca ativa é registrada no fact pack e nenhuma pergunta nova aparece.
  6. Referência de outro workspace, fonte não pronta ou combinação restyle incompleta é rejeitada antes do provider.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/application/prepare-creative-work.test.ts src/server/creative-work/identity.test.ts src/server/creative-work/prompt.test.ts src/server/jobs/creative-work.test.ts src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx`
  - Os testes devem inspecionar a ordem/quantidade dos buffers, os dois ramos do conflito XTB e a ausência da escolha quando a marca não conflita.

### R-004 — Construir prompts por protocolo que preservem o contrato correto

- Current evidence: `app/src/server/creative-work/prompt.ts:buildSocialPostPrompt` monta um prompt genérico para todos os tools; `app/src/server/jobs/creative-work.ts` o usa em todos os outputs; `app/src/server/ai/factual-visual-separation.ts` e `app/src/server/ai/canonical-creative-contract.ts` contêm vocabulário reutilizável de separação factual/visual sem substituir o fluxo da Home.
- Required behavior: o builder do Creative Work deve receber modo resolvido, fact pack, nível criativo, formato e referências com papéis. Peça única transforma pedido e marca em uma peça; Variações mantém fatos/marca iguais e diferencia direção visual por nível; Adaptação mantém a mesma peça — fatos, texto essencial, marca, conceito e direção — alterando somente composição, escala e distribuição para o formato; Restyle preserva conteúdo, aplica somente atributos visuais da fonte de estilo e respeita a autoridade de marca escolhida; revisão combina instrução, pai e contrato original. A implementação continua em um builder/executor canônico, com blocos de política por modo, e não cria classes por protocolo.
- Likely surfaces: modificar `app/src/server/creative-work/prompt.ts`, `app/src/server/jobs/creative-work.ts` e, somente para impedir torneio no destino Creative Work, `app/src/server/generation/pipeline/execute.ts`; reutilizar tipos existentes de `app/src/server/ai/creative-contract.ts` sem criar nova superfície geradora.
- Preserve: regras de campanha/derivação, proteção de logo exato/composição em `app/src/server/creative-work/composite.ts`, locale e dimensões canônicas.
- Acceptance criteria:
  1. Nenhum prompt de Creative Work contém “Público da marca” ou deriva fatos do título truncado.
  2. Os três prompts de Variações têm fact pack/brand idênticos e direção visual distinta e observável para `conservative`, `balanced` e `bold`.
  3. O prompt de adaptação ordena preservar a mesma peça e proíbe reinvenção de conceito, marca, fatos ou texto essencial.
  4. O prompt de restyle nomeia separadamente `CONTENT AUTHORITY`, `STYLE AUTHORITY` e `BRAND AUTHORITY`, e proíbe contaminação factual da fonte de estilo.
  5. A correção objetiva, quando existir, parte do prompt/fontes originais e acrescenta somente os códigos e instruções cirúrgicas da falha; nunca refina genericamente o output anterior.
  6. Prompts e rotas de campanha fora do destino Creative Work permanecem inalterados em comportamento.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/creative-work/prompt.test.ts src/server/generation/pipeline/execute.test.ts tests/unit/ai/prompt-rule-isolation.test.ts tests/unit/ai/quality-prompt-regression.test.ts src/server/jobs/creative-work.test.ts`
  - Snapshots/assertions de prompt devem usar fatos concretos e verificar presenças e proibições por modo, não apenas o nome do modo.

### R-005 — Persistir QA objetivo `pass | fail | inconclusive` sem confundir gosto com integridade

- Current evidence: `app/src/server/ai/creative-qa.ts` já retorna checklist estruturado; `app/src/server/ai/creative-quality-gate.ts` separa códigos objetivos de polish; `app/src/server/generation/pipeline/post-generation.ts` e `app/src/server/generation/canonical/policies.ts` ainda rejeitam Creative Work por score/threshold; `creative_work_outputs.quality` já é JSONB.
- Required behavior: cada imagem produzida deve passar por validações determinísticas de arquivo/dimensões e QA visual contextualizado por fact pack e referências. O resultado persistido em `quality` deve ser versionado e conter `objectiveVerdict`, códigos objetivos, sinais subjetivos, status do avaliador e tentativa. Falhas objetivas são: fato obrigatório ausente/alterado, alegação sem origem, marca/logo/produto/serviço errado, contaminação da referência de estilo, referência obrigatória ignorada, dimensão/formato errado, arquivo corrompido/inutilizável e texto factual renderizado de forma ilegível ou severamente cortada. Score subjetivo alto nunca aprova uma falha objetiva; score baixo, aparência genérica ou falha do scorer subjetivo nunca rejeitam nem disparam retry. Falha técnica/ambiguidade do QA objetivo vira `inconclusive`: output disponível com sinal de revisão, sem retry e sem contar como aprovação no Gate 8.
- Likely surfaces: modificar `app/src/server/ai/creative-qa.ts`, `app/src/server/ai/creative-quality-gate.ts`, `app/src/server/generation/pipeline/post-generation.ts`, `app/src/server/generation/canonical/policies.ts` e `app/src/server/jobs/creative-work.ts`; adaptar somente tipos compartilhados indispensáveis em `app/src/server/ai/creative-contract.ts`; renderizar o sinal em `app/src/components/creative-work/CreativeResultCard.tsx`.
- Preserve: orquestração/persistência de QA das derivações de campanha, disponibilidade de output quando somente o scorer subjetivo falha e JSONB compatível com `quality: null`/formatos legados.
- Acceptance criteria:
  1. Qualquer código objetivo confirmado força `objectiveVerdict: "fail"` independentemente do score.
  2. `pass` exige checks determinísticos válidos e ausência de falha objetiva confirmada.
  3. Timeout/erro/ambiguidade do avaliador objetivo persiste `inconclusive`, conclui o output e não consome segunda chamada.
  4. Um finding exclusivamente subjetivo permanece advisory e conclui o output sem retry.
  5. Dimensão incorreta, imagem corrupta e ausência de referência obrigatória são detectáveis sem depender do modelo de visão.
  6. A Home diferencia output aprovado objetivamente de output disponível que requer revisão.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/creative-quality-gate-orchestration.test.ts src/server/generation/pipeline/post-generation.test.ts src/server/jobs/creative-work.test.ts src/components/creative-work/CreativeResultCard.test.tsx`
  - Fixtures devem cobrir score 95 + fato inventado, score baixo sem falha objetiva, dimensão errada, arquivo inválido e QA indisponível.

### R-006 — Impor teto durável de duas chamadas, recuperação exclusiva e saldo líquido correto

- Current evidence: `app/src/server/repositories/creative-work.ts` persiste `retryCount`, mas não chamadas ao provider; `requeueCreativeWorkOutputOnce` e `requeueFailedCreativeWorkOutput` podem abrir novos jobs; `app/src/server/jobs/creative-work.ts` faz retry de transporte em outro evento e não reembolsa todas as falhas; `app/src/server/billing/credits.ts:refundCredits` oferece a base de idempotência.
- Required behavior: cada output deve ter contador durável próprio de chamadas de imagem, separado de `retryCount`, com valor inicial zero e limite absoluto dois ao longo da vida da linha. A chamada é reivindicada atomicamente antes de alcançar o provider. A segunda chamada tem uso exclusivo: retry de transporte se a primeira não produziu imagem, ou correção objetiva se a primeira produziu imagem com `objectiveVerdict: fail`; ela nunca serve aos dois. Não há terceiro provider call por reentrega, timeout, lease, falha da correção ou clique manual. Uma cobrança líquida existe por output em `queued|processing|completed`; retry/correção não adiciona cobrança; falha terminal fica com saldo líquido zero por refund idempotente. Retry manual mantém a mesma linha e só é oferecido se ainda houver orçamento durável; se um refund já ocorreu, a operação original deve ser reativada de forma idempotente antes do enqueue, deixando no máximo um débito líquido, nunca dois.
- Likely surfaces: modificar `app/src/server/db/schema.ts` e gerar uma migration Drizzle para `image_call_count`; modificar `app/src/server/repositories/creative-work.ts`, `app/src/server/jobs/creative-work.ts`, `app/src/server/application/retry-creative-work-output.ts`, `app/src/server/billing/credits.ts` e adapters de API/UI do retry; criar `app/tests/integration/creative-work-recovery.test.ts` para a conciliação real em Postgres. Não sobrecarregar `quality` ou `retryCount` como contador financeiro/operacional.
- Preserve: IDs de output, `operationKey`, versionamento de revisão, resultados parciais e custo de cinco créditos por output planejado.
- Acceptance criteria:
  1. A transição `0→1→2` do contador é CAS/atômica e uma tentativa de `2→3` falha antes do provider.
  2. Reentrega duplicada do Inngest não altera contador, status, output ou ledger depois de conclusão/falha.
  3. Primeiro timeout retryable permite exatamente uma segunda chamada; sucesso + falha objetiva permite exatamente uma correção; correção que sofre timeout não recebe terceira chamada.
  4. `inconclusive` e falha exclusivamente subjetiva não usam o orçamento restante.
  5. Lote com dois sucessos e uma falha mantém dois outputs cobrados/visíveis e reembolsa somente o output falho.
  6. Repetir o refund ou o comando manual não duplica crédito, débito, output ou evento.
  7. Output antigo recebe default seguro; leitura de linhas antigas e migrations existentes continua válida.
  8. `retryCount` continua descrevendo requeues/comandos, enquanto `imageCallCount` é a única autoridade para chamadas de provider.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/repositories/creative-work.test.ts src/server/application/retry-creative-work-output.test.ts src/server/billing/credits.test.ts src/server/jobs/creative-work.test.ts src/server/application/generate-creative-work.test.ts`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm run test:db:setup`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-recovery.test.ts`
  - O teste com Postgres deve consultar outputs e transações e provar `image_call_count <= 2`, um débito líquido por sucesso e refund único por falha terminal.

### R-007 — Manter o job vivo e dentro do orçamento de memória do web starter

- Current evidence: `render.yaml` usa o web `starter`; `app/src/server/jobs/creative-work.ts` carrega buffers sem heartbeat de etapa; `app/src/server/ai/image-generation.ts` mantém candidatos/refinement; `app/src/server/ai/providers/openai-image-provider.ts` possui alteração local não commitada com timeout único e `maxRetries: 0`; `origin/codex/imagegen-stabilize-accelerate` contém padrões candidatos, mas não aprovados em bloco.
- Required behavior: concorrência de geração no processo web começa em 1. Referências são validadas/normalizadas para limites seguros de dimensão e pixels antes do provider, preservando alpha quando necessário; buffers brutos e candidatos perdedores são liberados assim que deixam de ser necessários; cache do Sharp fica desabilitado no caminho. O SDK possui uma única autoridade de timeout e `maxRetries: 0`, sem retry empilhado. O job toca heartbeat/`updatedAt` somente enquanto possui o output `processing`, verifica a posse entre etapas e aborta antes de outra chamada/commit ao perder lease. Uma conclusão tardia falha no CAS, é descartada, não altera billing e emite telemetria. Telemetria estruturada deve correlacionar `workspaceId`, `workItemId`, `outputId`, protocolo, run/attempt, etapa, duração, RSS, chamadas, retry, verdict e refund.
- Likely surfaces: modificar `app/src/server/jobs/creative-work.ts`, `app/src/server/repositories/creative-work.ts`, `app/src/server/ai/image-generation.ts` e, apenas se a alteração local ainda não satisfizer o contrato, `app/src/server/ai/providers/openai-image-provider.ts`; provável helper sob `app/src/server/creative-work/` para normalização. Consultar a branch candidata por diff e reimplementar somente os trechos necessários.
- Preserve: provider determinístico, uploads finais/candidate metadata, composição de logo exato, timeout HTTP do cliente separado do job e nenhum worker novo.
- Acceptance criteria:
  1. No máximo uma chamada de imagem está em voo por processo web no rollout inicial.
  2. Referência acima do limite é normalizada ou rejeitada de forma tipada antes de pressionar o provider; buffer original não permanece retido após upload.
  3. SDK não faz retries internos e nenhuma outra camada duplica o retry controlado de R-006.
  4. Heartbeat só atualiza a linha ainda `processing`; job que perdeu lease não chama provider novamente nem completa/falha a linha.
  5. Conclusão tardia é registrada como descarte e não muda ledger/status.
  6. A carga determinística com delays controlados prova que duração/RSS são medidos, agregados e rejeitados quando excedem o orçamento; os limites reais de p95 ≤ 4 minutos por output, p95 ≤ 8 minutos por lote e RSS < aproximadamente 358 MB são bloqueados pela evidência de rollout de R-011.
  7. Falha das rotinas auxiliares de telemetria/limpeza não transforma um output já concluído em falha.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/ai/image-generation.test.ts src/server/ai/providers/openai-image-provider.test.ts src/server/jobs/creative-work.test.ts src/server/repositories/creative-work.test.ts`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm run test:create-post-e2e`
  - O cenário controlado de carga deve registrar métricas por output/lote em evidência JSON consumível pelo Gate 8; ele não pode usar o provider pago.
  - Após a execução aprovada do rollout, `cd /Users/jhonatan/Repos/ADScale_2/app && npx tsx scripts/check-creative-work-quality-recovery-gate.ts ../.planning/validation/creative-work-quality-recovery-gate.json` valida os limites reais.

### R-008 — Preservar a jornada assíncrona e apresentar somente decisões/erros acionáveis

- Current evidence: `app/src/app/api/creative-work/[id]/generate/route.ts` retorna `202`; `app/src/lib/hooks/use-creative-work.ts:creativeWorkRefetchInterval` faz polling; `app/src/components/creative-work/useCreativeComposer.ts` protege submit e reidrata trabalho; `app/src/components/creative-work/CreativeResultCard.tsx` mostra retry por output; o erro atual chega como string/código genérico.
- Required behavior: gerar continua sendo `202` + polling e sobrevive a aba fechada. A UI mantém outputs independentes em lote parcial e nunca apaga sucesso por falha irmã. A única pergunta nova é a escolha de autoridade de marca de R-003, com duas opções acessíveis e retorno ao mesmo submit após autosave. Falhas de output são projetadas em categorias estáveis: `timeout`, `invalid_context`, `factual_violation`, `brand_conflict`, `reference_failure`, `unknown`; códigos internos/sanitizados podem ser mais específicos, mas a UI deve explicar o próximo passo. `inconclusive` é resultado disponível com revisão recomendada. Retry manual aparece apenas em output falho elegível segundo R-006; revisão falha continua pelo comando pago de nova versão, não pelo retry inicial.
- Likely surfaces: modificar `app/src/app/api/creative-work/[id]/route.ts`, `app/src/app/api/creative-work/[id]/outputs/[outputId]/retry/route.ts`, `app/src/lib/hooks/use-creative-work.ts`, `app/src/components/creative-work/useCreativeComposer.ts`, `CreativeComposer.tsx`, `CreativeResultCard.tsx` e chaves correspondentes em `app/messages/pt-BR.json` e `app/messages/en.json`; criar `app/src/lib/hooks/use-creative-work.test.ts` para o contrato de polling/erro tipado do hook.
- Preserve: fluxo direto request/upload → preparar → gerar, feedback imediato, prevenção de clique duplicado, seleção/aprovação/download, acessibilidade existente e mensagens sem dados internos do provider.
- Acceptance criteria:
  1. Confirmação inicial e revisão continuam respondendo `202`, e GET/polling chega ao mesmo estado terminal depois de fechar/reabrir a Home.
  2. Um lote `completed + processing + failed` é exibido como parcial com ações apenas no output correspondente.
  3. Conflito de marca move foco para a escolha, expõe labels de teclado/leitor de tela, salva a opção e não cria novo draft.
  4. Cada categoria de falha possui texto pt-BR/en e ação coerente; mensagem não vaza stack, prompt, chave ou payload do provider.
  5. `inconclusive` não é exibido como falha nem como aprovação objetiva.
  6. Clique repetido em gerar, escolher marca ou retry não duplica comando.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/lib/hooks/use-creative-work.test.ts`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm run test:create-post-e2e`

### R-009 — Eliminar o `400` de analytics com taxonomia própria e allowlist mínima

- Current evidence: `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` chama `recordEvent` com `output_learning_recommendation_viewed|dismissed|accepted|edited` e propriedades `traceId`, `evidenceEventCount`, `blockedFieldCount`; `app/src/server/beta-analytics/types.ts:BETA_EVENT_KEYS/ALLOWED_PROPERTY_KEYS` não contém esses valores; `app/src/server/beta-analytics/record.ts` rejeita event key desconhecida.
- Required behavior: adicionar os quatro nomes existentes como uma família própria da taxonomia — sem renomeá-los para `next_experiment_*` — e permitir apenas as três propriedades adicionais já enviadas, mantendo sanitização escalar/tamanho/denylist. O registro continua fire-and-forget no cliente e não pode bloquear geração, aceite, edição ou dismiss.
- Likely surfaces: modificar `app/src/server/beta-analytics/types.ts`, `sanitize.test.ts`, `record.test.ts`, `instrumentation.integration.test.ts`, `app/src/components/campaigns/OutputLearningRecommendationCard.test.tsx` e, se necessário, o teste da rota `/api/analytics/events`.
- Preserve: rejeição de evento/propriedade realmente desconhecidos, validação de workspace/campaign/session e nomes `next_experiment_*` usados por sua funcionalidade original.
- Acceptance criteria:
  1. Os quatro eventos do card são aceitos com seus payloads atuais e persistidos com event key inalterada.
  2. `traceId`, `evidenceEventCount` e `blockedFieldCount` aceitam somente escalares dentro dos limites existentes.
  3. Evento ou propriedade fora da allowlist continua retornando `400`.
  4. Falha/429 do endpoint não impede `onAccept`, `onEdit` ou dismiss local.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- src/server/beta-analytics/sanitize.test.ts src/server/beta-analytics/record.test.ts src/server/beta-analytics/instrumentation.integration.test.ts src/components/campaigns/OutputLearningRecommendationCard.test.tsx`
  - O teste de integração deve enviar o mesmo corpo usado pelo card e observar resposta 2xx/inserção, além do controle negativo 400.

### R-010 — Provar o fluxo completo com provider determinístico antes de qualquer geração paga

- Current evidence: `app/src/server/ai/providers/e2e-controlled-provider.ts` já substitui o provider real; `app/tests/e2e/create-post.spec.ts` cobre a Home; `app/scripts/seed-create-post-e2e.ts` prepara fixture; testes atuais ainda assumem triplet/social post e não cobrem a matriz nova.
- Required behavior: ampliar fixtures e instrumentação do provider controlado para registrar modo, qualidade, dimensões, ordem/papel das referências e contagem de chamadas, além de simular timeout retryable, falha objetiva, QA inconclusivo e falha de um output em lote. O E2E deve cobrir Peça única textual, Variações, Adaptação em três formatos, Restyle sem conflito, Restyle com conflito e revisão. O teste deve operar pela API/UI pública, consultar estado persistido e provar reabertura/polling, parcial, refund e não duplicação.
- Likely surfaces: modificar `app/src/server/ai/providers/e2e-controlled-provider.ts` e testes, `app/scripts/seed-create-post-e2e.ts`, `app/tests/e2e/create-post.spec.ts`; provável helper/fixture de evidência sob `app/tests/` ou `app/scripts/`, sem rota de produção nova.
- Preserve: opt-in explícito `E2E_CONTROLLED_PROVIDER=true`, bloqueio do provider controlado fora de ambiente permitido e nenhuma dependência de rede/creditos no gate automático.
- Acceptance criteria:
  1. Peça única produz 1 chamada/output; Variações 3/3; Adaptação 3/3; Restyle 1/1; revisão 1/1 no caminho feliz.
  2. O provider controlado prova modo, dimensão e referências corretos para cada protocolo.
  3. Timeout na primeira chamada usa a segunda e termina; falha objetiva usa a correção; nenhum cenário ultrapassa duas chamadas.
  4. QA inconclusivo e finding subjetivo completam sem retry; falha objetiva repetida falha/refunda.
  5. Fechar/reabrir preserva o trabalho, e retry manual elegível mantém output/ledger únicos.
  6. Nenhum teste desta etapa chama OpenAI ou consome créditos reais.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm run test:db:setup && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm run seed:create-post-e2e`
  - Em terminais separados: `cd /Users/jhonatan/Repos/ADScale_2/app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true npm run dev:next` e `cd /Users/jhonatan/Repos/ADScale_2/app && npm run inngest:dev`.
  - `cd /Users/jhonatan/Repos/ADScale_2/app && E2E_CONTROLLED_PROVIDER=true npm run test:create-post-e2e`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint && npm run typecheck && npm run build && npm run convergence:gate && npm run release-gate`

### R-011 — Fazer rollout reversível e bloquear release geral no novo Gate 8

- Current evidence: a especificação aprovada exige switch temporário; `app/src/server/validation/env.ts` centraliza env server-side; `creative_work_items.input_snapshot` congela entrada; `app/scripts/check-image-harness-blind-gate.ts` valida apenas gates antigos de duas alternativas; `.planning/convergence/phase8-human-journeys.json` está encerrado com dívida e não mede esta mudança.
- Required behavior: adicionar switch server-side temporário `CREATIVE_WORK_QUALITY_RECOVERY_ENABLED`, validado e desligável. No `prepare`, persistir `generationPolicyVersion: "legacy" | "quality_recovery_v1"` no snapshot; jobs sempre obedecem à versão congelada, não ao valor atual do env. Desligar o switch reverte somente novos trabalhos, enquanto outputs em voo terminam no contrato original. Criar um checker específico sob `app/scripts/` e evidência em `.planning/validation/creative-work-quality-recovery-gate.json`; ele deve validar exatamente 10 jornadas completas, pelo menos 3 marcas, 2 segmentos, todos os quatro protocolos com ao menos 2 casos, comparação cega de três opções e métricas técnicas/financeiras. O switch deve ser removido depois de Gate 8 aprovado e regressões automáticas verdes; falha do gate exige manter rollout fechado ou reverter novos trabalhos.
- Likely surfaces: modificar `app/src/server/validation/env.ts`, `app/src/server/creative-work/contracts.ts`, `app/src/server/application/prepare-creative-work.ts`, `app/.env.example` e `render.yaml` com preservação das alterações locais; criar `app/scripts/check-creative-work-quality-recovery-gate.ts`, seu teste em `app/tests/unit/ai/creative-work-quality-recovery-gate.test.ts` e o script correspondente em `app/package.json`; criar template/evidência somente quando a implementação estiver pronta.
- Preserve: jobs em andamento, snapshots legados, rollback sem alteração de banco destrutiva, protocolo humano honesto e proibição de geração paga sem aprovação.
- Acceptance criteria:
  1. Trabalho preparado com v1 continua v1 se o switch mudar antes do job; trabalho novo após desligar usa legacy.
  2. Rollout segue: testes determinísticos → um output controlado → lote de três → Gate 8 completo → remoção do switch.
  3. As 10 jornadas incluem pelo menos 2 por protocolo, 3 marcas e 2 segmentos, obrigatoriamente: Psicologia preservando “agosto”/“vagas limitadas”; XTB separando conteúdo/estilo/identidade; NR1 adaptando a mesma peça nos três formatos.
  4. Cada caso apresenta anonimamente produção congelada, geração direta e Creative Work v1; empate conta como não preferência pelo v1.
  5. Gate só passa com 0 regressões factuais/de marca/dimensão, 100% dos outputs planejados em estado terminal coerente, preferência v1 ≥ 6/10 sobre cada baseline e nenhum protocolo abaixo de 50%.
  6. Gate também exige p95 ≤ 4 minutos/output, p95 ≤ 8 minutos/lote de três, RSS < aproximadamente 358 MB, 0 refinement, ≤ 2 chamadas/output e conciliação Postgres de falhas/refunds.
  7. `objectiveVerdict: inconclusive` não conta como aprovação objetiva; qualquer caso novo inconclusivo impede o requisito de zero regressão/validação objetiva até revisão humana resolvê-lo.
  8. Evidência histórica/incompleta não satisfaz nenhum contador do novo checker.
  9. O checker retorna saída não zero para amostra incompleta ou qualquer limite violado e só retorna zero com todas as condições simultaneamente atendidas.
  10. Gerações reais do rollout/Gate 8 só começam após aprovação explícita de orçamento; até lá o status operacional permanece “aguardando execução paga”, sem bloquear a implementação.
- Verification:
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npm test -- tests/unit/ai/creative-work-quality-recovery-gate.test.ts src/server/validation/env.test.ts src/server/application/prepare-creative-work.test.ts src/server/jobs/creative-work.test.ts`
  - `cd /Users/jhonatan/Repos/ADScale_2/app && npx tsx scripts/check-creative-work-quality-recovery-gate.ts ../.planning/validation/creative-work-quality-recovery-gate.json`
  - Antes da coleta humana, o template `pending_human_review` deve sair com código 2; evidência incompleta/violada com código 1; somente o gate completo com código 0.
  - Depois de remover o switch: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint && npm run typecheck && npm run build && npm run convergence:gate && npm run release-gate`.

## DELIVERY ORDER

1. **Congelar baseline e contratos, sem provider pago:** preservar os artefatos atuais, criar testes falhos do resolver e introduzir versionamento do snapshot/contador durável (R-001, R-006, R-011).
2. **Recuperar contexto antes de mexer na imagem:** implementar fact pack, proveniência, copy validada e compatibilidade de snapshots (R-002).
3. **Resolver autoridades e prompts:** ordenar referências, bloquear adaptação sem original, resolver conflito de marca e materializar políticas por protocolo (R-003, R-004).
4. **Separar integridade de gosto:** introduzir QA tri-state e remover score subjetivo do caminho de reject/retry da Home (R-005).
5. **Fechar a máquina de estados financeira/operacional:** claim de chamadas, retry exclusivo, refund, heartbeat, lease, descarte tardio, normalização/memória e telemetria (R-006, R-007).
6. **Projetar estado para o usuário:** integrar escolha de marca, categorias de erro, inconclusive, parcial e elegibilidade de retry mantendo `202` + polling (R-008).
7. **Corrigir analytics de forma independente:** atualizar taxonomia/allowlist e regressões do card/endpoint (R-009).
8. **Validar sem custo:** completar matriz unitária, integração, Postgres, E2E controlado, build, convergence e release gate (R-010).
9. **Rollout controlado:** habilitar v1 somente para o caso controlado, depois lote de três; interromper/reverter novos trabalhos se chamadas, status, tempo, RSS ou ledger divergirem (R-011).
10. **Gate 8 e remoção da compatibilidade:** após aprovação do orçamento, executar as 10 jornadas cegas; somente com checker verde liberar geral e remover o switch temporário (R-011).

## RISKS AND DECISIONS

- **Worktree já contém alterações do usuário.** A implementação deve começar por `git status`/diff e preservar tudo que não pertence a este plano. Em especial, `app/src/server/ai/providers/openai-image-provider.ts`, `app/.env.example` e `app/package.json` já possuem mudanças locais; satisfazer um requisito existente não autoriza sobrescrevê-las.
- **Não integrar a branch candidata inteira.** `origin/codex/imagegen-stabilize-accelerate` é somente fonte de padrões pontuais. Cada trecho deve ser refeito sobre a árvore atual e coberto por teste; worker, mudanças de auth e alterações laterais ficam fora.
- **Contador durável é uma migration intencional.** `retryCount` não representa chamadas reais e não pode garantir o teto sob reentrega. `image_call_count` é a alteração mínima de persistência necessária; fact pack, policy version e autoridade de marca continuam em JSONB conforme o design.
- **Retry manual respeita o teto absoluto.** Ele atua na mesma linha falha e não cria nova versão; fica indisponível quando `imageCallCount = 2`. Se o output havia sido reembolsado e ainda é elegível, o comando reativa idempotentemente a cobrança original, mantendo no máximo um débito líquido. Isso reconcilia recuperação manual, teto e “uma cobrança por output”.
- **Falha antes do provider não pode virar geração grátis.** Erro factual/contextual bloqueia antes da cobrança. Falha operacional posterior à cobrança termina com refund; uma retomada manual elegível deve reestabelecer o mesmo débito líquido antes do job.
- **Legado `social_post` não é Peça única.** O resolver novo trata `single` como uma saída direta e mantém o adapter legado até trabalho explícito de migração, evitando mudança silenciosa em callers antigos.
- **Switch é política de criação, não de execução tardia.** O env é copiado para o snapshot no preparo; ler o env dentro do job quebraria rollback e reprodutibilidade.
- **Anti-expansion gate.** Helpers novos ficam preferencialmente em `src/server/creative-work/` ou `app/scripts/`; qualquer novo `.ts/.tsx` sob `src/server/ai/` falha `convergence:gate` contra `origin/main`.
- **QA inconclusivo privilegia disponibilidade, não release.** O usuário vê o output, mas o Gate 8 não o contabiliza como objetivo aprovado.
- **Medição de memória precisa refletir o Render starter.** Um teste local sem limite equivalente não sustenta o alvo de 358 MB; a evidência final deve registrar o processo/instância e método de coleta.
- **O novo Gate 8 é pago e humano.** Automação prepara e confere evidência, mas não substitui avaliação cega. A execução espera aprovação separada; nenhum comando deste plano autoriza gasto.
- **Upgrade de worker é condicional.** Se o retrofit correto ainda não alcançar p95/RSS, o resultado é um blocker de release e insumo para nova especificação, não permissão automática para ampliar infraestrutura.

## VALIDATION MATRIX

| Requirement | Acceptance evidence | Verification |
|---|---|---|
| R-001 | Matriz protocol→mode→outputs→calls; spies provam ausência de planner/judge/refinement no Creative Work | `npm test -- src/server/creative-work/contracts.test.ts src/server/application/generate-creative-work.test.ts src/server/generation/pipeline/execute.test.ts src/server/ai/image-generation.test.ts src/server/jobs/creative-work.test.ts` |
| R-002 | Snapshot versionado contém pedido integral, todas as fontes factuais e proveniência; copy inventada é reparada/bloqueada pré-cobrança | `npm test -- src/server/creative-work/contracts.test.ts src/server/creative-work/prepare.test.ts src/server/creative-work/copy.test.ts src/server/application/prepare-creative-work.test.ts src/server/application/generate-creative-work.test.ts` |
| R-003 | Ordem de buffers, bloqueio sem original e UI de conflito apenas no caso explícito | `npm test -- src/server/application/prepare-creative-work.test.ts src/server/creative-work/identity.test.ts src/server/creative-work/prompt.test.ts src/server/jobs/creative-work.test.ts src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx` |
| R-004 | Prompts por protocolo preservam fatos/mesma peça e isolam conteúdo, estilo e marca | `npm test -- src/server/creative-work/prompt.test.ts src/server/generation/pipeline/execute.test.ts tests/unit/ai/prompt-rule-isolation.test.ts tests/unit/ai/quality-prompt-regression.test.ts src/server/jobs/creative-work.test.ts` |
| R-005 | Quality JSON tri-state; falha objetiva domina score; inconclusive/advisory não retry | `npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/creative-quality-gate-orchestration.test.ts src/server/generation/pipeline/post-generation.test.ts src/server/jobs/creative-work.test.ts src/components/creative-work/CreativeResultCard.test.tsx` |
| R-006 | Postgres prova contador ≤2, CAS, ledger líquido e refund por output | `npm test -- src/server/repositories/creative-work.test.ts src/server/application/retry-creative-work-output.test.ts src/server/billing/credits.test.ts src/server/jobs/creative-work.test.ts src/server/application/generate-creative-work.test.ts` + `DATABASE_URL=postgres://test:test@localhost:5433/adscale_test TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-recovery.test.ts` |
| R-007 | Evidência controlada prova instrumentação/lease e o Gate 8 registra p95/RSS reais | `npm test -- src/server/ai/image-generation.test.ts src/server/ai/providers/openai-image-provider.test.ts src/server/jobs/creative-work.test.ts src/server/repositories/creative-work.test.ts` + `npm run test:create-post-e2e` + checker de R-011 |
| R-008 | UI/API mantém 202, polling, reabertura, parcial, escolha acessível e erros tipados | `npm test -- src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/lib/hooks/use-creative-work.test.ts` + `npm run test:create-post-e2e` |
| R-009 | Os quatro eventos reais retornam 2xx; payload desconhecido continua 400; ações do card não bloqueiam | `npm test -- src/server/beta-analytics/sanitize.test.ts src/server/beta-analytics/record.test.ts src/server/beta-analytics/instrumentation.integration.test.ts src/components/campaigns/OutputLearningRecommendationCard.test.tsx` |
| R-010 | E2E determinístico cobre 4 protocolos, revisão, retries, partial, billing e reabertura sem OpenAI | `E2E_CONTROLLED_PROVIDER=true npm run test:create-post-e2e` + `npm run lint && npm run typecheck && npm run build && npm run convergence:gate && npm run release-gate` |
| R-011 | Checker novo rejeita pendência/regressão e aceita somente 10 jornadas/3 marcas/2 segmentos com todos os limites | `npm test -- tests/unit/ai/creative-work-quality-recovery-gate.test.ts src/server/validation/env.test.ts src/server/application/prepare-creative-work.test.ts src/server/jobs/creative-work.test.ts` + `npx tsx scripts/check-creative-work-quality-recovery-gate.ts ../.planning/validation/creative-work-quality-recovery-gate.json` |
