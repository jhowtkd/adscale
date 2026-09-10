# Estúdio — Confiabilidade e Créditos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. A propriedade A/B/C/D está no [plano coordenador](2026-09-10-estudio-fechamento-quatro-agentes.md); não implementar tarefas de outro dono.

**Goal:** Fechar falhas silenciosas, preservação de escolhas e incoerências financeiras que os dois planos anteriores não cobriam.

**Architecture:** Reusar autosave/CAS e estados persistidos; corrigir a apresentação e a precedência dos dados na origem. Billing usa um filtro comum e grava o histórico na transação financeira existente. Nenhuma nova fila ou tabela.

**Tech Stack:** React, TypeScript, Zod, Drizzle/Postgres, TanStack Query, Vitest/Testing Library e Playwright existentes.

**Spec:** [Especificação consolidada — ampliação de confiabilidade](../specs/2026-09-10-estudio-peca-na-caixa-design.md). Este plano complementa [experiência](2026-09-10-estudio-peca-na-caixa.md) e [qualidade](2026-09-10-peca-unica-qualidade.md).

## Global Constraints

- Preservar sidebar e composição contida; nenhuma expansão automática para ocupar a tela toda.
- Uma instância de `useCreativeComposer` por trabalho aberto; Postgres é a verdade operacional.
- Peça pronta imutável; cada alteração confirmada cria um output filho no mesmo `workItemId`. A geração inicial cria a raiz; retry técnico sem arte segue a operação canônica existente.
- Nenhuma geração, separação de camadas ou cobrança ao abrir, fechar, comentar, selecionar formato ou trocar miniatura.
- Revisar mostra base, pedido, comentários, formato e custo; somente confirmar dispara a operação.
- Não sobrescrever texto, formato ou direções escolhidos pelo usuário com sugestões da IA.
- PT-BR na superfície; mensagens novas têm tradução em `app/messages/pt-BR.json` e `app/messages/en.json`.
- Reusar dependências, hooks, autenticação, armazenamento, settlement e editor existentes; nenhuma dependência nova.
- Não alterar preços, entitlements ou provedores; custo exibido vem da constante/quote canônica do servidor.
- Migrações, contratos HTTP e formatos persistidos propostos exigem autorização explícita antes da execução; este pedido autoriza escrever o plano.
- Testes locais com mocks ou provider controlado; chamadas pagas e publicação dependem de autorização específica.
- Billing não cria débito/refund financeiro para uso ilimitado nem reescreve histórico anterior.

---

## Task 1 — C: Carrossel salva antes de organizar e mostra falhas

**Files:** Modify `app/src/components/creative-work/useComposerActions.ts`, `useCreativeComposer.ts`, `useCarouselComposer.ts`, `CarouselComposer.tsx`; Test `useCarouselComposer.test.tsx`, `useCreativeComposer.test.tsx`, `CarouselComposer.test.tsx` na mesma pasta.

**Interfaces:** reutilizar `flushAutosave():Promise<string|null>` de useComposerPersistence e `resolveCanonicalWorkRevision(workItemId:string):Promise<string|null>` de useComposerRevision. Expor ambos pelo return de useComposerActions e injetar em CarouselComposerInput. Hook retorna `error:string|null` e inclui `planning` em isBusy.

- [ ] **Step 1:** Corrigir o teste existente “flushes the generic draft detail then posts answers…” em useCarouselComposer.test.tsx. Reusar mocks/renderComposer/WORK_ID/NOW; adicionar helpers no harness. Testar a ordem real e falha visível:

```ts
const order: string[] = [];
const flushAutosave = vi.fn(async () => { order.push("flush"); return WORK_ID; });
const resolveCanonicalWorkRevision = vi.fn(async () => { order.push("revision"); return NOW; });
queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail({draft:null}));
bindWorkToCache();
mocks.plan.mockImplementation(async () => {
  order.push("plan"); return {work:{},draft:carouselDraft()};
});
const {result} = renderComposer({flushAutosave,resolveCanonicalWorkRevision});
await act(() => result.current.askForPlan({objective:"Lançamento"}));
expect(order).toEqual(["flush", "revision", "plan"]);
expect(mocks.plan).toHaveBeenCalledWith({workItemId:WORK_ID,expectedUpdatedAt:NOW,
  answers:{objective:"Lançamento"}});
```

Acrescentar caso flush=null: zero plan calls e error não vazio; 409/422 conserva answers/pedido; duas chamadas simultâneas planejam uma vez.

