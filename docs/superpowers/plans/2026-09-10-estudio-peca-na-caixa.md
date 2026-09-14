# Estúdio — Peça na Caixa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar criação, revisão, comentários, versões, adaptação e acesso às camadas de uma Peça única no mesmo Trabalho e na caixa visual aprovada.

**Architecture:** `DashboardHomeActions` mantém a única instância de `useCreativeComposer`; uma superfície de resultado apresenta seus outputs e usa o settlement existente para revisões. Rascunho de revisão pertence ao output, com CAS próprio e entrada congelada no filho; a imagem base nunca é regravada. O editor de camadas mantém um único controlador, com seu conteúdo reutilizado dentro da caixa.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind 4, next-intl, TanStack Query, Zod, Drizzle/Postgres, Inngest, Vitest/Testing Library e Playwright já instalados.

**Execução atual:** [Quatro agentes e instruções por worktree](2026-09-10-estudio-fechamento-quatro-agentes.md); inclui o complemento de confiabilidade e créditos. Não distribuir este plano inteiro para quatro escritores.

**Spec:** [2026-09-10-estudio-peca-na-caixa-design.md](../specs/2026-09-10-estudio-peca-na-caixa-design.md). Ler também o [plano de qualidade](2026-09-10-peca-unica-qualidade.md); esse segundo plano é necessário para fechar o resultado de produto, mas não é dependência para testar esta interface.

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

---

## Preparação e mapa de arquivos

Base inspecionada: `ac38a30e`, branch `feat/f03-commercial-offer-catalog`. Antes de executar, comparar a base escolhida com esse commit e os planos de caixa de 08/09. Se a integração anterior estiver presente na base nova, aplicar só o delta abaixo. Não copiar cegamente código de um plano antigo. Preservar os arquivos untracked existentes, especialmente auditoria, findings e screenshots.

No início da execução, usar `superpowers:using-git-worktrees`, branch `codex/estudio-peca-na-caixa`, a partir da base acordada. Nenhum worktree ou commit é necessário para apenas escrever este plano. Ler `app/AGENTS.md` e documentação local de redirect antes da tarefa 6: `app/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`.

| Unidade | Arquivos | Responsabilidade |
| --- | --- | --- |
| Contrato de revisão | novo `app/src/server/creative-work/output-review.ts` + teste | Schemas, normalização e instrução de revisão; sem I/O |
| Persistência | `app/src/server/db/schema.ts`, nova migração `app/drizzle/0095_output_review.sql`, journal; novo `app/src/server/repositories/creative-work-output-review.ts`; teste no repositório existente | Salvar rascunho por output com CAS e workspace; duas colunas JSON |
| Entrada HTTP | novo `app/src/server/application/save-creative-work-output-review.ts` + teste; rotas existentes de detalhe/generate e testes | Validação, projeção e custo; nenhuma árvore nova de API |
| Reserva/dispatch | `revise-creative-work-output.ts`, `repositories/creative-work.ts`, `generation/settlement-adapters.ts`, testes existentes | Congelar contexto, formato filho, idempotência e chamada canônica |
| Estado cliente | novo `useOutputReview.ts` + teste; `use-creative-work.ts`, `useCreativeComposer.ts` e testes | Autosave serial, revisão/confirmar, erro incerto e retomada |
| Superfície | novos `StudioPieceWorkspace.tsx`/`.test.tsx` e `studio-piece-workspace.module.css`; `DashboardHomeActions.tsx`, `CreativeComposer.tsx` e testes | Caixa contida e estado ativo; sem outro composer |
| Imagem | novos `PieceReviewCanvas.tsx`/`.test.tsx`, `PieceFormatPopover.tsx`/`.test.tsx`, `piece-review-geometry.ts`/`.test.ts` | Imagem, miniaturas, comentários e popover ancorado |
| Ações/qualidade | `CreativeResultCard.tsx`/teste | Reutilizar escolha/download/compartilhamento e políticas; retirar chrome técnico da superfície principal |
| Camadas | `layer-editor/LayerEditorDialog.tsx`, novo `LayerEditorContent.tsx`, testes existentes | Extrair a sessão única para uso inline ou no diálogo existente |
| Navegação e idioma | `app/src/app/(dashboard)/creative-work/[id]/page.tsx`, `app/messages/{pt-BR,en}.json` | Retomada da Peça única na caixa e textos consistentes |
| Aceite | `app/tests/e2e/first-studio-piece.spec.ts`, `app/tests/e2e/create-post.spec.ts`, `app/tests/e2e/layer-editor.spec.ts`, novo relatório de evidência | Fluxo real com provider controlado e prova visual |

As tarefas abaixo descrevem o conteúdo técnico. Para a execução em quatro agentes solicitada posteriormente, seguir a [matriz de propriedade e integração](2026-09-10-estudio-fechamento-quatro-agentes.md): tarefas de um arquivo ficam com um único dono, mesmo quando vêm de planos diferentes. Não aplicar testes SQL contra DATABASE_URL não verificada. A migração 0095 é o próximo número nesta base; se ocupado, usar o próximo livre e ajustar journal e referências antes do commit.

## Task 1: Rascunho de revisão salvo por imagem

**Files:**
- Create: `app/src/server/creative-work/output-review.ts`, `output-review.test.ts`.
- Create: `app/src/server/repositories/creative-work-output-review.ts`.
- Test: `app/src/server/repositories/creative-work.test.ts` (reusar mocks transacionais existentes).
- Create: `app/src/server/application/save-creative-work-output-review.ts`, `save-creative-work-output-review.test.ts`.
- Modify: `app/src/server/db/schema.ts:2702`, `app/drizzle/meta/_journal.json`.
- Create: `app/drizzle/0095_output_review.sql`.
- Modify/Test: `app/src/app/api/creative-work/[id]/route.ts`, `route.test.ts`.
- Modify: `CONTEXT.md`; Create: `docs/decisions/2026-09-10-estudio-peca-na-caixa.md` com as decisões da última seção da spec e o contrato desta tarefa.

**Interfaces:**
- Consumes: `getCreativeWork(workspaceId, workItemId)`, `getWorkspaceAssetById(assetId, workspaceId)`, `creativeWorkFormatSchema`, `GENERATION_CREDIT_COSTS.creativeWorkOutput`.
- Produces: `OutputReviewInput`, `OutputReviewDraftV1`, `OutputRevisionContextV1`, `compileOutputReview(input): string`, `saveCreativeWorkOutputReview(input)` retornando sucesso com draft/custo ou código tipado.
- Novo comando PATCH: `{ action: "saveOutputReview", outputId, expectedReviewRevision, draft: OutputReviewInput }`.

- [ ] **Step 1: Escrever o teste do contrato, incluindo comentário sem texto livre.**

```ts
import { describe, expect, it } from "vitest";
import { outputReviewInputSchema, compileOutputReview } from "./output-review";

describe("output review", () => {
  it("compiles location and instruction without replacing user text", () => {
    const input = outputReviewInputSchema.parse({
      action: "format", targetFormat: "9:16", instruction: "Preserve a pessoa.",
      revisionAssetId: null,
      annotations: [{ id: "00000000-0000-4000-8000-000000000001", x: 0.25, y: 0.8, text: "Aumente o CTA" }],
    });
    const text = compileOutputReview(input);
    expect(text).toContain("Preserve a pessoa.");
    expect(text).toContain("x=25%, y=80%");
    expect(text).toContain("Aumente o CTA");
    expect(text).toContain("9:16");
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(outputReviewInputSchema.safeParse({ ...input, targetFormat: "16:9" }).success).toBe(false);
    expect(outputReviewInputSchema.safeParse({ ...input, annotations: [{ ...input.annotations[0], x: 1.1 }] }).success).toBe(false);
    expect(compileOutputReview({ ...input, instruction: "" })).toContain("Aumente o CTA");
  });
});
```