- [ ] **Step 2:** Run em `app/`: `npm test -- src/components/creative-work/useCarouselComposer.test.tsx`. Expected: FAIL na ordem/erro, não “no tests”.

- [ ] **Step 3:** Expor os helpers pelo agregador, passar ao hook e substituir o postPlan silencioso. Usar erros traduzidos com as mesmas mensagens na UI final:

```ts
const planningRef = useRef(false);
const [planning, setPlanning] = useState(false);
const [error, setError] = useState<string|null>(null);
const postPlan = useCallback(async (answers: Record<string,string>) => {
  if (planningRef.current) return;
  planningRef.current = true;
  setPlanning(true);
  setError(null);
  try {
    const id = await flushAutosave();
    if (!id) throw new Error("Não foi possível salvar o rascunho. Tente novamente.");
    const expectedUpdatedAt = await resolveCanonicalWorkRevision(id);
    if (!expectedUpdatedAt) throw new Error("Não foi possível confirmar o rascunho salvo.");
    await planMutation.mutateAsync({workItemId:id,expectedUpdatedAt,answers});
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "Falha ao organizar conteúdo.");
  } finally {
    planningRef.current = false;
    setPlanning(false);
  }
}, [flushAutosave,resolveCanonicalWorkRevision,planMutation]);
```

Não refetch pelo observer de um id anterior após criar draft. `CarouselComposer` renderiza error em role=alert; botão fica busy no flush e bloqueado com fonte uploaded/analyzing. Reusar pendingAnalysisBlocksPrepare. Não relaxar CAS/sources_not_ready do servidor. Mensagens HTTP cruas passam pelo mapeamento de erro existente.

- [ ] **Step 4:** Provar pelo useCreativeComposer real que clicar antes do debounce salva o texto novo e usa a revisão posterior; não basta mockar flush. Rodar os três testes cliente e os testes existentes `src/server/application/plan-carousel-work.test.ts` e `'src/app/api/creative-work/[id]/carousel/plan/route.test.ts'` sem alterá-los.
- [ ] **Step 5:** Commit com allowlist dos sete arquivos e traduções necessárias; mensagem `fix: surface carousel planning errors after saving the draft`.

## Task 2 — C: Preparação, referências e escolhas humanas coerentes

**Files:** Modify/Test `app/src/components/dashboard/DashboardHomeActions.tsx`/teste, `studio-stage/TalkBox.tsx`; `app/src/components/creative-work/composer-prepare.ts`, `composer-state.ts`/teste, `useComposerDirectionSuggestions.ts`, `useComposerHydration.ts`, `useComposerSessionState.ts`, `useCreativeComposer.test.tsx`, `CreativeComposer.tsx`/teste. Reusar useComposerSourceActions sem duplicar addInspiration.

**Interfaces:** TalkBox recebe `canGenerate:boolean`, fase visual derivada de actionPhase e fontes incluindo status; source gate usa o DTO real, não presença no input file. Sugestão é vinculada a workId+intent+pedido corrente.

- [ ] **Step 1:** Nos testes de Dashboard e hook existentes, acrescentar os casos abaixo antes de alterar comportamento:

```ts
// Fonte ainda em análise.
expect(screen.getByRole("button", {name:/gerar/i})).toBeDisabled();
expect(screen.queryByText("Na fila")).not.toBeInTheDocument();
expect(screen.getByText(/analisando/i)).toBeVisible();
// Após hidratar um pool manual com uma escolha e receber sugestões:
expect(result.current.directionPool?.selectedIds).toEqual([manualDirection.id]);
// A resposta atrasada do trabalho A não muda o pool atual do trabalho B.
expect(result.current.directionPool).toEqual(poolB);
```

Os cenários completos usam `workDetail` e `deferred` já existentes; manualDirection é uma direção do pool manual de fixture e poolB é o pool persistido passado em workDetail para o segundo trabalho. Acrescentar restyle original ready + estilo analyzing: não mostrar “adicione referência”; após falha mostrar ação de tentar analisar novamente.

- [ ] **Step 2:** Run: `npm test -- src/components/dashboard/DashboardHomeActions.test.tsx src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/composer-state.test.ts`. Expected: FAIL nos casos novos.

- [ ] **Step 3:** No botão real usar `disabled={!canGenerate || busy}` e passar composer.canGenerate; não tratar saving/preparing como queued. `queued|processing` vem exclusivamente de outputs/slides do servidor. Mostrar erro de prepare/dispatch dentro da caixa e conservar pedido/base.

Para restyle, manter a validação canônica do par; checar pendências/falhas antes de chamar restylePairMissing. Mostrar “Adicione a arte original”, “Adicione a referência de estilo”, “Analisando referência” ou “Não foi possível analisar a referência” conforme o estado. Confirmar sugestão do palco usa addInspiration existente. A fonte renderizada transporta status+usage; remover promessa visual de “anexada” antes do comando confirmado.

Para direções, pool persistido protege sua seleção mesmo quando só tem provenance manual/default. Capturar identidade da requisição e ignorar resposta de contexto que mudou; preservar o comportamento explícito de substituir direções depois de confirmação. Usar ref de epoch local para invalidar requests anteriores, inclusive A→B→A:

```ts
const suggestionEpochRef = useRef(0);
useEffect(() => {
  ++suggestionEpochRef.current;
  return () => { ++suggestionEpochRef.current; };
}, [workId,intent]);
// No efeito existente, depois dos guards e antes da chamada:
const epoch = ++suggestionEpochRef.current;
const preserveSelection = directionSuggestionRetryToken > 0 || directionPoolRef.current !== null;
void suggestDirections(workId).then(result => {
  if (epoch !== suggestionEpochRef.current) return;
  if (directionTouchedRef.current) {
    setPendingDirectionSuggestions({directions:result.directions,preserveSelection});
    setDirectionSuggestionState("ready");
  } else {
    applyDirectionSuggestions(result.directions,preserveSelection);
  }
}).catch(() => {
  if (epoch === suggestionEpochRef.current) setDirectionSuggestionState("error");
});
```

Declarar o efeito de identidade antes do efeito de requisição. A limpeza invalida apenas mudança de workId/intent ou desmontagem; renders por loading/polling não cancelam a requisição. Requisição explícita de retry incrementa o epoch. Conservar o reset existente de directionSuggestionRequestedRef ao trocar trabalho. Testar desmontagem, A→B e A→B→A. Não acrescentar flag persistido se a presença do pool já resolve a hidratação.

- [ ] **Step 4:** Rodar verde nos testes acima e CreativeComposer.test.tsx. Novo output queued no refetch deve manter status após reload; controlar esse caso no E2E de D.
- [ ] **Step 5:** Commit com allowlist dos arquivos efetivamente alterados; mensagem `fix: preserve studio choices and distinguish preparation from queue`.

## Task 3 — B e A, em sequência de contrato: Formato real da fonte

**Files:** B modifica `app/src/server/repositories/creative-work.ts`/teste. A modifica `app/src/server/creative-work/prepare.ts`/teste e `app/src/server/application/prepare-creative-work.ts`/teste.

**Interfaces:** B estende getCreativeWorkSourceAssetDetails com width/height nullable existentes em workspace_assets. A exporta `formatFromDimensions(width:number|null,height:number|null):CreativeWorkFormat|null` no prepare.ts existente. A seleção manual é soberana; auto deriva de uma única referência de conteúdo, nunca de referência apenas estilística.

- [ ] **Step 1:** B testa projeção scoped com width/height; A escreve teste puro e o cenário do serviço com `getSourceAssets`, `readyVariationSource`, `getWork`, `work` já existentes:

```ts
expect(formatFromDimensions(1080,1350)).toBe("4:5");
expect(formatFromDimensions(1080,1920)).toBe("9:16");
expect(formatFromDimensions(0,1350)).toBeNull();
expect(formatFromDimensions(1920,1080)).toBeNull();
// Serviço: fonte 1080x1350 + análise "vertical" + auto => effectiveFormat 4:5.
// Mesmo fixture com formatMode manual e format 9:16 => effectiveFormat 9:16.
```

- [ ] **Step 2:** Run: `npm test -- src/server/creative-work/prepare.test.ts src/server/application/prepare-creative-work.test.ts` (A); repositório existente (B). Expected: FAIL nos novos casos.

- [ ] **Step 3:** B inclui width/height no select e map sem mudar schema ou API pública. A implementa:

```ts
export function formatFromDimensions(width:number|null,height:number|null):CreativeWorkFormat|null {
  if (width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height)
      || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  for (const [format,target] of [["1:1",1],["4:5",4/5],["9:16",9/16]] as const) {
    if (Math.abs(ratio / target - 1) <= 0.01) return format;
  }
  return null;
}
```