- [ ] **Step 2: Rodar o teste vermelho.**

Run from `app/`: `npm test -- src/server/creative-work/output-review.test.ts`.
Expected: FAIL por módulo ausente; não considerar “no tests” como aprovação.

- [ ] **Step 3: Implementar os schemas e o compilador puros.**

```ts
import { z } from "zod";
import { creativeWorkFormatSchema } from "./contracts";

const annotationSchema = z.object({
  id: z.string().uuid(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  text: z.string().trim().min(1).max(100),
}).strict();
const fields = z.object({
  action: z.enum(["refine", "variation", "format"]),
  targetFormat: creativeWorkFormatSchema,
  instruction: z.string().trim().max(800),
  revisionAssetId: z.string().uuid().nullable(),
  annotations: z.array(annotationSchema).max(8),
}).strict();
export type OutputReviewInput = z.infer<typeof fields>;
export function compileOutputReview(input: OutputReviewInput): string {
  const action = input.action === "format"
    ? `Adapte a mesma peça para ${input.targetFormat}. Preserve os fatos e a identidade visual.`
    : input.action === "variation"
      ? "Crie uma variação relacionada à peça base; preserve os fatos e a marca."
      : "Refine a peça base conforme as instruções abaixo.";
  return [action, input.instruction, ...input.annotations.map((note, i) =>
    `${i + 1}. Em x=${Math.round(note.x * 100)}%, y=${Math.round(note.y * 100)}%: ${note.text}`,
  )].filter(Boolean).join("\n");
}
export const outputReviewInputSchema = fields.superRefine((value, ctx) => {
  if (new Set(value.annotations.map(note => note.id)).size !== value.annotations.length)
    ctx.addIssue({ code: "custom", message: "Comentários duplicados." });
  if (compileOutputReview(value).length > 2000)
    ctx.addIssue({ code: "custom", message: "Reduza o pedido ou os comentários." });
});
export type OutputReviewDraftV1 = OutputReviewInput & {
  version: 1; revision: number; revisionKey: string;
};
export type OutputRevisionContextV1 = OutputReviewInput & {
  version: 1; reviewRevision: number; sourceOutputId: string; sourceOutputVersion: number;
};
```

Permitir draft vazio; bloquear Revisar quando action=refine, texto vazio e zero notas. JSONs carregados do banco passam por schemas com as mesmas regras, mais version=1, revision inteiro positivo, revisionKey UUID e sourceOutputVersion inteiro positivo. Não confiar em cast de dados persistidos.

- [ ] **Step 4: Acrescentar a migração aditiva e os tipos de coluna.**

```sql
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "review_draft" jsonb,
  ADD COLUMN "revision_context" jsonb;
```

```ts
reviewDraft: jsonb("review_draft").$type<import("../creative-work/output-review").OutputReviewDraftV1 | null>(),
revisionContext: jsonb("revision_context").$type<import("../creative-work/output-review").OutputRevisionContextV1 | null>(),
```

Registrar tag `0095_output_review`, idx 95, version 7, breakpoints true e timestamp posterior à última entrada. Não executar `db:push`; migração só no banco isolado autorizado. Não preencher linhas antigas nem modificar outputKey.

- [ ] **Step 5: Implementar o save com CAS próprio, sem mexer no updatedAt operacional do output.**

Contrato do novo repositório: exportar `saveOutputReviewDraft(input: SaveInput): Promise<SaveResult>`. O serviço `saveCreativeWorkOutputReview` usa essa função e acrescenta o custo canônico.

```ts
type SaveInput = {
  workspaceId: string; workItemId: string; outputId: string;
  expectedReviewRevision: number; draft: OutputReviewInput;
};
type SaveResult =
  | { ok: true; draft: OutputReviewDraftV1 }
  | { ok: false; code: "not_found" | "not_ready" | "review_conflict" | "invalid_reference" };
```

Em transação: SELECT pai filtrado por workspace+work+id com `FOR UPDATE`; retornar not_found se ausente, not_ready se sem arte completed. Validar referência opcional no mesmo workspace. Comparar `parent.reviewDraft?.revision ?? 0` com expectedReviewRevision. Se diferente, retornar review_conflict sem escrita. Para refine/variation, normalizar targetFormat para `parent.targetFormat`; para format, aceitar apenas enum validado. Gerar nova revisionKey a cada save aceito; gravar exclusivamente reviewDraft:

```ts
const next: OutputReviewDraftV1 = {
  ...input.draft,
  targetFormat: input.draft.action === "format" ? input.draft.targetFormat : parent.targetFormat,
  version: 1,
  revision: input.expectedReviewRevision + 1,
  revisionKey: crypto.randomUUID(),
};
await tx.update(creativeWorkOutputs).set({ reviewDraft: next }).where(and(
  eq(creativeWorkOutputs.workspaceId, input.workspaceId),
  eq(creativeWorkOutputs.workItemId, input.workItemId),
  eq(creativeWorkOutputs.id, input.outputId),
));
return { ok: true, draft: next };
```

Use imports de `db`, schema e operadores iguais ao repositório existente. Não alterar updatedAt: ele é usado por leases e mudanças de status; revision do draft é sua própria autoridade. O serviço valida `outputReviewInputSchema` e acrescenta `revisionCreditCost: GENERATION_CREDIT_COSTS.creativeWorkOutput`. A rota reaproveita requireWorkspaceAccess e handleApiError. HTTP: 400 inválido, 404 inexistente, 409 conflito/não pronta, 200 sucesso. Nunca logar o texto completo.

- [ ] **Step 6: Cobrir CAS/isolamento/retomada e rodar verde.**

Importar `saveOutputReviewDraft` no teste existente repositories/creative-work.test.ts e reutilizar `workOutput`, `mocks` e o beforeEach existente:

```ts
it("saves only a scoped review draft and rejects a stale writer", async () => {
  const before = workOutput({status:"completed",outputKey:"pieces/base.png",reviewDraft:null});
  const draft = {action:"refine" as const,targetFormat:"9:16" as const,
    instruction:"Aumente o título",annotations:[],revisionAssetId:null};
  mocks.state.selectResults.push([before]);
  const saved = await saveOutputReviewDraft({workspaceId:"ws-1",workItemId:"work-1",
    outputId:before.id,expectedReviewRevision:0,draft});
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error(saved.code);
  expect(saved.draft).toMatchObject({version:1,revision:1,targetFormat:"4:5"});
  expect(mocks.txSetMock).toHaveBeenCalledWith({reviewDraft:saved.draft});
  mocks.state.selectResults.push([{...before,reviewDraft:saved.draft}]);
  const stale = await saveOutputReviewDraft({workspaceId:"ws-1",workItemId:"work-1",
    outputId:before.id,expectedReviewRevision:0,draft});
  expect(stale).toEqual({ok:false,code:"review_conflict"});
  expect(mocks.txSetMock).toHaveBeenCalledTimes(1);
});
```

Adicionar caso SELECT vazio para outro workspace, exigindo not_found e zero updates. O teste de rota salva draft, faz GET com o repositório simulado e compara `outputs[0].reviewDraft` com o draft salvo; POST/dispatch mocks ficam com zero chamadas. O GET projeta reviewDraft e revisionContext explicitamente em cada output e revisionCreditCost no detalhe; validar JSON nulo antigo. Leitura não expõe storageKey/outputKey privado. A prova real de persistência/reload fica na tarefa 7.

Run: `npm test -- src/server/creative-work/output-review.test.ts src/server/repositories/creative-work.test.ts src/server/application/save-creative-work-output-review.test.ts 'src/app/api/creative-work/[id]/route.test.ts'`.
Expected: PASS; testes de serviço/rota sem rede. A prova transacional real é completada na tarefa 7, no banco isolado.

- [ ] **Step 7: Commit da unidade.**

```bash
git add CONTEXT.md docs/decisions/2026-09-10-estudio-peca-na-caixa.md app/src/server/creative-work/output-review.ts app/src/server/creative-work/output-review.test.ts app/src/server/repositories/creative-work-output-review.ts app/src/server/repositories/creative-work.test.ts app/src/server/application/save-creative-work-output-review.ts app/src/server/application/save-creative-work-output-review.test.ts app/src/server/db/schema.ts app/drizzle/0095_output_review.sql app/drizzle/meta/_journal.json 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: persist output review drafts with revision checks"
```

## Task 2: Confirmar revisão e adaptar formato no mesmo Trabalho

**Files:**
- Modify/Test: `app/src/server/application/revise-creative-work-output.ts`, respectivo `.test.ts`.
- Modify/Test: `app/src/server/repositories/creative-work.ts`, respectivo `.test.ts`.
- Modify/Test: `app/src/server/generation/settlement-adapters.ts`, respectivo `.test.ts`.
- Modify/Test: `app/src/app/api/creative-work/[id]/generate/route.ts`, `route.test.ts`.
- Modify/Test: `app/src/server/jobs/creative-work.ts`, respectivo `.test.ts`.
- Modify/Test: `app/src/server/creative-work/protocol.ts`, respectivo `.test.ts`.

**Interfaces:**
- Consumes: `OutputReviewDraftV1`, `OutputRevisionContextV1`, `compileOutputReview` da tarefa 1.
- Produces: ação `reviewed_revision` com `{outputId, reviewRevision, revisionKey, expectedCredits}`; retorna `{output}` status 202, sem novo endpoint.
- Estender `reviseCreativeWorkOutput` por união tipada: comando antigo existente OU `{workspaceId, workItemId, userId, outputId, revisionKey, reviewRevision, expectedCredits}`. Ambos convergem em `creativeWorkRevisionSettlementAdapter`.
- Estender `createCreativeWorkRevision` com argumento final opcional `{ context: OutputRevisionContextV1; expectedReviewRevision: number }`; demais callers mantêm comportamento.

- [ ] **Step 1: Adicionar o teste vermelho ao serviço existente.**

Dentro do describe de `revise-creative-work-output.test.ts`, reutilizar `getWork`, `settle`, `buildAdapter`, `parent`, `work`, `REVISION_KEY`:

```ts
it("freezes a reviewed format change before canonical settlement", async () => {
  const draft = { version: 1, revision: 2, revisionKey: REVISION_KEY,
    action: "format", targetFormat: "9:16", instruction: "Preserve a pessoa.",
    annotations: [], revisionAssetId: null };
  getWork.mockResolvedValue({ work, outputs: [{ ...parent, targetFormat: "4:5", versionNumber: 1, reviewDraft: draft }], sources: [] });
  const result = await reviseCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1",
    outputId: parent.id, revisionKey: REVISION_KEY, reviewRevision: 2,
    expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput });
  expect(result.ok).toBe(true);
  expect(buildAdapter).toHaveBeenCalledWith(expect.objectContaining({
    parentOutputId: parent.id,
    context: expect.objectContaining({ sourceOutputId: parent.id, targetFormat: "9:16", action: "format" }),
  }));
  expect(settle).toHaveBeenCalledTimes(1);
});
```

Importar GENERATION_CREDIT_COSTS da autoridade existente. Acrescentar caso reviewRevision=1: result.error.code=`stale_review`, settle não chamado; preço diferente: `quote_changed`, sem settle.

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/server/application/revise-creative-work-output.test.ts`.
Expected: FAIL no contrato/caminho novo.

- [ ] **Step 3: Validar e congelar o comando antes de reservar.**

Na rota, acrescentar membro da discriminatedUnion, todos os campos required e `.strict()`:

```ts
z.object({
  action: z.literal("reviewed_revision"), outputId: z.string().uuid(),
  reviewRevision: z.number().int().positive(), revisionKey: z.string().uuid(),
  expectedCredits: z.number().int().nonnegative(),
}).strict()
```

No serviço: localizar operação já existente por work+revisionKey **antes** de rejeitar rascunho que mudou após sucesso; comparar sourceOutputId e reviewRevision imutáveis. Replay nunca relê texto novo para reinterpretar comando antigo. Para operação inédita, validar draft, sua revisionKey, reviewRevision e custo; montar:

```ts
const context: OutputRevisionContextV1 = {
  version: 1, sourceOutputId: parent.id, sourceOutputVersion: parent.versionNumber,
  reviewRevision: draft.revision, action: draft.action, targetFormat: draft.targetFormat,
  instruction: draft.instruction, annotations: draft.annotations,
  revisionAssetId: draft.revisionAssetId,
};
const instruction = compileOutputReview(draft);
```

A tarefa não aceita custo ou caminho de imagem do cliente como autoridade. `quote_changed` e `stale_review` dão 409; 402 e 502 mantêm política atual. Não converter erro incerto em sucesso nem reenviar com uma chave nova automaticamente.

- [ ] **Step 4: Atualizar reserva canônica, igualdade do comando e escopo de versão.**

`createCreativeWorkRevision` hoje herda parent.targetFormat em seis pontos. Resolver `targetFormat = options?.context.targetFormat ?? parent.targetFormat`; usar na comparação de replay, escopo do advisory lock, query de maxVersion e insert. `versionNumber` continua ordinal no escopo direção/formato, não global. Persistir revisionContext e nunca modificar parent.outputKey.

Dentro da transação de reserva, antes de criar output: row lock no pai, reler reviewDraft e comparar revision/revisionKey com o comando congelado. Uma alteração entre validação do serviço e reserva deve retornar conflito sem crédito/dispatch. A busca da operação existente antecede essa checagem para permitir replay após edição posterior. Igualdade inclui o contexto completo via `canonicalJsonStringify`, não só instruction/asset.

```ts
const targetFormat = options?.context.targetFormat ?? parent.targetFormat;
const matchesCommand = (row: CreativeWorkOutput) =>
  row.parentOutputId === parentOutputId && row.targetFormat === targetFormat
  && row.revisionInstruction === instruction && row.revisionAssetId === revisionAssetId
  && canonicalJsonStringify(row.revisionContext ?? null) === canonicalJsonStringify(options?.context ?? null);
```

Reutilizar a lógica existente de charge/join/compensate no adapter. Passar context e expectedReviewRevision até reserve; `InvalidCreativeWorkRevisionError` conserva 400 para comando incompatível, conflito de revisão ganha código próprio 409. Não usar dois settlements.

- [ ] **Step 5: Resolver o modo pelo contexto e cobrir referência/base.**

Estender o input de `resolveCreativeWorkProtocol` com `revisionAction?: "refine" | "variation" | "format"`. No ramo revision:

```ts
mode: input.revisionAction === "format" ? "format_adaptation" : "creative_revision"
```

Job passa `output.revisionContext?.action`; mantém `output.targetFormat` para dimensões e pai como primeira referência. A ordem que chega ao modelo deve coincidir com a do QA. Comentários entram na revisionInstruction compilada; não rasterizar pinos na base nem criar outro upload. A referência extra permanece opcional depois da base.

No teste de protocolo:

```ts
expect(resolveCreativeWorkProtocol({ toolKind: "single", format: "9:16", targetFormats: [], revision: true, revisionAction: "format" }))
  .toMatchObject({ mode: "format_adaptation", execution: "direct" });