Precedência em auto: um único formato numérico inequívoco no pedido explícito; formato da base quando é revisão; dimensões da única fonte de conteúdo; inferCreativeWorkFormat existente; formato default preparado. Se pedido menciona duas proporções, não inferir destino arbitrariamente: preservar fonte e mostrar formato na revisão. Modo manual ignora essa inferência. Tolerância de 1% é para metadados arredondados; não transformar paisagem em retrato pelo vizinho mais próximo. Sem dimensões, fallback existente, sem chamada de visão extra.

- [ ] **Step 4:** Rodar verde. Verificar que a referência de estilo de single não redefine o formato. Filho usa output.targetFormat e não reinterpreta request na hora de gerar.
- [ ] **Step 5:** B inclui a projeção em B1; A commita prepare/helper/tests na sua branch com `fix: preserve source aspect ratio in automatic format`.

## Task 4 — D: Histórico com mesmo recorte, datas e acesso explícito

**Files:** Modify `app/src/server/repositories/credit-transactions.ts`; `app/src/app/api/billing/history/route.ts`/teste, `billing/status/route.ts`/teste; `app/src/lib/hooks/use-billing.ts`/teste; `app/src/components/settings/CreditHistoryTab.tsx`, `BillingTab.tsx`/teste; `app/src/components/layout/AppSidebar.tsx`/teste. Create `app/src/components/settings/CreditHistoryTab.test.tsx`.

**Interfaces:** `CreditTransactionFilters={from?:Date;to?:Date;campaignId?:string}` no repositório; getCreditTransactionSummary aceita filters opcional, retornando também distinctCampaignCount interno. Resposta existente summary mantém os campos. Status acrescenta `billing.access.unlimited:boolean`; campo ausente em resposta antiga não autoriza acesso ilimitado.

- [ ] **Step 1:** No teste de history GET, enviar from/to/campaignId e verificar que listagem e summary recebem os mesmos filtros; campanha fora do recorte não altera média. Testar inválido→400 e vazio→resumo zero com saldo atual independente. Novo teste de CreditHistoryTab usa mock dos hooks e traduções reais:

```ts
expect(screen.getByText("Este mês")).toBeVisible();
expect(screen.queryByText(/^thisMonth$/)).not.toBeInTheDocument();
expect(screen.queryByText(/^all$/)).not.toBeInTheDocument();
// Cenário ilimitado: o fixture informa access.unlimited=true.
expect(screen.getByText(/ilimitado/i)).toBeVisible();
expect(screen.queryByText("999999")).not.toBeInTheDocument();
```

- [ ] **Step 2:** Run: `npm test -- src/app/api/billing/history/route.test.ts src/app/api/billing/status/route.test.ts src/components/settings/CreditHistoryTab.test.tsx`. Expected: FAIL nos novos casos.

- [ ] **Step 3:** Extrair helper privado no repositório e chamar em listagem/agregação; não duplicar filtros:

```ts
export type CreditTransactionFilters = {from?:Date;to?:Date;campaignId?:string};
function transactionWhere(workspaceId:string, filters:CreditTransactionFilters = {}) {
  return and(eq(creditTransactions.workspaceId,workspaceId),
    filters.from ? gte(creditTransactions.createdAt,filters.from) : undefined,
    filters.to ? lte(creditTransactions.createdAt,filters.to) : undefined,
    filters.campaignId ? eq(creditTransactions.campaignId,filters.campaignId) : undefined);
}
// No select do summary, além dos campos existentes:
distinctCampaignCount: sql<number>`COUNT(DISTINCT ${creditTransactions.campaignId})`,
```

Média usa esse distinctCampaignCount, convertido para Number; opções de filtro de campanhas continuam all-time. Histórico usa getWorkspaceBillingAccess para saldo atual; não recalcula de outra lista de grants. `/billing/status` calcula unlimited com workspaceHasUnlimitedBillingAccess existente, nunca por label/999999/role do usuário. UI usa o mesmo status canônico no histórico, BillingTab e sidebar.

Datas no cliente: allTime envia `{}`; este mês começa dia1 local; últimos3meses começa no mês atual−2; to termina no dia corrente local23:59:59.999; enviar ISO completo, sem split. API valida instantes finitos, ordem e UUID. Para compatibilidade, date-only válido continua aceito: from no início UTC e to no fim UTC daquele dia; valores calendário inválidos dão400, sem normalizar 31/02 silenciosamente. Novos clientes usam ISO com offset para preservar o fuso. Testar final do dia, virada de ano e allTime.