```

No teste de job, estender o cenário existente `uses the completed parent image as the primary revision reference without overwriting it` com target 9:16 e revisionContext format; verificar mode, dimensions e `objectStorage.put` nunca direcionado à chave do pai. No teste de repositório incluir chave repetida mesmo payload→mesmo id, chave repetida alvo diferente→conflito e duas reservas simultâneas→uma operação.

- [ ] **Step 6: Rodar verde e commitar.**

Run: `npm test -- src/server/application/revise-creative-work-output.test.ts src/server/repositories/creative-work.test.ts src/server/generation/settlement-adapters.test.ts src/server/creative-work/protocol.test.ts src/server/jobs/creative-work.test.ts 'src/app/api/creative-work/[id]/generate/route.test.ts'`.
Expected: PASS inclusive contratos de revisão antiga.

```bash
git add app/src/server/application/revise-creative-work-output.ts app/src/server/application/revise-creative-work-output.test.ts app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts app/src/server/generation/settlement-adapters.ts app/src/server/generation/settlement-adapters.test.ts app/src/server/creative-work/protocol.ts app/src/server/creative-work/protocol.test.ts app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts 'app/src/app/api/creative-work/[id]/generate/route.ts' 'app/src/app/api/creative-work/[id]/generate/route.test.ts'
git commit -m "feat: generate reviewed revisions in the same creative work"
```

## Task 3: Controlador de revisão com confirmação, retomada e envio incerto

**Files:**
- Create/Test: `app/src/components/creative-work/useOutputReview.ts`, `useOutputReview.test.tsx`.
- Modify/Test: `app/src/lib/hooks/use-creative-work.ts`, `use-creative-work.test.tsx`.
- Modify/Test: `app/src/components/creative-work/useCreativeComposer.ts`, `useCreativeComposer.test.tsx`.

**Interfaces:**
- Consumes: draft/context/custo da tarefa 1; POST reviewed_revision da tarefa 2.
- Produces: `useSaveOutputReview()`, `useGenerateReviewedRevision()` em use-creative-work; `useOutputReview({workItemId, output, revisionCreditCost})`.
- Hook devolve `{draft, phase, error, pendingOutputId, referencePending, update, attachReference, flush, review, edit, confirm, reloadDraft}`. `attachReference(file:File):Promise<void>` e `referencePending:boolean` controlam o anexo opcional. Phase: `editing|saving|reviewing|submitting|reconciling`; `update(patch: Partial<OutputReviewInput>): void`; `flush(): Promise<OutputReviewDraftV1|null>`; `review(): Promise<void>`; `confirm(): Promise<void>`; `edit(): void`; `reloadDraft(): void`.

- [ ] **Step 1: Escrever teste comportamental de duas etapas.**

Usar renderHook, act, waitFor e mocks de `useSaveOutputReview`/`useGenerateReviewedRevision`; output fixture tem id/workItemId/targetFormat/hasOutput/reviewDraft. Save retorna `{draft:{...input,version:1,revision:1,revisionKey:UUID},revisionCreditCost:10}` no fixture; o valor 10 é só fixture.

```ts
await act(async () => result.current.update({ instruction: "Preserve o logo." }));
await act(async () => result.current.review());
expect(result.current.phase).toBe("reviewing");
expect(generate).not.toHaveBeenCalled();
await act(async () => result.current.confirm());
expect(generate).toHaveBeenCalledTimes(1);
expect(generate).toHaveBeenCalledWith(expect.objectContaining({
  outputId: "output-1", reviewRevision: 1, revisionKey: UUID, expectedCredits: 10,
}));
```

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/components/creative-work/useOutputReview.test.tsx`.
Expected: FAIL módulo ausente.

- [ ] **Step 3: Implementar mutações e projeção pública no hook existente.**

```ts
// mutationFn de useSaveOutputReview
({ workItemId, ...body }: { workItemId: string; outputId: string;
  expectedReviewRevision: number; draft: OutputReviewInput }) =>
  patchJson<{ draft: OutputReviewDraftV1; revisionCreditCost: number }>(
    `/api/creative-work/${workItemId}`, { action: "saveOutputReview", ...body });

// mutationFn de useGenerateReviewedRevision
({ workItemId, ...body }: { workItemId: string; outputId: string;
  reviewRevision: number; revisionKey: string; expectedCredits: number }) =>
  postJson<{ output: CreativeWorkOutput }>(
    `/api/creative-work/${workItemId}/generate`, { action: "reviewed_revision", ...body });
```

Invalidar `creativeWorkKey(workItemId)` no sucesso/erro da geração e `invalidateCanonicalWorks` no sucesso; save atualiza/invalida só o trabalho. Adicionar reviewDraft/revisionContext em CreativeWorkOutput e revisionCreditCost em CreativeWorkDetail + mapCreativeWorkDetail. Não importar módulo server-only no cliente; output-review.ts é puro.

- [ ] **Step 4: Implementar o estado e serialização do autosave.**

Inicializar de output.reviewDraft ou base vazia com formato da imagem. `update` mantém texto e campos independentes, marca dirty e invalida a revisão apresentada. Debounce de 500 ms, um save em voo por output; guardar a revisão retornada antes de enviar edição posterior. `flush` aguarda save em voo e a edição mais recente. Não hidratar sobre dirty/submitting/reconciling em refetch. Mudança de output executa flush antes de trocar; 409 impede a troca silenciosa e deixa texto local visível.

```ts
async function review() {
  const saved = await flush();
  if (!saved || !canReview(saved)) return;
  setReviewed({ draft: saved, credits: revisionCreditCost });
  setPhase("reviewing");
}
function canReview(draft: OutputReviewInput) {
  return draft.action !== "refine" || Boolean(draft.instruction.trim()) || draft.annotations.length > 0;
}
```

`reviewed` é `{draft:OutputReviewDraftV1,credits:number}|null`. `confirm` tem trava síncrona em ref para duplo clique, envia apenas reviewed; sucesso guarda pendingOutputId e muda para editing sem apagar o draft. Rede incerta conserva reviewed/revisionKey e refaz GET; se filha com revisionContext.reviewRevision e parentOutputId correspondentes existir, segue a filha. Reenviar usa a mesma revisionKey, nunca UUID novo. 402 mantém plano para corrigir saldo; 409 volta à edição com mensagem; falha de dispatch é mostrada e requer retry humano. Retentativa deliberada após falha terminal salva novo draft/chave e mostra custo novamente.

Anexo adicional reutiliza `uploadChatAttachment` de `@/lib/assistant/chat-attachments`: `attachReference` aguarda upload, chama `update({revisionAssetId:uploaded.assetId})` e flush. Enquanto o upload estiver pendente, desabilitar Revisar e troca de output; erro conserva texto/notas e permite reenviar o arquivo. Remover anexo salva revisionAssetId=null, sem deletar asset do workspace. Testar upload bem-sucedido, falha sem perda do pedido e confirmação bloqueada durante upload; nenhuma chamada de imagem ocorre. A referência base continua automática no servidor.

A nova caixa só muda seu estado com resultado confirmado pelo novo hook. Preservar useComposerOutputActions e as assinaturas antigas para os outros protocolos; a nova caixa não usa seu handler reviseOutput. Em useCreativeComposer expor `revisionCreditCost: detail?.revisionCreditCost ?? null`; revisão fica indisponível até o custo canônico carregar.

- [ ] **Step 5: Cobrir refresh e incerteza; rodar verde.**

Adicionar cenários: polling durante digitação não altera draft; save1 atrasado e edit2 envia edit2 com revision devolvida; 409 conserva texto; confirmação dupla chama generate uma vez; resposta perdida→GET encontra filha→não gera novamente; resposta perdida e retry→mesma chave; reload recupera draft salvo e outputs queued.

```ts
expect(generate.mock.calls[1][0].revisionKey).toBe(generate.mock.calls[0][0].revisionKey);
expect(result.current.draft.instruction).toBe("Preserve o logo.");
expect(result.current.error).toBeTruthy(); // CAS conflitante não limpa a edição
```

Run: `npm test -- src/components/creative-work/useOutputReview.test.tsx src/lib/hooks/use-creative-work.test.tsx src/components/creative-work/useCreativeComposer.test.tsx`.
Expected: PASS, sem timers pendentes.

- [ ] **Step 6: Commit.**

```bash
git add app/src/components/creative-work/useOutputReview.ts app/src/components/creative-work/useOutputReview.test.tsx app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.tsx app/src/components/creative-work/useCreativeComposer.ts app/src/components/creative-work/useCreativeComposer.test.tsx
git commit -m "feat: confirm and resume output reviews without duplicate submissions"
```

## Task 4: Caixa contida com imagem e miniaturas como superfície do resultado

**Files:**
- Create/Test: `app/src/components/creative-work/StudioPieceWorkspace.tsx`, `StudioPieceWorkspace.test.tsx`, `studio-piece-workspace.module.css`.
- Modify/Test: `app/src/components/dashboard/DashboardHomeActions.tsx`, `DashboardHomeActions.test.tsx`.
- Modify: `app/src/components/dashboard/studio-stage/BrandStageHome.tsx`, `TalkBox.tsx`; testar sua integração pelo DashboardHomeActions.test.tsx real.
- Modify/Test: `app/src/components/creative-work/composer-outputs.ts`, `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`, `CreativeProposalGrid.test.tsx` (mover os helpers de linhagem sem mudar o comportamento antigo).
- Modify/Test: `app/src/components/creative-work/CreativeComposer.tsx`, `CreativeComposer.test.tsx`, `CreativeResultCard.tsx`, `CreativeResultCard.test.tsx`.
- Modify: `app/messages/pt-BR.json`, `app/messages/en.json`.

**Interfaces:**
- Consumes: `CreativeComposerViewModel` existente e `useOutputReview` da tarefa 3.
- Produces: `StudioPieceWorkspace({composer}: {composer:CreativeComposerViewModel})` com trabalho/outputs reais, sem instanciar useCreativeComposer.
- Acrescentar slot opcional `workspace?: ReactNode` em BrandStageHome; quando definido, ocupa o espaço central contido em vez de children+dock separados. Um único dono da ShineBorder, nunca duas bordas encaixadas.
- `CreativeResultCard` ganha `presentation?: "card"|"workspace"`; mesmas regras de escolha, download e share, mas chrome/técnicos em details e edição inline antiga ausente no modo workspace.

- [ ] **Step 1: Testar que resultado e fila continuam dentro da caixa.**

No teste de Dashboard, usar composer mock existente com intent=single e output pronto. Renderizar BrandStageHome/TalkBox reais, não mocks que escondem o layout.

```tsx
const box = screen.getByTestId("studio-piece-workspace");
expect(within(box).getByRole("img", { name: /peça/i })).toBeVisible();
expect(screen.getAllByRole("textbox", { name: /o que você quer mudar/i })).toHaveLength(1);
expect(within(box).queryByText(/^Versões$/)).not.toBeInTheDocument();
expect(useComposerMock).toHaveBeenCalledTimes(1);
```