SelectValue renderiza `t(dateRange)` e `campaignFilter === "all" ? t("allCampaigns") : campaigns.find(c => c.id === campaignFilter)?.name ?? "—"`; não editar o Select global. Separar vazio, loading e falha. Ilimitado explica: “Seu acesso é ilimitado. O uso é registrado sem débito de créditos.” O histórico é de movimentações financeiras; não fingir que lista todos os eventos de uso. D envia as novas strings PT/EN ao dono C.

- [ ] **Step 4:** Rodar verde incluindo use-billing.test.tsx, BillingTab.test.tsx e AppSidebar.test.tsx. D pode manter fixture de mensagens em teste até C incorporar as chaves; não considerar QA visual integrado concluído nesse estado.
- [ ] **Step 5:** Commit explícito dos arquivos de D; mensagem `fix: reconcile billing history filters and unlimited access`.

## Task 5 — D: Débito e histórico na mesma transação

**Files:** Modify `app/src/server/repositories/credit-transactions.ts`, `app/src/server/billing/credits.ts` e `credits.test.ts`. Não modificar schema ou backfill.

**Interfaces:** createCreditTransaction mantém seu data atual e recebe segundo parâmetro opcional DbOrTx, igual ao padrão de repositories/usage. recordUsage/refundCredits conservam assinaturas públicas, chaves idempotentes e locks.

- [ ] **Step 1:** Estender credits.test.ts: falha no insert de ledger rejeita recordUsage; o mesmo tx é usado em grant/usage/ledger; replay não insere linha; bypass gera evento amount0, sem débito e sem refund financeiro. O teste existente que espera refund positivo em bypass muda explicitamente para a regra sem movimentação.

```ts
it("propagates ledger failure inside the financial transaction", async () => {
  mockTrackUsage.mockResolvedValue({id:"usage-1",workspaceId:"workspace-1",
    type:"image_derivation",amount:50,idempotencyKey:"ledger-failure",
    metadata:null,createdAt:new Date()});
  mockCreateCreditTransaction.mockRejectedValueOnce(new Error("ledger unavailable"));
  await expect(recordUsage({workspaceId:"workspace-1",userId:"user-1",
    action:"image_derivation",idempotencyKey:"ledger-failure"}))
    .rejects.toThrow("ledger unavailable");
  const transactionExecutor = mockTrackUsage.mock.calls[0][5];
  expect(mockCreateCreditTransaction).toHaveBeenCalledWith(
    expect.objectContaining({workspaceId:"workspace-1",type:"usage"}),transactionExecutor);
});
```

O beforeEach existente fornece paidAccess, grants e db.transaction simulado. Unitários comprovam propagação/tx compartilhado; rollback de banco será provado na tarefa6.

- [ ] **Step 2:** Run: `npm test -- src/server/billing/credits.test.ts`. Expected: FAIL porque hoje ledger é escrito depois do commit com erro engolido.

- [ ] **Step 3:** Adicionar o executor opcional na função existente:

```ts
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
// Acrescentar tx?:DbOrTx após o objeto data atual de createCreditTransaction.
const client = tx ?? db;
// O insert/values/returning atual usa client em vez de db.
```

Mover createCreditTransaction para dentro do callback transacional de recordUsage, depois de trackUsage, só quando userId existe e não há unlimitedBillingBypass. Erro de insert aborta; não capturar e seguir como sucesso. Refund faz o mesmo para restauração, usage/key e linha positiva quando houve crédito real. Preservar sender/logs externos depois do commit. Não corrigir registros passados ao reexecutar comandos antigos. No tratamento23505, só reconhecer replay se o usage esperado existe para workspace+chave, não qualquer violação de unicidade.

- [ ] **Step 4:** Rodar verde nos testes billing e nos testes de settlement já existentes; verificar nenhum ciclo transacional novo/espera externa dentro de tx. B não altera billing para integrar revisões; a costura continua no serviço canônico.
- [ ] **Step 5:** Commit `fix: commit credit ledger entries with debit and refund` com somente os três arquivos.

## Task 6 — D após integração: Provar falhas, retomada e saldo

**Files:** Modify `app/tests/e2e/first-studio-piece.spec.ts`, `create-post.spec.ts`, `creative-work-carousel.spec.ts`, `layer-editor.spec.ts`. Os cenários financeiros entram em create-post.spec.ts, reutilizando withDb e a autenticação/fixture existentes; não criar outro projeto de testes. Evidência `docs/evidence/2026-09-10-estudio-creditos-qa.md`.