Verificar uma instância montada, sem assumir que React nunca rerenderiza: a contagem acima é do primeiro render no harness sem StrictMode. Em outro caso trocar output.status queued→processing mantendo a mensagem visível em ambos, e erro via composer.error sem sumir com imagem anterior.

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/components/creative-work/StudioPieceWorkspace.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx`.
Expected: FAIL na superfície inexistente.

- [ ] **Step 3: Montar a superfície com o controlador existente.**

Em Dashboard, tratar `composer.intent === "single"` com um container que compartilha o mesmo hook para entrada/plano/resultado; controles iniciais e CreativePlanReview ficam dentro dele. Quando há outputs, renderizar StudioPieceWorkspace. O restante dos protocolos mantém seu ramo atual. Separar o chrome da TalkBox por `bordered?: boolean` (default true), para entrada dentro da caixa não aninhar ShineBorder.

```tsx
const pieceWorkspace = composer.intent === "single" ? (
  <section data-testid="studio-piece-container" className={styles.workspace}>
    {composer.outputs.length > 0
      ? <StudioPieceWorkspace composer={composer} />
      : <>{showPlan ? planReview : creationControls}{talkBoxWithoutBorder}</>}
  </section>
) : undefined;
```

`planReview`, `creationControls` e `talkBoxWithoutBorder` são extrações locais das expressões `CreativePlanReview`, `stageBody` sem resultados e TalkBox já existentes em Dashboard, não novos controladores. Extrair JSX nomeado sem copiar regra de geração. No caminho single, `onGenerate` chama preparePlan; confirmar chama confirmGeneration, inclusive no rollout control. Alterar `showPlan` para `(composer.intent === "single" || rolloutVariant === "progressive") && composer.stage === "plan" && Boolean(composer.preparedPlan) && !editingPreparedPlan && !isCarouselWorkflow`. Exibir `composer.quote.credits` junto da confirmação inicial e esconder a TalkBox editável quando o plano estiver congelado; Editar restaura o mesmo pedido. Remover campo de request duplicado de CreativeComposer quando usado como controles via prop `controlsOnly?: boolean`; os callers externos conservam default false.

Lista da caixa usa **todos** os outputs ordenados por createdAt/id. Extrair as funções puras de linhagem do CreativeProposalGrid para `composer-outputs.ts` e importar nas duas superfícies; exportar e testar `outputLineage`/`lineageRootId` sem mudar a regra antiga. A imagem selecionada é identificada por id, não índice ou maior versionNumber entre formatos. O rótulo humano usa a ordem visual da linhagem, começando em 1, para que uma adaptação possa aparecer como Versão 2 mesmo quando versionNumber=1 no formato novo. Nova filha só vira seleção automática quando a própria confirmação retorna seu id; polling não deve roubar a seleção humana de uma ancestral.

```css
.workspace { width:100%; max-width:1250px; margin-inline:auto; border-radius:20px; }
.inner { display:flex; flex-direction:column; min-height:580px; height:min(690px,calc(100dvh - 136px)); overflow:hidden; }
.visual { flex:1; min-height:200px; display:flex; justify-content:center; overflow:hidden; }
.artGroup { display:flex; align-items:center; gap:10px; max-width:100%; min-width:0; }
.versions { display:flex; flex-direction:column; gap:2px; max-height:100%; overflow-y:auto; }
.thumb { width:44px; height:44px; display:grid; place-items:center; flex:none; }
.thumb img { width:34px; height:34px; border-radius:5px; object-fit:cover; }
.art { max-height:100%; max-width:100%; object-fit:contain; }
@media(max-width:700px) { .inner { height:auto; min-height:0; } .visual { height:48dvh; min-height:310px; flex:none; } }
@media(max-height:650px) and (min-width:701px) { .inner { height:auto; min-height:580px; } }
```

A borda usa ShineBorder já instalado e os tokens existentes, sem substituir a sidebar. Group de imagem encolhe preservando aspecto e deixa dock ao lado da arte, não na borda distante da caixa. Header/footer flex:none; detalhes longos têm limite de altura e scroll próprio. Enquanto a filha selecionada estiver queued/processing/failed sem imagem, manter sua base visível e o status da filha explícito.

Comparar só aparece com parentOutputId acessível: toggle local mostra pai e selecionada lado a lado na mesma área, cada imagem em contain e com seu formato real; no mobile empilhar. Fechar restaura a selecionada sem save/geração. Ampliação usa requestFullscreen/exitFullscreen no container apenas por clique, trata rejeição e respeita Escape; não muda o layout padrão. Cobrir comparação e saída no teste de workspace e no E2E visual.

- [ ] **Step 4: Reutilizar políticas e tornar erros legíveis.**

Modo workspace do CreativeResultCard mantém `getCreativeWorkSelectionPolicy`, confirmação inconclusiva, share e download. Agrupar hashes/evidence paths em `<details><summary>Detalhes técnicos</summary>…</details>`; manter alertas objetivos visíveis, sem badge “Comprovado” geral. Retirar apenas o form de refino antigo no modo workspace para haver um único pedido. Retry técnico da caixa abre confirmação com custo antes de chamar composer.retryOutput; usar trava em ref até a resposta para duplo clique. Erro de revisão oferece voltar à base e revisar uma tentativa nova, sem enviar ao abrir o aviso. Botão Escolher chama o mesmo onApprove. Escolher thumbnail usa `aria-pressed`, nome “Versão 2 · 9:16”; não chama onApprove.

Atualizar strings no namespace `dashboard.home.composer.results`: `reviewInstruction="O que você quer mudar?"`, `reviewAction="Revisar"`, `confirmRevision="Confirmar e gerar"`, `sendingRevision="Enviando"`, `reconcilingRevision="Confirmando envio"`, `reviewConflict="Este rascunho mudou em outra aba. Seu texto foi preservado."`, `choosePiece="Escolher"`; adicionar equivalentes em inglês no mesmo commit.

- [ ] **Step 5: Rodar verde e commitar.**

Run: `npm test -- src/components/creative-work/StudioPieceWorkspace.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.test.tsx`.
Expected: PASS; nenhuma regressão em Variações/Carrossel nos casos existentes. Preview visual local antes do commit: sidebar intacta, arte maior que miniaturas, formulário único.

```bash
git add app/src/components/creative-work/StudioPieceWorkspace.tsx app/src/components/creative-work/StudioPieceWorkspace.test.tsx app/src/components/creative-work/studio-piece-workspace.module.css app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx app/src/components/dashboard/studio-stage/BrandStageHome.tsx app/src/components/dashboard/studio-stage/TalkBox.tsx app/src/components/creative-work/composer-outputs.ts app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/components/creative-work/CreativeResultCard.tsx app/src/components/creative-work/CreativeResultCard.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: review studio pieces inside the approved contained workspace"
```

## Task 5: Pinos na imagem e proporções junto ao botão

**Files:**
- Create/Test: `app/src/components/creative-work/piece-review-geometry.ts`, `piece-review-geometry.test.ts`, `PieceReviewCanvas.tsx`, `PieceReviewCanvas.test.tsx`, `PieceFormatPopover.tsx`, `PieceFormatPopover.test.tsx`.
- Modify/Test: `StudioPieceWorkspace.tsx`, `StudioPieceWorkspace.test.tsx`, `studio-piece-workspace.module.css`.
- Modify: `app/messages/pt-BR.json`, `app/messages/en.json`.

**Interfaces:**
- Consumes: `draft.annotations`, `update`, `flush` da tarefa 3, selected output id da tarefa 4.
- Produces: `containedImageBounds({left,top,width,height}, naturalWidth, naturalHeight)` e `imagePoint(bounds, clientX, clientY): {x:number,y:number}|null`.
- `PieceReviewCanvas({src,alt,annotations,onChange})`, `onChange(annotations:OutputReviewInput["annotations"]):void`.
- `PieceFormatPopover({value,onChoose,onCancel})`, value `CreativeWorkFormat|null`, onChoose(format), onCancel().

- [ ] **Step 1: Testar letterboxing e preservação de texto.**

```ts
it("ignores margins and uses the rendered image for coordinates", () => {
  const box = containedImageBounds({ left:0, top:0, width:600, height:400 }, 400, 500);
  expect(box).toEqual({ left:140, top:0, width:320, height:400 });
  expect(imagePoint(box, 100, 200)).toBeNull();
  expect(imagePoint(box, 300, 200)).toEqual({ x:0.5, y:0.5 });
});
```

No teste de workspace, digitar “Preserve a pessoa”, escolher 9:16, cancelar e verificar texto idêntico; abertura e Escape não chamam save/generate. Native popover é verificado em Playwright, não confiar na emulação incompleta de showPopover do jsdom.

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/components/creative-work/piece-review-geometry.test.ts src/components/creative-work/PieceReviewCanvas.test.tsx src/components/creative-work/PieceFormatPopover.test.tsx`.
Expected: FAIL módulos ausentes.

- [ ] **Step 3: Implementar geometria e pinos sem dependência.**

```ts
type Bounds = { left:number; top:number; width:number; height:number };
export function containedImageBounds(box: Bounds, width:number, height:number): Bounds | null {
  if (![box.left, box.top, box.width, box.height, width, height].every(Number.isFinite)
      || width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / width, box.height / height);
  return { left:box.left+(box.width-width*scale)/2, top:box.top+(box.height-height*scale)/2,
    width:width*scale, height:height*scale };
}
export function imagePoint(box:Bounds|null, x:number, y:number) {
  if (!box || !Number.isFinite(x) || !Number.isFinite(y) || x<box.left || y<box.top
      || x>box.left+box.width || y>box.top+box.height) return null;
  return { x:(x-box.left)/box.width, y:(y-box.top)/box.height };
}
```

Canvas usa img onLoad e ResizeObserver para reposicionar overlay, desconecta no cleanup. Click só cria rascunho se modo Comentar ativo e imagePoint não nulo. Pinos são `<button>` absolutos com left/top percentuais dentro dos bounds; salvar substitui por id ou adiciona com crypto.randomUUID. Escape descarta apenas comentário ainda não salvo, não notas salvas; restore focus no botão Comentar. Botão “Adicionar comentário” por teclado cria ponto 0.5/0.5, campos X/Y type=number min0 max100 step1. Texto é React text/textarea, nunca HTML interpolado. Mostrar indicador Salvando/Salvo/Erro usando o hook; não prometer salvamento antes de flush completar.

- [ ] **Step 4: Implementar popover nativo com foco e posição.**

```tsx
<button type="button" popoverTarget={id} aria-haspopup="dialog">Adaptar formato</button>
<div id={id} popover="auto" role="dialog" aria-label="Proporções disponíveis" ref={panelRef}>
  {(["1:1", "4:5", "9:16"] as const).map(format => (
    <button key={format} type="button" aria-pressed={value === format}
      onClick={() => { onChoose(format); panelRef.current?.hidePopover(); }}>
      <span aria-hidden="true" style={{ display:"block", height:30, aspectRatio:format.replace(":", "/"), border:"1px solid currentColor" }} />
      {format}
    </button>
  ))}
</div>
```

Usar useId para id único. `toggle` aberto calcula position fixed top=trigger.top-panel.height-8, left clamped entre10 e viewportWidth-panelWidth-10; se não cabe acima, usar abaixo e limitar maxHeight ao viewport. Top layer evita clipping do container. Escutar resize/scroll só enquanto aberto, remover listeners no cleanup, fechar em seleção e devolver foco ao trigger. Textos via next-intl no código final. No onChoose: `update({action:"format",targetFormat:format})`, sem setInstruction. Cancelar: update action refine e formato da base, sem alterar notas/texto. “Criar variação”: update action variation e formato da base, não selectIntent.

- [ ] **Step 5: Testar e commitar.**

Run: `npm test -- src/components/creative-work/piece-review-geometry.test.ts src/components/creative-work/PieceReviewCanvas.test.tsx src/components/creative-work/PieceFormatPopover.test.tsx src/components/creative-work/StudioPieceWorkspace.test.tsx`.
Expected: PASS; testar também naturalWidth=0, non-finite, bordas e resize. No navegador testar menu junto ao botão, Escape, notas após trocar miniaturas e 390×844.

```bash
git add app/src/components/creative-work/piece-review-geometry.ts app/src/components/creative-work/piece-review-geometry.test.ts app/src/components/creative-work/PieceReviewCanvas.tsx app/src/components/creative-work/PieceReviewCanvas.test.tsx app/src/components/creative-work/PieceFormatPopover.tsx app/src/components/creative-work/PieceFormatPopover.test.tsx app/src/components/creative-work/StudioPieceWorkspace.tsx app/src/components/creative-work/StudioPieceWorkspace.test.tsx app/src/components/creative-work/studio-piece-workspace.module.css app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: annotate pieces and choose formats beside the artwork"
```

## Task 6: Camadas na caixa e links que retomam a mesma peça

**Files:**
- Create: `app/src/components/creative-work/layer-editor/LayerEditorContent.tsx`.
- Modify/Test: `layer-editor/LayerEditorDialog.tsx`, `LayerEditorDialog.test.tsx`, `StudioPieceWorkspace.tsx`, `StudioPieceWorkspace.test.tsx`.
- Modify/Test: `app/src/app/(dashboard)/creative-work/[id]/page.tsx`, novo `page.test.tsx`.
- Modify: `app/messages/pt-BR.json`, `app/messages/en.json`.

**Interfaces:**
- Consumes: existing `layerizeOutput(outputId,retry?,operationId?)`, `LayerScanner`, `LayerEditorSession` hoje interna ao diálogo, `refreshOutputs`, `useIsMobile`.
- Produces: `LayerEditorContent` com as props atuais da sessão (`open,workItemId,outputId,mode,onOpenChange,onPublished`) mais `presentation?: "dialog"|"inline"`; extração move a sessão, não cria outra.
- Rota single redireciona para `/?workId=<id>&compose=1`; outras intenções continuam em CreativeWorkResumeSurface até seu recorte de convergência.

- [ ] **Step 1: Testar abertura sem cobrança.**

No teste de workspace com canLayerize=true e quota positiva:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
expect(layerizeOutput).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole("button", { name: "Gerar camadas" }));
await waitFor(() => expect(layerizeOutput).toHaveBeenCalledTimes(1));
expect(layerizeOutput.mock.calls[0][0]).toBe("output-1");
```

Também abrir/fechar/reabrir enquanto processing: sem nova chamada; falha incerta mantém operationId. Sem quota, Gerar camadas fica disabled e mostra motivo.

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/components/creative-work/StudioPieceWorkspace.test.tsx src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx`.
Expected: FAIL da integração ausente; guardar testes existentes de lease e scanner.

- [ ] **Step 3: Extrair a sessão e montar conteúdo inline.**

Mover função LayerEditorSession, estados e handlers para LayerEditorContent.tsx, exportar props. Diálogo importa e usa esse conteúdo; retirar definição antiga no mesmo commit. Inline adapta apenas classes de tamanho e toolbar, mantendo `useLayerEditor`, LayerCanvas, LayerPanel e LayerRegenerationPanel. Uma única imagem/canvas ativo: ao entrar em camadas prontas, o conteúdo do editor substitui a área visual de inspeção; ao fechar, volta à imagem sem descartar draft.

```tsx
{layersOpen && readyLayers ? (
  <LayerEditorContent open workItemId={selected.workItemId} outputId={selected.id}
    mode={isMobile ? "inspect" : "edit"} presentation="inline"
    onOpenChange={setLayersOpen} onPublished={composer.refreshOutputs} />
) : layersOpen ? (
  <LayerScanner sourceImageUrl={downloadUrl} layerization={selected.layerization ?? null}
    layerizeRemaining={composer.layerEditorAccess?.layerize?.remaining}
    onRetryLayerize={retryLayerization} />
) : imageCanvas}
```

`readyLayers` é layerization completed ou layerEditor presente. `downloadUrl` é rota autenticada do output. `retryLayerization` usa callback explícito com retry=true após erro terminal; no incerto, concilia via GET e conserva operationId. Remover qualquer efeito de auto-layerize **do caminho novo**; efeito do CreativeProposalGrid antigo não deve montar junto com a caixa. O primeiro botão Gerar camadas confirma operação; abrir o painel usa Camadas. Ao concluir, toolbar muda para Camadas. Entitlement/cota/configuração continuam autorizados no servidor.

- [ ] **Step 4: Integrar retomada sem redirect de protocolos não cobertos.**

```tsx
import { redirect, notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
export default async function CreativeWorkPage({ params }: { params: Promise<{id:string}> }) {
  const [{workspace}, {id}] = await Promise.all([requireWorkspaceAccess(), params]);
  const aggregate = await getCreativeWork(workspace.id, id);
  if (!aggregate) notFound();
  if (aggregate.work.toolKind === "single") redirect(`/?workId=${encodeURIComponent(id)}&compose=1`);
  return <CreativeWorkResumeSurface workId={id} />;
}
```

Testar single→redirect, outro workspace→notFound, carousel/variations→surface existente. Links antigos continuam válidos por esse adapter. Nenhum redirect em `/share` ou nas APIs. Não criar outro destino principal. Na caixa, deixar seleção de output na URL opcional `outputId` só se for necessário para deep link; para este recorte, retomar a última peça concluída e seus rascunhos já atende, sem adicionar query nova.

- [ ] **Step 5: Rodar verde e commitar.**

Run: `npm test -- src/components/creative-work/StudioPieceWorkspace.test.tsx src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx src/components/creative-work/layer-editor/LayerCanvas.test.tsx src/components/creative-work/layer-editor/LayerPanel.test.tsx 'src/app/(dashboard)/creative-work/[id]/page.test.tsx'`.
Expected: PASS, edição e inspeção conservam locks/undo/redo/publicação.

```bash
git add app/src/components/creative-work/layer-editor/LayerEditorContent.tsx app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx app/src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx app/src/components/creative-work/StudioPieceWorkspace.tsx app/src/components/creative-work/StudioPieceWorkspace.test.tsx 'app/src/app/(dashboard)/creative-work/[id]/page.tsx' 'app/src/app/(dashboard)/creative-work/[id]/page.test.tsx' app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: expose layers and resume single pieces in the studio box"
```

## Task 7: Prova de integração e fechamento local