**Interfaces:** provider controlado e banco local isolado; todos os contratos A/B/C/D já integrados. Nenhuma geração real para desbloquear testes.

- [ ] **Step 1:** Reusar as fixtures existentes e provar isolamento app+worker+DB. Implementar cenários específicos, sem mocks de sucesso substituindo servidor: carrossel antes de debounce e erro422; restyle analyzing→ready; reload de pool manual; auto4:5; resultado/nota/revisão/camadas do plano de experiência.
- [ ] **Step 2:** Billing isolado cria transações em dias/campanhas diferentes; mesmo filtro produz soma idêntica no resumo e tabela. Final do dia incluso; allTime sem truncamento; usuário ilimitado sem999999 e sem débitofalso. Falha controlada no insert de ledger deve reverter grants e usage; o teste injeta falha somente no banco/tx de fixture, nunca no banco externo.

```ts
expect(summary.totalSpent).toBe(transactions.filter(t => t.amount < 0)
  .reduce((sum,t) => sum + Math.abs(t.amount), 0));
expect(afterRollback.grantRemaining).toBe(beforeRollback.grantRemaining);
expect(afterRollback.usageCount).toBe(beforeRollback.usageCount);
expect(afterRollback.transactionCount).toBe(beforeRollback.transactionCount);
```

Os snapshots before/after são leituras reais do workspace de teste via withDb existente; nenhum registro de outro workspace entra na contagem. Para induzir a falha através da API real, usar constraint temporária limitada ao UUID da fixture no banco E2E isolado. Sem trigger ou flag de produção. Exigir workspace de fixture pago (unlimited=false); se o seed entrega bypass, ajustar somente o seed desse teste para grants de teste, antes de capturar o snapshot.

```ts
async function financialSnapshot(workspaceId:string) {
  return withDb(async client => {
    const result = await client.query(`select
      (select coalesce(sum(remaining),0) from adscale_app.credit_grants where workspace_id=$1) as balance,
      (select count(*) from adscale_app.usage_events where workspace_id=$1) as usages,
      (select count(*) from adscale_app.credit_transactions where workspace_id=$1) as transactions`, [workspaceId]);
    return result.rows[0];
  });
}
// Executar depois de criar/preparar workId na fixture local, antes de gerar.
if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(fixture.workspaceId))
  throw new Error("Fixture precisa de UUID válido.");
const constraint = `e2e_ledger_${fixture.workspaceId.replaceAll("-", "")}`;
const before = await financialSnapshot(fixture.workspaceId);
await withDb(client => client.query(`alter table adscale_app.credit_transactions
  add constraint "${constraint}" check (workspace_id <> '${fixture.workspaceId}'::uuid) not valid`));
try {
  const response = await request.post(`/api/creative-work/${workId}/generate`, {
    data:{action:"initial",preparedRevision},
  });
  expect(response.ok()).toBe(false);
  expect(await financialSnapshot(fixture.workspaceId)).toEqual(before);
} finally {
  await withDb(client => client.query(`alter table adscale_app.credit_transactions drop constraint "${constraint}"`));
}
```

DDL só é permitido depois da checagem do banco isolado descrita no plano; nome/UUID são validados acima, não vêm de request público. `workId` e `preparedRevision` são os retornos de apiCreateV1Draft e preparedRevisionFrom/apiPrepare do teste existente. A falha não pode chegar ao provider; comparar evidence antes/depois. A constraint sai no finally antes de limpeza da fixture. Não executar esse teste em banco compartilhado com outra execução de QA. Falha de setup/cleanup é falha do teste, nunca skip silencioso.

- [ ] **Step 3:** Executar serial-flows para os specs tocados; confirmar que o runner executou os casos novos. Depois typecheck, lint focado e screenshots nos três viewports. Plano de qualidade tarefa4/provider evidence pertence a D nesta divisão.
- [ ] **Step 4:** Reportar falhas para o dono original; repetir checks afetados após correção. Relatório separa unitários, Postgres real isolado, browser, qualidade humana ainda não medida e produção não publicada.
- [ ] **Step 5:** Commit dos testes/evidências/config estritamente necessária. Coordenador revisa antes de integrar. Não marcar toda auditoria encerrada com skips ou sem teste das superfícies afetadas.