**Files:**
- Modify: `app/tests/e2e/first-studio-piece.spec.ts`, `app/tests/e2e/create-post.spec.ts`, `app/tests/e2e/layer-editor.spec.ts`.
- Create: `docs/evidence/2026-09-10-estudio-peca-na-caixa.md`.

**Interfaces:**
- Consumes: fixture/auth helpers existentes nesses testes; provider determinístico e servidor local isolados.
- Produces: evidência reproduzível de comportamento/persistência/concurrency/visual. Este plano não produz deploy nem evidência de qualidade visual da IA.

- [ ] **Step 1: Confirmar ambiente controlado antes de chamar qualquer geração.**

`E2E_CONTROLLED_PROVIDER=true`, baseURL localhost/127.0.0.1, app+worker com a mesma configuração; banco/storage/credenciais de fixture isolados. Usar `isE2EControlledProviderEnabled` como verificação no harness. Não iniciar seed usando .env de produção. Se banco de teste não estiver configurado, completar testes unitários/visuais com mocks e registrar E2E bloqueado por esse ambiente, sem chamar APIs pagas.

```ts
expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
expect(process.env.E2E_CONTROLLED_PROVIDER).toBe("true");
```

Essas verificações entram no describe novo de first-studio-piece; não modificam a configuração global de outros projetos. Validar separadamente que o servidor/worker estão na mesma política, pois env do runner não prova o servidor.

- [ ] **Step 2: Acrescentar jornada via UI no arquivo existente.**

Reusar `fixture` e `signInHome` de first-studio-piece. Criar peça pela UI e obter workId da URL; usar request API autenticada apenas para asserts de persistência e controle de fixture.

```ts
const workId = new URL(page.url()).searchParams.get("workId");
expect(workId).toBeTruthy();
const box = page.getByTestId("studio-piece-workspace");
await expect(box.getByRole("img", { name: /peça/i }).first()).toBeVisible();
await box.getByRole("button", { name: "Comentar", exact:true }).click();
await box.getByRole("button", { name: "Adicionar comentário" }).click();
await box.getByRole("textbox", { name: "Comentário" }).fill("Aumente o CTA");
await box.getByRole("button", { name: "Salvar comentário" }).click();
await expect(box.getByText("Salvo", {exact:true})).toBeVisible();
await page.reload();
await expect(box.getByRole("button", { name: /comentário 1/i })).toBeVisible();
await box.getByRole("button", { name: "Adaptar formato" }).click();
await page.getByRole("dialog", { name: "Proporções disponíveis" }).getByRole("button", {name:"9:16",exact:true}).click();
await box.getByRole("button", { name: "Revisar",exact:true }).click();
await expect(box.getByText(/créditos/i)).toBeVisible();
await box.getByRole("button", { name: "Confirmar e gerar" }).click();
await expect(box.getByRole("button", { name: /versão 2.*9:16/i })).toBeVisible();
expect(new URL(page.url()).searchParams.get("workId")).toBe(workId);
```

Acrescentar à mesma jornada assertions de GET: pai targetFormat4:5/outputKey hash intactos, filha targetFormat9:16/parentOutputId correto/revisionContext com nota; dimensões do arquivo realmente9:16, sem apenas trocar label. Evidence provider mostra modo format_adaptation, base como primeira referência e uma confirmação aceita. Marcar pendência de geração com output queued/processing e recarregar: status reaparece. Simular dispatch_failed via fixture existente e assegurar request/notas/base visíveis.

- [ ] **Step 3: Verificar duas abas e replay no banco isolado.**

Dentro de create-post.spec, após salvar draft revisão N, disparar dois PATCH com expectedReviewRevision=N; ordenar resultados e exigir `[200,409]`. Para gerar, enviar o MESMO reviewed_revision duas vezes, inclusive em paralelo; exigir mesmo output.id, uma reserva/crédito e um dispatch. Depois editar draft, reenviar comando antigo e exigir replay da operação anterior sem cobrar. Chave antiga com output diferente deve falhar. Utilizar `dbOutputRow` e leitores de evidence já existentes; não criar mocks que serializem artificialmente a corrida.

```ts
const responses = await Promise.all([sendSameCommand(), sendSameCommand()]);
const bodies = await Promise.all(responses.map(response => response.json()));
expect(bodies[0].output.id).toBe(bodies[1].output.id);
```

`sendSameCommand` é closure local de `page.request.post` com o corpo reviewed_revision salvo; nenhuma função auxiliar nova de produção.

- [ ] **Step 4: Inspecionar três tamanhos e camadas.**

Para 390×844, 1045×586, 1440×900: arte inteira visível, dock junto à imagem, popover dentro do viewport, um pedido, Confirmar alcançável; screenshots de pronta, comentário, plano, erro e camadas. Em layer-editor.spec, reaproveitar fixture com entitlement e separação controlada: abrir painel não incrementa contador, gerar incrementa uma vez, reload não incrementa, publicar retorna filho no mesmo trabalho. Confirmar keyboard/Escape/Tab e prefers-reduced-motion.

- [ ] **Step 5: Rodar checks focados e consolidar evidência.**

Run from `app/`:

```bash
npm run typecheck
npx playwright test tests/e2e/first-studio-piece.spec.ts --project=serial-flows
npx playwright test tests/e2e/create-post.spec.ts --project=serial-flows --grep "revisão|Revisão|reviewed"
npx playwright test tests/e2e/layer-editor.spec.ts --project=serial-flows
```

ESLint: usar a lista explícita dos TS/TSX alterados nas tarefas, sem varrer outros projetos. `git diff --check` na raiz. `graphify update .` depois das alterações de código; inspecionar resultados gerados e não incluir WIP anterior no commit. Nenhum teste de provider real. O relatório registra comandos/resultados, commits, screenshots por viewport, migração local aplicada, evidência de uma operação por confirmação, limitações e a separação entre aprovação do protótipo e aceite da aplicação integrada.

- [ ] **Step 6: Commit e revisão final do diff.**

```bash
git add app/tests/e2e/first-studio-piece.spec.ts app/tests/e2e/create-post.spec.ts app/tests/e2e/layer-editor.spec.ts docs/evidence/2026-09-10-estudio-peca-na-caixa.md
git commit -m "test: prove the studio piece review journey end to end"
```

Concluir localmente só com checks relevantes verdes ou bloqueios externos explicitados. Publicação e teste pago não fazem parte deste commit. Seguir com o plano de qualidade antes de declarar a reclamação original de geração resolvida.

## Cobertura e auto-revisão do plano

| Critério da spec | Tarefas |
| --- | --- |
| Mesmo trabalho, base imutável, formato real | 2, 7 |
| Rascunho salvo, comentários por output, CAS | 1, 3, 5, 7 |
| Revisar/confirmar com custo e idempotência | 2, 3, 7 |
| Caixa contida, arte principal, miniaturas | 4, 5, 7 |
| Proporções no botão, texto preservado | 3, 5, 7 |
| Fila/erro após reload | 3, 4, 7 |
| Camadas visíveis, sem disparo ao abrir | 6, 7 |
| Política de escolha/QA e detalhes técnicos | 4 |
| Retomada, links antigos, protocolos fora do recorte | 4, 6, 7 |
| Qualidade real e comparação Cenbrap | Plano complementar |

Auto-revisão: contratos nomeados por tarefa, campos iguais entre UI/API/DB, caminhos conferidos contra a base; limitações da geometria e do protótipo explícitas. Os trechos de teste usam os fixtures do arquivo indicado quando declarado; os códigos novos têm assinatura definida acima. A execução precisa produzir os testes completos, não marcar snippets como evidência de execução.
