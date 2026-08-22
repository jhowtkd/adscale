# Native Layer Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Layerize concluído em um editor nativo de composição no fluxo de Resultados, com rascunho seguro, regeneração isolada e publicação como nova versão da Peça.

**Architecture:** Manter `creative_work_outputs` como agregado canônico, adicionando um único `layer_editor` JSONB com compare-and-set por revisão e lease. Reutilizar as rotas, o storage privado, Inngest, `usage_events`, `workspace_entitlements`, Sharp e `ag-psd`; a UI abre um `Dialog` full-screen e renderiza uma `<img>` absoluta por camada com Pointer Events nativos.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript, Drizzle/PostgreSQL, Zod 3, TanStack Query 5, Base UI Dialog, Inngest 4, OpenAI SDK 6.34, Sharp 0.33, ag-psd 15, Vitest 4 e Playwright 1.60.

**Spec:** [`docs/superpowers/specs/2026-08-21-native-layer-editor-design.md`](../specs/2026-08-21-native-layer-editor-design.md)

## Global Constraints

- O original, `layerization`, seus PNGs/PSD/ZIP e todas as versões publicadas são imutáveis.
- Um documento contém de 2 a 17 camadas; `order = 0` é a camada frontal e o painel mostra ordem crescente.
- O browser nunca envia nem recebe storage keys, callback token/hash, provider endpoint, provider URL, provider request id ou segredo.
- Um lease dura 90 segundos; heartbeat ocorre a cada 30 segundos e não incrementa `revision`.
- Autosave espera 750 ms sem mudança; undo/redo mantém no máximo 50 comandos apenas na sessão.
- Desktop e tablet editam; celular usa `mode: "inspect"` e não persiste mutação.
- Regeneração usa exatamente um `gpt-image-2`, qualidade `medium`, `input_fidelity: "high"`, PNG transparente, uma candidata e zero retries do SDK.
- Layerize e regeneração não debitam créditos; cada nova tentativa externa consome uma unidade da cota mensal UTC do workspace.
- `layerize_v1` e `layer_regeneration_v1` são os únicos tipos novos de `usage_events`; release pré-provider usa o mesmo tipo com `amount = -1`.
- Não adicionar pacote de canvas, página de dashboard, árvore de API top-level, provider router, fallback automático, histórico persistente ou coedição.
- Testes usam provider fake e assets sintéticos/próprios; implementação não autoriza chamada paga, deploy, segredo, entitlement real ou liberação geral.

## File Map

### Create

- `app/drizzle/0086_creative_work_layer_editor.sql` — coluna JSONB e índice mensal de uso.
- `app/src/server/layer-editor/contracts.ts` — schemas interno/público, DTOs e constantes do editor.
- `app/src/server/layer-editor/contracts.test.ts` — parsing estrito, projeção segura e invariantes.
- `app/src/server/layer-editor/quota.ts` — leitura, claim e release transacionais de cota.
- `app/src/server/layer-editor/quota.test.ts` — metadata inválido, replay e release.
- `app/tests/integration/creative-work-layer-editor-quota.test.ts` — concorrência PostgreSQL no limite mensal.
- `app/src/server/repositories/creative-work-layer-editor.ts` — inicialização, lease, CAS, candidata e publicação.
- `app/src/server/repositories/creative-work-layer-editor.test.ts` — SQL escopado e transições atômicas.
- `app/src/server/application/manage-creative-work-layer-editor.ts` — open/heartbeat/save/release e projeção assinada.
- `app/src/server/application/manage-creative-work-layer-editor.test.ts` — elegibilidade, modo inspect/edit e vazamento de dados.
- `app/src/server/layer-editor/artifacts.ts` — composição PNG, PSD, normalização RGBA e chaves determinísticas.
- `app/src/server/layer-editor/artifacts.test.ts` — ordem, visibilidade, alpha, contain e hashes.
- `app/src/server/layer-editor/openai-provider.ts` — uma edição OpenAI isolada e testável.
- `app/src/server/layer-editor/openai-provider.test.ts` — parâmetros, ordem dos inputs e zero retry.
- `app/src/server/application/request-creative-work-layer-regeneration.ts` — claim de cota, estado reservado e dispatch.
- `app/src/server/application/request-creative-work-layer-regeneration.test.ts` — replay, falha pré-dispatch e bloqueio de candidata.
- `app/src/server/jobs/creative-work-layer-regeneration.ts` — chamada externa única e materialização da candidata.
- `app/src/server/jobs/creative-work-layer-regeneration.test.ts` — provider fake, ambiguidade e conclusão tardia.
- `app/src/server/application/publish-creative-work-layer-editor.ts` — materialização e publicação idempotente da filha.
- `app/src/server/application/publish-creative-work-layer-editor.test.ts` — rebase, replay e falha de artefato.
- `app/src/components/creative-work/layer-editor/state.ts` — reducer puro, clamp e histórico de sessão.
- `app/src/components/creative-work/layer-editor/state.test.ts` — comandos, undo/redo, restauração e limite 50.
- `app/src/components/creative-work/layer-editor/useLayerEditor.ts` — query, autosave serial, heartbeat e comandos HTTP.
- `app/src/components/creative-work/layer-editor/useLayerEditor.test.tsx` — debounce, conflito e cleanup.
- `app/src/components/creative-work/layer-editor/LayerCanvas.tsx` — imagens absolutas, seleção e Pointer Events.
- `app/src/components/creative-work/layer-editor/LayerPanel.tsx` — lista, rename, ordem e visibilidade.
- `app/src/components/creative-work/layer-editor/LayerRegenerationPanel.tsx` — instrução, cota, confirmação e candidata.
- `app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx` — overlay, toolbar, status e responsividade.
- `app/src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx` — foco, teclado, tablet e celular.
- `app/tests/integration/creative-work-layer-editor-journey.test.ts` — jornada autenticada com DB/storage/provider controlados.
- `app/scripts/seed-layer-editor-e2e.ts` — fixture sintética do editor sem inferência paga.
- `app/tests/e2e/layer-editor.spec.ts` — screenshots e interações desktop/tablet/mobile.

### Modify

- `app/drizzle/meta/_journal.json` — registrar migration 0086.
- `app/src/server/db/schema.ts` — mapear `creative_work_outputs.layer_editor`.
- `app/src/server/layerize/contracts.ts` e teste — projeção pública explícita sem chaves/provider.
- `app/src/server/repositories/entitlements.ts` — leitura validada de `layer_editor_v1`.
- `app/src/server/application/request-creative-work-layerization.ts` e teste — operation id, entitlement/cota e release pré-provider.
- `app/src/server/jobs/creative-work-layerization.ts` e teste — release somente quando nenhuma submissão externa ocorreu.
- `app/src/app/api/creative-work/[id]/route.ts` e teste — ações do editor e acesso de membro.
- `app/src/server/application/resolve-creative-work-output-download.ts` e teste — layer/candidate/draft PNG/PSD.
- `app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.ts` e teste — formatos e autorização.
- `app/src/server/jobs/heavy-image-events.ts`, `app/src/server/ai/image-runtime-config.ts`, `app/src/app/api/inngest/route.ts`, `app/src/server/jobs/image-worker.ts` e testes — registrar regeneração web/worker.
- `app/src/lib/hooks/use-creative-work.ts` e testes — tipos públicos, access/quota e operation id do Layerize.
- `app/src/components/ui/dialog.tsx` — variante `full` do primitive existente.
- `app/src/components/creative-work/CreativeResultCard.tsx` e teste — CTA/confirm de Layerize e abrir editor.
- `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx` e teste — montar o overlay no fluxo atual.
- `app/src/components/creative-work/useCreativeComposer.ts` e teste — quota, confirmação e invalidação.
- `app/messages/pt-BR.json` e `app/messages/en.json` — copy e erros tipados.
- `app/package.json` e `app/playwright.config.ts` — seed e projeto E2E focado.
- `docs/creative-work-layerization-runbook.md` — entitlement, lifecycle, validação e gates separados.

---

### Task 1: Persisted Contract and Safe Projection

**Files:**
- Create: `app/drizzle/0086_creative_work_layer_editor.sql`
- Create: `app/src/server/layer-editor/contracts.ts`
- Create: `app/src/server/layer-editor/contracts.test.ts`
- Modify: `app/drizzle/meta/_journal.json`
- Modify: `app/src/server/db/schema.ts:2671-2769`
- Modify: `app/src/server/layerize/contracts.ts:23-122`
- Test: `app/src/server/layer-editor/contracts.test.ts`
- Test: `app/src/server/layerize/contracts.test.ts`

**Interfaces:**
- Consumes: `LayerizationState`, `creativeWorkOutputs`, Zod.
- Produces: `LayerEditorStateV1`, `PublicLayerEditorDocumentV1`, `PublicLayerEditorSummaryV1`, `LayerEditorMutableSnapshotV1`, `layerEditorStateFromDatabase()`, `toPublicLayerizationState()`.

- [ ] **Step 1: Write failing tests for strict persistence and private-field removal**

```ts
it("rejects a document with duplicate order or a box outside the canvas", () => {
  expect(layerEditorStateSchema.safeParse(outsideCanvasState).success).toBe(false);
  expect(layerEditorStateSchema.safeParse(duplicateOrderState).success).toBe(false);
});

it("projects Layerize without storage or provider data", () => {
  const value = toPublicLayerizationState(completedLayerization);
  expect(value?.layers[0]).not.toHaveProperty("storageKey");
  expect(value).not.toHaveProperty("callbackTokenHash");
  expect(value).not.toHaveProperty("providerEndpoint");
  expect(value).not.toHaveProperty("providerRequestId");
  expect(value).not.toHaveProperty("psdKey");
});
```

- [ ] **Step 2: Run the focused tests and verify the new imports/schema fail**

Run: `cd app && npm test -- src/server/layer-editor/contracts.test.ts src/server/layerize/contracts.test.ts`

Expected: FAIL because `layer-editor/contracts.ts` and the safe projection do not exist.

- [ ] **Step 3: Add the migration and Drizzle mapping**

```sql
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "layer_editor" jsonb;

CREATE INDEX IF NOT EXISTS "usage_events_workspace_type_created_idx"
  ON "adscale_app"."usage_events" ("workspace_id", "type", "created_at");
```

Add this field next to `layerization` in `schema.ts`:

```ts
layerEditor: jsonb("layer_editor")
  .$type<import("../layer-editor/contracts").LayerEditorStateV1 | null>(),
```

Append journal entry `idx: 86`, `version: "7"`, tag `0086_creative_work_layer_editor`, and a monotonically increasing `when` value.

- [ ] **Step 4: Define the exact internal and public contracts**

```ts
export const LAYER_EDITOR_LEASE_MS = 90_000;
export const LAYER_EDITOR_HEARTBEAT_MS = 30_000;
export const LAYER_EDITOR_AUTOSAVE_MS = 750;
export const LAYER_EDITOR_UNDO_LIMIT = 50;
export const LAYER_EDITOR_SIGNED_URL_TTL_SECONDS = 300;
export type LayerRegenerationStatus = "reserved" | "processing" | "submission_unknown" | "ready" | "failed";

export type LayerEditorStateV1 = {
  schemaVersion: 1;
  revision: number;
  sourceLayerizationAttemptId: string;
  canvas: { width: number; height: number };
  layers: Array<{
    id: string;
    source: {
      order: number;
      name: string;
      visible: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
      key: string;
    };
    order: number;
    name: string;
    visible: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    currentKey: string;
    currentKind: "source" | "regenerated";
    restorableKey: string | null;
  }>;
  lease: null | { id: string; userId: string; acquiredAt: string; expiresAt: string };
  regeneration: null | {
    id: string;
    status: LayerRegenerationStatus;
    layerId: string;
    instruction: string;
    requestedByUserId: string;
    usageKey: string;
    candidateKey: string | null;
    providerRequestId: string | null;
    failureCode: string | null;
    createdAt: string;
    updatedAt: string;
  };
  publishedPsdKey: string | null;
  updatedAt: string;
};
```

Build `layerEditorStateSchema` with `.strict()`, UUID layer/lease/regeneration ids, 2–17 layers, contiguous unique `order`, canvas-positive integers, name length 1–128 and whole bounding boxes inside the canvas. Define public layer source with `Omit<LayerEditorStateV1["layers"][number]["source"], "key"> & { imageUrl: string }`, and public current layer with `imageUrl` instead of `currentKey`.

Also export these client-safe contracts from the same file:

```ts
export type LayerEditorQuotaBucket = { limit: number; used: number; remaining: number };
export type LayerEditorAccessV1 = {
  enabled: boolean;
  period: null | { startsAt: string; endsAt: string };
  layerize: LayerEditorQuotaBucket | null;
  regeneration: LayerEditorQuotaBucket | null;
};
export type PublicLayerEditorDocumentV1 = {
  schemaVersion: 1;
  revision: number;
  canvas: { width: number; height: number };
  layers: Array<{
    id: string;
    source: Omit<LayerEditorStateV1["layers"][number]["source"], "key"> & { imageUrl: string };
    order: number;
    name: string;
    visible: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    currentKind: "source" | "regenerated";
    imageUrl: string;
  }>;
  lease: { mode: "edit" | "read"; leaseId: string | null; heldByName: string | null; expiresAt: string | null };
  regeneration: null | { id: string; status: LayerRegenerationStatus; layerId: string; instruction: string; candidateUrl: string | null; failureCode: string | null };
  updatedAt: string;
};
export type PublicLayerEditorSummaryV1 = {
  revision: number;
  layerCount: number;
  regenerationStatus: LayerRegenerationStatus | null;
  updatedAt: string;
};
export const layerEditorMutableSnapshotSchema = z.object({
  layers: z.array(z.object({
    id: z.string().uuid(), order: z.number().int(), name: z.string().trim().min(1).max(128),
    visible: z.boolean(), x: z.number().int(), y: z.number().int(),
    width: z.number().int().positive(), height: z.number().int().positive(),
    useSource: z.boolean(),
  }).strict()).min(2).max(17),
}).strict();
export type LayerEditorMutableSnapshotV1 = z.infer<typeof layerEditorMutableSnapshotSchema>;
```

- [ ] **Step 5: Replace `PublicLayerizationState = Omit<...>` with an allowlisted projection**

```ts
export type PublicLayerizationState = Pick<
  LayerizationState,
  "status" | "createdAt" | "updatedAt" | "latencyMs" | "baseWidth" |
  "baseHeight" | "fidelity" | "failureCode"
> & {
  layers: Array<Omit<LayerizationLayer, "storageKey" | "sourceBytes">>;
};
```

Construct the return object field-by-field; do not spread the internal state.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/layer-editor/contracts.test.ts src/server/layerize/contracts.test.ts && npm run typecheck`

Expected: PASS; no public type references a private key.

- [ ] **Step 7: Commit the durable contract**

```bash
git add app/drizzle/0086_creative_work_layer_editor.sql app/drizzle/meta/_journal.json app/src/server/db/schema.ts app/src/server/layer-editor/contracts.ts app/src/server/layer-editor/contracts.test.ts app/src/server/layerize/contracts.ts app/src/server/layerize/contracts.test.ts
git commit -m "feat: add native layer editor contract"
```

---

### Task 2: Entitlement, Monthly Quota, and Member Layerize Entry

**Files:**
- Create: `app/src/server/layer-editor/quota.ts`
- Create: `app/src/server/layer-editor/quota.test.ts`
- Create: `app/tests/integration/creative-work-layer-editor-quota.test.ts`
- Modify: `app/src/server/repositories/entitlements.ts:1-145`
- Modify: `app/src/server/application/request-creative-work-layerization.ts:1-170`
- Modify: `app/src/server/application/request-creative-work-layerization.test.ts`
- Modify: `app/src/server/jobs/creative-work-layerization.ts:1-480`
- Modify: `app/src/server/jobs/creative-work-layerization.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts:1-470`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts:130-180,661-674`
- Modify: `app/src/lib/hooks/use-creative-work.test.ts`

**Interfaces:**
- Consumes: `workspace_entitlements`, `usage_events`, `trackUsage()`, `requestCreativeWorkLayerization()`.
- Produces: `LayerEditorAccessV1`, `getLayerEditorAccess()`, `claimLayerEditorQuota()`, `releaseLayerEditorQuota()`, member-visible `layerizeOutput` with `operationId`.

- [ ] **Step 1: Write failing quota tests**

```ts
it("treats invalid entitlement metadata as disabled", async () => {
  entitlementMock.mockResolvedValue({ metadata: { layerizeMonthlyLimit: -1 } });
  await expect(getLayerEditorAccess("workspace-1", NOW)).resolves.toEqual({
    enabled: false,
    period: null,
    layerize: null,
    regeneration: null,
  });
});

it("replays one operation without consuming a second unit", async () => {
  const first = await claimLayerEditorQuota(claimInput, NOW);
  const replay = await claimLayerEditorQuota(claimInput, NOW);
  expect(first).toMatchObject({ ok: true, replay: false });
  expect(replay).toMatchObject({ ok: true, replay: true });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd app && npm test -- src/server/layer-editor/quota.test.ts tests/integration/creative-work-layer-editor-quota.test.ts`

Expected: FAIL because the quota module does not exist.

- [ ] **Step 3: Add layer-editor entitlement parsing**

```ts
export const LAYER_EDITOR_ENTITLEMENT_KIND = "layer_editor_v1" as const;

export const layerEditorEntitlementMetadataSchema = z.object({
  layerizeMonthlyLimit: z.number().int().nonnegative(),
  regenerationMonthlyLimit: z.number().int().nonnegative(),
}).strict();

export async function getActiveLayerEditorEntitlementByWorkspace(
  workspaceId: string,
  now: Date,
  tx?: DbOrTx,
) {
  const client = tx ?? db;
  const rows = await client.select().from(workspaceEntitlements).where(and(
    eq(workspaceEntitlements.workspaceId, workspaceId),
    eq(workspaceEntitlements.kind, LAYER_EDITOR_ENTITLEMENT_KIND),
    eq(workspaceEntitlements.status, ENTITLEMENT_STATUS_ACTIVE),
    lte(workspaceEntitlements.startsAt, now),
    or(isNull(workspaceEntitlements.expiresAt), gt(workspaceEntitlements.expiresAt, now)),
  )).limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Implement atomic claim/release with a UTC month window**

```ts
export type LayerEditorQuotaKind = "layerize_v1" | "layer_regeneration_v1";

import type { LayerEditorAccessV1, LayerEditorQuotaBucket } from "./contracts";

export async function getLayerEditorAccess(workspaceId: string, now: Date): Promise<LayerEditorAccessV1>;
export async function claimLayerEditorQuota(input: {
  workspaceId: string;
  kind: LayerEditorQuotaKind;
  operationId: string;
  userId: string;
  workItemId: string;
  outputId: string;
}, now: Date): Promise<{ ok: true; replay: boolean } | { ok: false; code: "disabled" | "quota_exhausted" }>;
export async function releaseLayerEditorQuota(input: {
  workspaceId: string;
  kind: LayerEditorQuotaKind;
  operationId: string;
}, now: Date): Promise<{ released: boolean }>;
```

Inside `db.transaction`, run `select pg_advisory_xact_lock(hashtext(${workspaceId + ":" + kind + ":" + yyyyMm}))`, read the idempotency key first, sum `coalesce(sum(amount), 0)` in `[monthStart, nextMonthStart)`, compare to the validated limit, then insert `amount = 1`. Release takes the same lock, verifies the positive claim and inserts `${claimKey}:release` with `amount = -1` and `metadata.operation = "release"`.

- [ ] **Step 5: Prove the PostgreSQL race**

In `creative-work-layer-editor-quota.test.ts`, seed an entitlement with limit `1`, synchronize two `claimLayerEditorQuota()` promises on distinct operation ids, and assert exactly one `{ ok: true }`, one `{ ok: false, code: "quota_exhausted" }`, and SQL `sum(amount) = 1`. Add a replay assertion with the winner's operation id.

- [ ] **Step 6: Bind Layerize attempts to `operationId` and quota**

Change the route schema and hook payload to:

```ts
const layerizeOutputSchema = z.object({
  action: z.literal("layerizeOutput"),
  outputId: z.string().uuid(),
  operationId: z.string().uuid(),
  retry: z.boolean().optional(),
}).strict();
```

Use `operationId` as `attemptId`. Check eligibility/existing state before quota claim. If the layerization CAS loses to a different operation, release the losing claim. If Inngest dispatch is definitively failed while the row remains `queued`, release the claim; if state advanced, preserve the claim.

- [ ] **Step 7: Release only proven pre-provider Layerize failures in the job**

Call `releaseLayerEditorQuota()` for `no_longer_eligible`, `source_missing` and `missing_configuration` paths reached before `provider.submit`. Do not release after `provider.submit` is called, after provider 4xx/5xx, on reconciliation, timeout, invalid payload, fidelity failure or storage failure.

- [ ] **Step 8: Replace owner-only visibility with entitlement access**

In GET, compute `layerEditorAccess = await getLayerEditorAccess(workspace.id, new Date())`; expose Layerize state only when access is enabled, and return:

```ts
{
  layerEditorAccess,
  canLayerize: layerEditorAccess.enabled && Boolean(env.ATLASCLOUD_API_KEY?.trim()),
}
```

In PATCH, destructure `{ workspace, user }` from `requireWorkspaceAccess()` and remove `requirePlatformOwner()` from `layerizeOutput`. Keep the provider-config and quota checks server-side.

- [ ] **Step 9: Run focused unit/integration tests and typecheck**

Run: `cd app && npm test -- src/server/layer-editor/quota.test.ts tests/integration/creative-work-layer-editor-quota.test.ts src/server/application/request-creative-work-layerization.test.ts src/server/jobs/creative-work-layerization.test.ts 'src/app/api/creative-work/[id]/route.test.ts' src/lib/hooks/use-creative-work.test.ts && npm run typecheck`

Expected: PASS; a non-owner workspace member with entitlement can start one confirmed Layerize attempt and concurrent claims cannot exceed the limit.

- [ ] **Step 10: Commit quota and member access**

```bash
git add app/src/server/repositories/entitlements.ts app/src/server/layer-editor/quota.ts app/src/server/layer-editor/quota.test.ts app/tests/integration/creative-work-layer-editor-quota.test.ts app/src/server/application/request-creative-work-layerization.ts app/src/server/application/request-creative-work-layerization.test.ts app/src/server/jobs/creative-work-layerization.ts app/src/server/jobs/creative-work-layerization.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.ts
git commit -m "feat: gate layer tools by workspace quota"
```

---

### Task 3: Editor Initialization, Lease, Autosave, and HTTP Commands

**Files:**
- Create: `app/src/server/repositories/creative-work-layer-editor.ts`
- Create: `app/src/server/repositories/creative-work-layer-editor.test.ts`
- Create: `app/src/server/application/manage-creative-work-layer-editor.ts`
- Create: `app/src/server/application/manage-creative-work-layer-editor.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

**Interfaces:**
- Consumes: `LayerEditorStateV1`, safe Layerize state, `objectStorage.signedDownloadUrl()`, `getLayerEditorAccess()`.
- Produces: `openCreativeWorkLayerEditor()`, `heartbeatCreativeWorkLayerEditor()`, `saveCreativeWorkLayerEditor()`, `releaseCreativeWorkLayerEditor()`, four PATCH actions.

- [ ] **Step 1: Write failing repository tests for one winner and stale revisions**

```ts
it("lets one of two editors acquire the lease", async () => {
  const [left, right] = await Promise.all([
    acquireCreativeWorkLayerEditorLease({ ...scope, userId: "user-a", leaseId: "lease-a", now: NOW }),
    acquireCreativeWorkLayerEditorLease({ ...scope, userId: "user-b", leaseId: "lease-b", now: NOW }),
  ]);
  expect([left?.layerEditor?.lease?.userId, right?.layerEditor?.lease?.userId])
    .toContain("user-a");
  expect(new Set([left?.layerEditor?.lease?.userId, right?.layerEditor?.lease?.userId]).size)
    .toBe(1);
});

it("rejects save with a stale expectedRevision", async () => {
  const result = await saveCreativeWorkLayerEditorSnapshot({
    ...scope,
    userId: "user-a",
    leaseId: "lease-a",
    expectedRevision: 4,
    snapshot,
    now: NOW,
  });
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify missing repository failures**

Run: `cd app && npm test -- src/server/repositories/creative-work-layer-editor.test.ts src/server/application/manage-creative-work-layer-editor.test.ts`

Expected: FAIL because repository/application functions are undefined.

- [ ] **Step 3: Implement deterministic seeding from completed Layerize**

Sort Layerize layers back-to-front by ascending provider `order`, then map each item with editor order `layerCount - 1 - index`. Set `source` and current mutable values to the same metadata, `source.key === currentKey`, `visible: true`, `currentKind: "source"`, `restorableKey: null`, `revision: 1`, and no regeneration.

```ts
export function seedLayerEditorState(
  layerization: LayerizationState,
  lease: LayerEditorStateV1["lease"],
  now: Date,
): LayerEditorStateV1;
```

Use `crypto.randomUUID()` once per layer. Initial inspect seeds with `lease: null`; initial edit seeds and leases in the same `UPDATE ... WHERE layer_editor IS NULL` CAS.

- [ ] **Step 4: Implement exact repository operations**

```ts
export type LayerEditorScope = { workspaceId: string; workItemId: string; outputId: string };
export type LayerEditorMutationScope = LayerEditorScope & {
  userId: string;
  leaseId: string;
  expectedRevision: number;
};
export async function getCreativeWorkLayerEditorOutput(scope: LayerEditorScope): Promise<CreativeWorkOutput | null>;
export async function initializeCreativeWorkLayerEditor(input: LayerEditorScope & { state: LayerEditorStateV1 }): Promise<CreativeWorkOutput | null>;
export async function acquireCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now: Date }): Promise<CreativeWorkOutput | null>;
export async function heartbeatCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now: Date }): Promise<CreativeWorkOutput | null>;
export async function saveCreativeWorkLayerEditorSnapshot(input: LayerEditorMutationScope & { snapshot: LayerEditorMutableSnapshotV1; now: Date }): Promise<CreativeWorkOutput | null>;
export async function releaseCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now: Date }): Promise<boolean>;
```

Every `WHERE` includes `workspaceId + workItemId + outputId`. Acquire permits no lease, the same live user, or expired `expiresAt`; heartbeat changes only `lease.expiresAt` and row `updatedAt`; save validates live lease and exact `revision`, preserves ids/source/private keys, writes only mutable fields and increments revision once. `useSource` is a boolean selector, never a client-supplied key: `true` moves a regenerated `currentKey` to `restorableKey` and activates `source.key`; repeated source saves preserve the backup. A later `false` may only reactivate that persisted `restorableKey`; repeated regenerated saves do nothing to keys.

- [ ] **Step 5: Build safe signed projection in the application service**

```ts
export type OpenLayerEditorInput = LayerEditorScope & {
  userId: string;
  userName: string | null;
  mode: "inspect" | "edit";
};

export type LayerEditorCommandResult =
  | { ok: true; document: PublicLayerEditorDocumentV1; access: LayerEditorAccessV1 }
  | { ok: false; status: 403 | 404 | 409; code: "layer_editor_not_available" | "layer_editor_locked" | "layer_editor_revision_conflict"; document?: PublicLayerEditorDocumentV1 };

export async function openCreativeWorkLayerEditor(
  input: OpenLayerEditorInput,
): Promise<LayerEditorCommandResult>;
```

Require active entitlement. Seed only from a completed 2–17 layer Layerize when no editor exists. `mode: "edit"` additionally requires the output to be completed and selected; otherwise return read-only. Sign each private `source.key` and `currentKey` for 300 seconds as `source.imageUrl` and `imageUrl`; expose `leaseId` only to the holder. Resolve the other holder's display name through a workspace-scoped `workspace_members INNER JOIN user`, returning no email or user id.

- [ ] **Step 6: Add strict PATCH action schemas and status mapping**

```ts
const openLayerEditorSchema = z.object({
  action: z.literal("openLayerEditor"),
  outputId: z.string().uuid(),
  mode: z.enum(["inspect", "edit"]),
}).strict();

const saveLayerEditorSchema = z.object({
  action: z.literal("saveLayerEditor"),
  outputId: z.string().uuid(),
  leaseId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  snapshot: layerEditorMutableSnapshotSchema,
}).strict();
```

Add these strict schemas for heartbeat/release:

```ts
const heartbeatLayerEditorSchema = z.object({
  action: z.literal("heartbeatLayerEditor"), outputId: z.string().uuid(), leaseId: z.string().uuid(),
}).strict();
const releaseLayerEditorSchema = z.object({
  action: z.literal("releaseLayerEditor"), outputId: z.string().uuid(), leaseId: z.string().uuid(),
}).strict();
```

Map missing scope to 404, entitlement to 403, ineligible edit/seed to 409, lock to `409 layer_editor_locked`, and stale/invalid lease to `409 layer_editor_revision_conflict` with the refreshed safe DTO.

- [ ] **Step 7: Test public boundaries and heartbeat semantics**

Add route/application assertions that inspect never acquires a lease, mobile-safe DTO contains no key, another member receives read-only plus display name, same lease heartbeat extends expiry without revision change, save cannot add/remove ids, repeated `useSource` saves preserve the trusted backup, undo can only reactivate that backup, and release is best effort.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/repositories/creative-work-layer-editor.test.ts src/server/application/manage-creative-work-layer-editor.test.ts 'src/app/api/creative-work/[id]/route.test.ts' && npm run typecheck`

Expected: PASS; two editors cannot both mutate and stale saves return a typed conflict.

- [ ] **Step 9: Commit editor persistence and commands**

```bash
git add app/src/server/repositories/creative-work-layer-editor.ts app/src/server/repositories/creative-work-layer-editor.test.ts app/src/server/application/manage-creative-work-layer-editor.ts app/src/server/application/manage-creative-work-layer-editor.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: add layer editor lease and autosave commands"
```

---

### Task 4: Saved-Revision PNG/PSD and Authorized Downloads

**Files:**
- Create: `app/src/server/layer-editor/artifacts.ts`
- Create: `app/src/server/layer-editor/artifacts.test.ts`
- Modify: `app/src/server/application/resolve-creative-work-output-download.ts:1-137`
- Modify: `app/src/server/application/resolve-creative-work-output-download.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.ts:1-64`
- Modify: `app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.test.ts`

**Interfaces:**
- Consumes: saved `LayerEditorStateV1`, `objectStorage`, Sharp, ag-psd, `resolveCreativeWorkOutputDownload()`.
- Produces: `renderLayerEditorPng()`, `writeLayerEditorPsd()`, `materializeLayerEditorDraft()`, download formats `layer`, `layer-candidate`, `draft-png`, `draft-psd`, `psd`.

- [ ] **Step 1: Write failing pixel/order/export tests**

```ts
it("composites visible layers from back to front without changing source bytes", async () => {
  const before = layers.map((layer) => createHash("sha256").update(layer.png).digest("hex"));
  const png = await renderLayerEditorPng({ canvas, layers, load: loadFixture });
  expect(await pixelAt(png, 2, 2)).toEqual([255, 0, 0, 255]);
  expect(layers.map((layer) => createHash("sha256").update(layer.png).digest("hex"))).toEqual(before);
});

it("writes frontmost order zero first in Photoshop and preserves hidden state", async () => {
  const psd = readPsd(await writeLayerEditorPsd({ canvas, layers, load: loadFixture }));
  expect(psd.children?.map((child) => child.name)).toEqual(["Back", "Front"]);
  expect(psd.children?.[0]?.hidden).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify missing artifact functions**

Run: `cd app && npm test -- src/server/layer-editor/artifacts.test.ts src/server/application/resolve-creative-work-output-download.test.ts 'src/app/api/creative-work/[id]/outputs/[outputId]/download/route.test.ts'`

Expected: FAIL because editor artifact functions/formats do not exist.

- [ ] **Step 3: Implement renderable-layer conversion and deterministic keys**

```ts
export type RenderableLayer = Pick<
  LayerEditorStateV1["layers"][number],
  "id" | "order" | "name" | "visible" | "x" | "y" | "width" | "height" | "currentKey"
>;

export function layerEditorArtifactKey(
  input: { workItemId: string; outputId: string; revision: number },
  format: "png" | "psd",
): string {
  return `creative-work/${input.workItemId}/layer-editor/${input.outputId}/draft/${input.revision}/piece.${format}`;
}
```

`renderLayerEditorPng()` starts from a transparent RGBA canvas, filters visible layers, sorts `order` descending, resizes each PNG to its saved box and composites it at `(x, y)`. `writeLayerEditorPsd()` sorts records `order` descending for ag-psd input, preserves all layers, sets `hidden: !visible`, and includes the visible composite as document image data.

- [ ] **Step 4: Materialize only the saved revision**

```ts
export async function materializeLayerEditorDraft(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  revision: number;
}): Promise<{ pngKey: string; psdKey: string }>;
```

Load the scoped output, parse `layerEditor`, require exact revision, `head()` each deterministic key, render/write only missing artifacts, then return keys. Never accept layer keys or geometry from the request.

- [ ] **Step 5: Extend the resolver with exact query contracts**

```ts
export type CreativeWorkOutputDownloadFormat =
  | "original"
  | "psd"
  | "zip"
  | "layer"
  | "layer-candidate"
  | "draft-png"
  | "draft-psd";

export type ResolveCreativeWorkOutputDownloadInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  format?: CreativeWorkOutputDownloadFormat;
  layerId?: string;
  revision?: number;
};
```

Resolve `layer` only by public `layerId` inside the persisted document, `layer-candidate` only when regeneration is `ready`, drafts only at the current saved revision, and published `psd` from `layerEditor.publishedPsdKey` before falling back to completed Layerize PSD.

- [ ] **Step 6: Enforce route authorization by format**

Parse `format`, `layerId` UUID and positive `revision` with Zod. `original` remains workspace-scoped. `zip` continues to call `requirePlatformOwner()`. `psd`, `layer`, `layer-candidate`, `draft-png` and `draft-psd` require active `layer_editor_v1`, but never platform-owner status.

- [ ] **Step 7: Test missing artifacts, private projections, and ZIP isolation**

Assert wrong workspace/output/layer ids return 404, stale draft revision returns 409, non-entitled members receive 403 for editor artifacts, entitled members receive a signed URL, and an entitled non-owner still receives 403 for `zip`.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/layer-editor/artifacts.test.ts src/server/application/resolve-creative-work-output-download.test.ts 'src/app/api/creative-work/[id]/outputs/[outputId]/download/route.test.ts' && npm run typecheck`

Expected: PASS; PNG and PSD describe the same saved revision and diagnostic ZIP remains private to owner/ops.

- [ ] **Step 9: Commit saved-revision artifacts**

```bash
git add app/src/server/layer-editor/artifacts.ts app/src/server/layer-editor/artifacts.test.ts app/src/server/application/resolve-creative-work-output-download.ts app/src/server/application/resolve-creative-work-output-download.test.ts 'app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.ts' 'app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.test.ts'
git commit -m "feat: export saved layer editor revisions"
```

---

### Task 5: Isolated OpenAI Layer Provider and RGBA Normalization

**Files:**
- Create: `app/src/server/layer-editor/openai-provider.ts`
- Create: `app/src/server/layer-editor/openai-provider.test.ts`
- Modify: `app/src/server/layer-editor/artifacts.ts`
- Modify: `app/src/server/layer-editor/artifacts.test.ts`

**Interfaces:**
- Consumes: OpenAI SDK, `toFile`, `dimensionsToGptImage2Size()`, `fetchProviderUrlSafe()`, Sharp.
- Produces: `LayerRegenerationProvider`, `OpenAILayerRegenerationProvider`, `normalizeLayerCandidate()`.

- [ ] **Step 1: Revalidate the official API and installed SDK contract**

Read [OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) and verify the installed type surface:

Run: `cd app && rg -n "background\?:|input_fidelity\?:|output_format\?:" node_modules/openai/resources/images.d.ts`

Expected: official edit support plus installed fields for transparent background, high input fidelity and PNG output. If the capability is absent, stop this task and update the approved spec; do not silently change model or provider.

- [ ] **Step 2: Write failing provider-contract tests**

```ts
it("requests one transparent high-fidelity edit with selected layer first", async () => {
  await provider.regenerate({
    instruction: "Make the flower warmer",
    selectedLayer: rgbaLayer,
    composite: flatComposite,
    bounds: { width: 420, height: 360 },
  });
  expect(editMock).toHaveBeenCalledOnce();
  expect(editMock.mock.calls[0]?.[0]).toMatchObject({
    model: "gpt-image-2",
    n: 1,
    quality: "medium",
    background: "transparent",
    output_format: "png",
    input_fidelity: "high",
  });
  expect(openAIConstructorMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
});
```

- [ ] **Step 3: Write failing RGBA safety tests**

Test empty bytes, non-PNG magic bytes, more than 25 MiB, more than 40,000,000 pixels, missing alpha, fully transparent alpha, proportional contain and center within the source bounding box.

- [ ] **Step 4: Run tests and verify missing provider/normalizer**

Run: `cd app && npm test -- src/server/layer-editor/openai-provider.test.ts src/server/layer-editor/artifacts.test.ts`

Expected: FAIL because provider and candidate normalization are missing.

- [ ] **Step 5: Define the provider interface and one fixed implementation**

```ts
export const LAYER_REGENERATION_MODEL = "gpt-image-2" as const;
export const LAYER_REGENERATION_MAX_BYTES = 25 * 1024 * 1024;
export const LAYER_REGENERATION_MAX_PIXELS = 40_000_000;

export type LayerRegenerationProvider = {
  regenerate(input: {
    instruction: string;
    selectedLayer: Buffer;
    composite: Buffer;
    bounds: { width: number; height: number };
  }): Promise<{ buffer: Buffer; requestId: string | null }>;
};
```

Create OpenAI with `{ timeout: 180_000, maxRetries: 0 }`. Pass two files in order: `selected-layer.png`, then `composition-context.png`. Prompt for only the revised isolated element and explicitly forbid background, frame, extra text and full composition.

- [ ] **Step 6: Call `images.edit` with exact parameters and safe response handling**

```ts
const response = await openai.images.edit({
  model: LAYER_REGENERATION_MODEL,
  image: [selectedFile, compositeFile],
  prompt,
  n: 1,
  size: toOpenAISdkImageSize(dimensionsToGptImage2Size(input.bounds)),
  quality: "medium",
  background: "transparent",
  output_format: "png",
  input_fidelity: "high",
}, { timeout: 180_000, maxRetries: 0 });
```

Decode `b64_json` directly; if a URL is returned, use `fetchProviderUrlSafe()`. Return `_request_id` internally. Never log the instruction, image, signed URL or response body.

- [ ] **Step 7: Normalize the candidate without changing the document box**

Use PNG magic bytes, `sharp(buffer, { limitInputPixels: 40_000_000 })`, metadata format/alpha checks and raw alpha scan. Trim transparent padding, resize with `fit: "contain"` into the immutable source bounds, extend onto a transparent source-sized canvas centered on both axes, and return PNG bytes plus dimensions. Do not alter saved `x/y/width/height`.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/layer-editor/openai-provider.test.ts src/server/layer-editor/artifacts.test.ts && npm run typecheck`

Expected: PASS; tests never contact OpenAI and every invalid/opaque candidate is rejected.

- [ ] **Step 9: Commit the isolated provider seam**

```bash
git add app/src/server/layer-editor/openai-provider.ts app/src/server/layer-editor/openai-provider.test.ts app/src/server/layer-editor/artifacts.ts app/src/server/layer-editor/artifacts.test.ts
git commit -m "feat: add isolated layer regeneration provider"
```

---

### Task 6: Regeneration Claim, Job, Candidate Accept, and Discard

**Files:**
- Create: `app/src/server/application/request-creative-work-layer-regeneration.ts`
- Create: `app/src/server/application/request-creative-work-layer-regeneration.test.ts`
- Create: `app/src/server/jobs/creative-work-layer-regeneration.ts`
- Create: `app/src/server/jobs/creative-work-layer-regeneration.test.ts`
- Modify: `app/src/server/repositories/creative-work-layer-editor.ts`
- Modify: `app/src/server/repositories/creative-work-layer-editor.test.ts`
- Modify: `app/src/server/jobs/heavy-image-events.ts`
- Modify: `app/src/server/ai/image-runtime-config.ts`
- Modify: `app/src/app/api/inngest/route.ts`
- Modify: `app/src/server/jobs/image-worker.ts`
- Modify: `app/src/server/jobs/image-worker.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

**Interfaces:**
- Consumes: lease/CAS repository, `claimLayerEditorQuota()`, saved composition, `LayerRegenerationProvider`, Inngest.
- Produces: `requestCreativeWorkLayerRegeneration()`, `runCreativeWorkLayerRegeneration()`, `acceptLayerCandidate()`, `discardLayerCandidate()` and four job registrations.

- [ ] **Step 1: Write failing request/replay tests**

```ts
it("stores one reserved operation and dispatches once", async () => {
  const first = await requestCreativeWorkLayerRegeneration(input);
  const replay = await requestCreativeWorkLayerRegeneration(input);
  expect(first).toMatchObject({ ok: true, accepted: true });
  expect(replay).toMatchObject({ ok: true, accepted: false, replay: true });
  expect(sendMock).toHaveBeenCalledOnce();
  expect(quotaClaimMock).toHaveBeenCalledOnce();
});
```

Add failures for invalid lease, stale revision, unknown layer, active/ready candidate, quota exhausted and definitive Inngest dispatch failure with idempotent release.

- [ ] **Step 2: Write failing job/CAS tests**

Test one provider call, selected/current bytes plus saved composite, state `processing -> ready`, candidate key under `layer-editor-candidates/`, provider exception after invocation -> `submission_unknown`, invalid alpha -> `failed`, and a late operation unable to replace a newer regeneration id.

- [ ] **Step 3: Run focused tests and verify failures**

Run: `cd app && npm test -- src/server/application/request-creative-work-layer-regeneration.test.ts src/server/jobs/creative-work-layer-regeneration.test.ts src/server/repositories/creative-work-layer-editor.test.ts`

Expected: FAIL because regeneration commands/transitions are missing.

- [ ] **Step 4: Add repository transitions guarded by operation id**

```ts
export async function reserveLayerRegeneration(input: LayerEditorMutationScope & {
  operationId: string;
  layerId: string;
  instruction: string;
  usageKey: string;
  now: Date;
}): Promise<CreativeWorkOutput | null>;

export async function markLayerRegenerationProcessing(input: LayerEditorScope & { operationId: string; now: Date }): Promise<CreativeWorkOutput | null>;
export async function completeLayerRegenerationCandidate(input: LayerEditorScope & { operationId: string; candidateKey: string; providerRequestId: string | null; now: Date }): Promise<CreativeWorkOutput | null>;
export async function failLayerRegeneration(input: LayerEditorScope & { operationId: string; status: "failed" | "submission_unknown"; failureCode: string; now: Date }): Promise<CreativeWorkOutput | null>;
export async function acceptLayerRegenerationCandidate(input: LayerEditorMutationScope & { operationId: string; immutableKey: string; now: Date }): Promise<CreativeWorkOutput | null>;
export async function discardLayerRegenerationCandidate(input: LayerEditorMutationScope & { operationId: string; now: Date }): Promise<CreativeWorkOutput | null>;
```

Every transition checks persisted `regeneration.id`. Accept changes only the selected layer's `currentKey/currentKind`, clears its `restorableKey`, clears regeneration and increments document revision; discard changes no layer and increments revision only to serialize the command.

- [ ] **Step 5: Implement claim and dispatch**

Validate instruction trim length `1..2000`, operation/lease UUIDs, expected revision and layer id. Claim `layer_regeneration_v1` with idempotency key `layer-editor:${workspaceId}:regeneration:${operationId}`; reserve with CAS; dispatch event id `creative-work-layer-regenerate:${outputId}:${operationId}`. Release quota only when reservation or event dispatch is definitively absent.

- [ ] **Step 6: Implement one-run job with no automatic retry**

```ts
const regenerationJobConfig = {
  id: "regenerate-creative-work-layer",
  retries: 0 as const,
};
```

Claim `processing`, re-read and verify operation id, load the selected `currentKey`, render the saved revision composite, call the provider once, normalize into `source.width/source.height`, store at `layer-editor-candidates/${workspaceId}/${workItemId}/${outputId}/${operationId}.png`, then CAS `ready`. If CAS loses, delete that temporary key best effort. Classify OpenAI timeout/connection/abort after invocation as `submission_unknown`; 4xx, missing output and invalid PNG are terminal `failed`; none releases quota.

- [ ] **Step 7: Register both web and worker event names**

Add `creativeWorkLayerRegenerate: "creative-work.layer-regenerate"` to `HEAVY_IMAGE_EVENT_BASES` and the same base to `HEAVY_EVENT_BASES`. Export `creativeWorkLayerRegenerationJob` and `createCreativeWorkLayerRegenerationJobV2`, then register them in `/api/inngest` and `buildImageWorkerConnectOptions()`. Update worker tests to assert the new function id and count.

- [ ] **Step 8: Add strict API actions and storage promotion**

Add `regenerateLayer`, `acceptLayerCandidate` and `discardLayerCandidate` schemas with `outputId`, `leaseId`, `expectedRevision`, `operationId`; regeneration also receives `layerId` and `instruction`.

On accept, copy candidate bytes to `creative-work/${workItemId}/layer-editor/${outputId}/layers/${layerId}/revisions/${expectedRevision + 1}.png`, CAS the document, then delete the temporary candidate best effort. If CAS loses, delete both the temporary candidate and the unreferenced immutable copy best effort. On discard, CAS first and delete the candidate best effort.

- [ ] **Step 9: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/application/request-creative-work-layer-regeneration.test.ts src/server/jobs/creative-work-layer-regeneration.test.ts src/server/repositories/creative-work-layer-editor.test.ts src/server/jobs/image-worker.test.ts 'src/app/api/creative-work/[id]/route.test.ts' && npm run typecheck`

Expected: PASS; late jobs cannot overwrite a newer operation and other layer hashes remain unchanged.

- [ ] **Step 10: Commit the regeneration workflow**

```bash
git add app/src/server/application/request-creative-work-layer-regeneration.ts app/src/server/application/request-creative-work-layer-regeneration.test.ts app/src/server/jobs/creative-work-layer-regeneration.ts app/src/server/jobs/creative-work-layer-regeneration.test.ts app/src/server/repositories/creative-work-layer-editor.ts app/src/server/repositories/creative-work-layer-editor.test.ts app/src/server/jobs/heavy-image-events.ts app/src/server/ai/image-runtime-config.ts app/src/app/api/inngest/route.ts app/src/server/jobs/image-worker.ts app/src/server/jobs/image-worker.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: regenerate one creative layer safely"
```

---

### Task 7: Idempotent Publication as a New Creative Work Version

**Files:**
- Create: `app/src/server/application/publish-creative-work-layer-editor.ts`
- Create: `app/src/server/application/publish-creative-work-layer-editor.test.ts`
- Modify: `app/src/server/repositories/creative-work-layer-editor.ts`
- Modify: `app/src/server/repositories/creative-work-layer-editor.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

**Interfaces:**
- Consumes: deterministic PNG/PSD materialization, existing Creative Work version advisory-lock pattern and editor CAS.
- Produces: `publishCreativeWorkLayerEditor()` and `publishLayerEditor` PATCH action returning one completed, unselected child.

- [ ] **Step 1: Write failing publication tests**

```ts
it("creates one completed unselected child and replays by operation key", async () => {
  const first = await publishCreativeWorkLayerEditor(input);
  const replay = await publishCreativeWorkLayerEditor(input);
  expect(first).toMatchObject({ ok: true, replay: false });
  expect(replay).toMatchObject({ ok: true, replay: true });
  if (first.ok && replay.ok) expect(replay.output.id).toBe(first.output.id);
  expect(insertOutputMock).toHaveBeenCalledOnce();
});
```

Add assertions for live lease, exact revision, pending regeneration, missing key/artifact, stale operation id reused against another parent/revision, and unchanged parent selection.

- [ ] **Step 2: Run tests and verify missing publication command**

Run: `cd app && npm test -- src/server/application/publish-creative-work-layer-editor.test.ts src/server/repositories/creative-work-layer-editor.test.ts 'src/app/api/creative-work/[id]/route.test.ts'`

Expected: FAIL because publication is not implemented.

- [ ] **Step 3: Materialize immutable publication artifacts**

Use keys:

```ts
const prefix = `creative-work/${workItemId}/layer-editor/${outputId}/published/${operationId}`;
const pngKey = `${prefix}/piece.png`;
const psdKey = `${prefix}/piece.psd`;
```

Render from the exact saved revision before the DB transaction. Verify every `currentKey` with `head()`. Deterministic keys make replay safe; a failed transaction leaves overwriteable private artifacts and no visible version.

- [ ] **Step 4: Add one transactional repository function**

```ts
export async function publishCreativeWorkLayerEditorVersion(input: {
  workspaceId: string;
  workItemId: string;
  parentOutputId: string;
  userId: string;
  leaseId: string;
  expectedRevision: number;
  operationId: string;
  outputKey: string;
  psdKey: string;
  rebasedEditor: LayerEditorStateV1;
  now: Date;
}): Promise<{ output: CreativeWorkOutput; replay: boolean } | null>;
```

Inside the transaction, lock the parent row, verify lease/revision/no regeneration, check `operationKey = layer-editor-publish:${operationId}`, acquire the existing version-scope advisory lock, calculate next version for the same direction/format, and insert a row with `status: "completed"`, `isSelected: false`, `quality: null`, `imageCallCount: 0`, `cost: null`, `terminalAt/generationCompletedAt: now`, parent/direction snapshots, PNG key and rebased editor.

- [ ] **Step 5: Rebase the child's source snapshot**

For every layer, copy current `order/name/visible/x/y/width/height/currentKey` into `source`, retain the same public layer id, set `currentKind: "source"` and `restorableKey: null`, clear lease/regeneration, set revision `1`, and set `publishedPsdKey = psdKey`. Parent JSONB and all old keys remain byte-identical.

- [ ] **Step 6: Add and test the PATCH action**

```ts
const publishLayerEditorSchema = z.object({
  action: z.literal("publishLayerEditor"),
  outputId: z.string().uuid(),
  leaseId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  operationId: z.string().uuid(),
}).strict();
```

Return `200` for replay, `201` for a new child, `409 layer_editor_publish_conflict` for stale state and `409 layer_editor_artifact_missing` for absent assets. Do not auto-select or call the existing approval command.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/application/publish-creative-work-layer-editor.test.ts src/server/repositories/creative-work-layer-editor.test.ts 'src/app/api/creative-work/[id]/route.test.ts' && npm run typecheck`

Expected: PASS; sequential/concurrent replay returns one child and the selected parent remains selected until existing approval selects the child.

- [ ] **Step 8: Commit version publication**

```bash
git add app/src/server/application/publish-creative-work-layer-editor.ts app/src/server/application/publish-creative-work-layer-editor.test.ts app/src/server/repositories/creative-work-layer-editor.ts app/src/server/repositories/creative-work-layer-editor.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: publish layer edits as new versions"
```

---

### Task 8: Session Reducer, Undo/Redo, Autosave, and Heartbeat Hook

**Files:**
- Create: `app/src/components/creative-work/layer-editor/state.ts`
- Create: `app/src/components/creative-work/layer-editor/state.test.ts`
- Create: `app/src/components/creative-work/layer-editor/useLayerEditor.ts`
- Create: `app/src/components/creative-work/layer-editor/useLayerEditor.test.tsx`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.ts`

**Interfaces:**
- Consumes: all safe editor PATCH actions and `PublicLayerEditorDocumentV1`.
- Produces: `LayerEditorCommand`, `LayerEditorSessionState`, `applyLayerEditorCommand()`, `useLayerEditor()`.

- [ ] **Step 1: Write failing reducer tests**

```ts
it("groups one drag into one undo step and clamps it to the canvas", () => {
  const moved = applyLayerEditorCommand(session, {
    type: "transform",
    layerId: "layer-a",
    transform: { x: 9999, y: 9999, width: 200, height: 100 },
  });
  expect(moved.present.layers[0]).toMatchObject({ x: 880, y: 980 });
  expect(undoLayerEditor(moved).present.layers[0]).toMatchObject({ x: 10, y: 20 });
});

it("restores every source field and keeps only fifty undo commands", () => {
  const restored = applyLayerEditorCommand(changedSession, { type: "restore-layer", layerId: "layer-a" });
  expect(restored.present.layers[0]).toMatchObject(changedSession.present.layers[0]?.source);
  expect(runRenameCommands(restored, 60).past).toHaveLength(50);
});
```

- [ ] **Step 2: Write failing hook tests with fake timers**

Test no save before 749 ms, one save at 750 ms, serial save when a second command lands during the first request, heartbeat every 30 seconds, signed URL refresh, inspect mode with no heartbeat/save, 409 conflict -> read-only, polling only during active regeneration, and release after a successful flush.

- [ ] **Step 3: Run tests and verify missing modules**

Run: `cd app && npm test -- src/components/creative-work/layer-editor/state.test.ts src/components/creative-work/layer-editor/useLayerEditor.test.tsx src/lib/hooks/use-creative-work.test.ts`

Expected: FAIL because reducer and hook do not exist.

- [ ] **Step 4: Implement the command union and bounded history**

```ts
export type LayerEditorCommand =
  | { type: "rename"; layerId: string; name: string }
  | { type: "visibility"; layerId: string; visible: boolean }
  | { type: "reorder"; layerId: string; order: number }
  | { type: "transform"; layerId: string; transform: { x: number; y: number; width: number; height: number } }
  | { type: "restore-layer"; layerId: string }
  | { type: "restore-all" };

export type LayerEditorSessionState = {
  past: PublicLayerEditorDocumentV1[];
  present: PublicLayerEditorDocumentV1;
  future: PublicLayerEditorDocumentV1[];
};
```

Normalize names with trim and max 128, maintain a contiguous order permutation, reinsert restored order while shifting neighbors, round transforms to integer pixels, enforce positive dimensions and keep the entire box inside the immutable canvas. Restore copies every public source field and `source.imageUrl`, sets `currentKind: "source"`, and snapshot serialization sends `useSource: currentKind === "source"`. Push one snapshot per completed command and drop oldest history above 50.

- [ ] **Step 5: Implement `useLayerEditor` with serial persistence**

```ts
export function useLayerEditor(input: {
  workItemId: string;
  outputId: string;
  mode: "inspect" | "edit";
  open: boolean;
}): {
  document: PublicLayerEditorDocumentV1 | null;
  access: LayerEditorAccessV1 | null;
  selectedLayerId: string | null;
  mode: "inspect" | "edit" | "read";
  saveState: "idle" | "saving" | "saved" | "error";
  dispatch(command: LayerEditorCommand): void;
  undo(): void;
  redo(): void;
  selectLayer(id: string): void;
  regenerate(layerId: string, instruction: string): Promise<void>;
  acceptCandidate(operationId: string): Promise<void>;
  discardCandidate(operationId: string): Promise<void>;
  exportDraft(format: "draft-png" | "draft-psd"): Promise<boolean>;
  publish(): Promise<CreativeWorkOutput>;
  flushAndRelease(): Promise<boolean>;
};
```

Open via PATCH, keep server revision separately from the local snapshot, debounce 750 ms, serialize saves through one promise chain, and schedule a follow-up save when local state changed during an in-flight save. Retain operation ids across uncertain network errors; clear them only after a confirmed terminal response.

`exportDraft()` and `publish()` first await the same autosave flush. Export synchronously opens an `about:blank` window from the click handler, flushes, then navigates that window to the scoped download URL with the confirmed server revision; close it if flush fails. Publish sends the confirmed revision, retains its `operationId` until a confirmed response, then releases the parent lease and closes the overlay best effort after a successful new/replayed child response.

- [ ] **Step 6: Add heartbeat, polling, and conflict behavior**

Heartbeat every 30 seconds only while `mode === "edit"` and the tab is visible. Replace image/candidate URLs from heartbeat responses. Poll `openLayerEditor` every 2 seconds only for `reserved` or `processing`. On `409 layer_editor_locked` or `layer_editor_revision_conflict`, stop timers/autosave, preserve the local document for copying and switch to `read`.

- [ ] **Step 7: Add mutation helpers to the existing hook module**

Keep `patchJson()` private and export typed functions used by `useLayerEditor` for open, heartbeat, save, release, regenerate, accept, discard and publish. Extend `CreativeWorkOutput` with `layerEditor: PublicLayerEditorSummaryV1 | null` and `CreativeWorkDetail` with `layerEditorAccess: LayerEditorAccessV1`.

- [ ] **Step 8: Run hook/reducer tests and typecheck**

Run: `cd app && npm test -- src/components/creative-work/layer-editor/state.test.ts src/components/creative-work/layer-editor/useLayerEditor.test.tsx src/lib/hooks/use-creative-work.test.ts && npm run typecheck`

Expected: PASS; autosave never runs concurrently and losing the lease cannot overwrite server state.

- [ ] **Step 9: Commit the client state engine**

```bash
git add app/src/components/creative-work/layer-editor/state.ts app/src/components/creative-work/layer-editor/state.test.ts app/src/components/creative-work/layer-editor/useLayerEditor.ts app/src/components/creative-work/layer-editor/useLayerEditor.test.tsx app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.ts
git commit -m "feat: add layer editor session state"
```

---

### Task 9: Full-Screen Native Layer Editing Surface

**Files:**
- Create: `app/src/components/creative-work/layer-editor/LayerCanvas.tsx`
- Create: `app/src/components/creative-work/layer-editor/LayerPanel.tsx`
- Create: `app/src/components/creative-work/layer-editor/LayerRegenerationPanel.tsx`
- Create: `app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx`
- Create: `app/src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx`
- Modify: `app/src/components/ui/dialog.tsx:31-66`

**Interfaces:**
- Consumes: `useLayerEditor()`, Pointer Events, existing Button/Dialog/tokens.
- Produces: `LayerEditorDialog` with desktop/tablet edit and mobile inspect modes.

- [ ] **Step 1: Write failing interaction/accessibility tests**

```tsx
it("moves the selected layer with keyboard and announces autosave", async () => {
  render(<LayerEditorDialog open workItemId="work-1" outputId="output-1" onOpenChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Perfume bottle" }));
  await user.keyboard("{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
  expect(dispatchMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "transform" }));
  expect(screen.getByRole("status")).toHaveTextContent("Salvando");
});

it("renders mobile as inspect-only", () => {
  mobileMock.mockReturnValue(true);
  render(<LayerEditorDialog open workItemId="work-1" outputId="output-1" onOpenChange={vi.fn()} />);
  expect(openMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "inspect" }));
  expect(screen.queryByRole("button", { name: "Criar nova versão" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Separar em camadas" })).not.toBeInTheDocument();
});
```

Add tests for focus trap/return, Escape through `flushAndRelease`, 44 px tablet targets, reorder buttons, rename, visibility, undo/redo shortcuts, restore confirmation, candidate preview before accept and read-only lock banner.

- [ ] **Step 2: Run component tests and verify missing surface**

Run: `cd app && npm test -- src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx`

Expected: FAIL because the editor components do not exist.

- [ ] **Step 3: Add a full variant to the existing Dialog primitive**

```ts
size: {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "inset-0 h-dvh max-h-dvh rounded-none sm:inset-4 sm:h-[calc(100dvh-2rem)] sm:max-h-none sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-[var(--radius-overlay)]",
},
```

Use `size="full"`, preserve the existing portal/backdrop/focus trap and set `showCloseButton={false}` so the editor header owns one labeled close control.

- [ ] **Step 4: Build `LayerCanvas` with native images and transforms**

Render a checkerboard viewport and a canvas scaled by `zoom`. Render layers back-to-front with one absolute `<img draggable={false}>` per visible layer. Map client deltas through `1 / zoom`; on pointer-up dispatch one `transform` command. Draw the selected bounding box with four corner handles and no canvas dependency.

Keyboard contract on the selected layer:

- Arrow: move 1 px.
- Shift+Arrow: move 10 px.
- Alt+Left/Right: shrink/grow width 1 px.
- Alt+Up/Down: shrink/grow height 1 px.
- Shift+Alt+Arrow: resize 10 px.

Disable pointer/keyboard transforms unless hook mode is `edit`.

Add local-only zoom controls for 25%, 50%, 75%, 100%, 150% and 200%. Zoom changes only viewport scale and never enters undo/autosave.

- [ ] **Step 5: Build `LayerPanel` with accessible ordering**

Show thumbnail, current name, dimensions, visibility and selection. Rename commits on blur/Enter and cancels on Escape. Implement tablet-safe reordering with Pointer Events: capture the row pointer, identify the nearest row midpoint on move, and dispatch one reorder command on release. Provide “Trazer para frente” and “Enviar para trás” buttons as the keyboard alternative; all paths keep `order` contiguous. Temporary mobile visibility lives in component state and never calls `dispatch`.

- [ ] **Step 6: Build `LayerRegenerationPanel` with explicit confirmation**

Show remaining monthly quota, instruction length, selected layer and a confirmation step before `regenerate()`. While reserved/processing, disable a second request. For `ready`, render candidate beside current isolated layer with `Aceitar` and `Descartar`; for `submission_unknown`, explain that a call may have happened and require a new explicit confirmation/operation id.

- [ ] **Step 7: Compose the approved high-fidelity overlay**

Use a fixed header with close, title/format/count, saved state, undo/redo, restore, export and publish. Body uses `grid-cols-[3.5rem_minmax(0,1fr)_22rem]` at desktop, `grid-cols-[3rem_minmax(0,1fr)_18rem]` on tablet and a stacked inspect layout on mobile. Keep the canvas dominant, the right panel independently scrollable, and every mutation control at least 44 px on tablet.

Register dialog-level shortcuts only outside text inputs: `Cmd/Ctrl+Z` dispatches undo and `Shift+Cmd/Ctrl+Z` dispatches redo. Prevent the browser default only when the editor handles the command.

- [ ] **Step 8: Handle close and live regions safely**

All close paths call `flushAndRelease()`; failed flush keeps the dialog open and focuses an alert. Use one polite live region for save/job/candidate and one assertive alert for lock/conflict. After accept/discard return focus to regeneration; after closing return focus to the originating CTA through Base UI Dialog.

- [ ] **Step 9: Run component tests and typecheck**

Run: `cd app && npm test -- src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx && npm run typecheck`

Expected: PASS in desktop, tablet and mocked-mobile states without a canvas package.

- [ ] **Step 10: Commit the editor surface**

```bash
git add app/src/components/ui/dialog.tsx app/src/components/creative-work/layer-editor/LayerCanvas.tsx app/src/components/creative-work/layer-editor/LayerPanel.tsx app/src/components/creative-work/layer-editor/LayerRegenerationPanel.tsx app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx app/src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx
git commit -m "feat: add native full-screen layer editor"
```

---

### Task 10: Results-Flow Integration, Confirmation Copy, and Responsive Entry

**Files:**
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/components/creative-work/CreativeResultCard.tsx`
- Modify: `app/src/components/creative-work/CreativeResultCard.test.tsx`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**
- Consumes: safe editor summary/access, `LayerEditorDialog`, existing Results card/grid/composer.
- Produces: Layerize confirmation, `Editar camadas`/`Visualizar camadas` entry and localized typed errors.

- [ ] **Step 1: Write failing result-card/grid tests**

```tsx
it("confirms quota before starting Layerize", async () => {
  render(<CreativeResultCard {...props} layerEditorAccess={accessWithThreeLayerizes} />);
  await user.click(screen.getByRole("button", { name: "Separar em camadas" }));
  expect(onLayerize).not.toHaveBeenCalled();
  expect(screen.getByText("3 separações restantes neste mês")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirmar separação" }));
  expect(onLayerize).toHaveBeenCalledWith("output-1");
});

it("opens the editor instead of replacing the Results route", async () => {
  render(<CreativeProposalGrid {...gridProps} outputs={[layerizedOutput]} />);
  await user.click(screen.getByRole("button", { name: "Editar camadas" }));
  expect(screen.getByRole("dialog", { name: /editor de camadas/i })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
});
```

- [ ] **Step 2: Run integration-facing component tests and verify failure**

Run: `cd app && npm test -- src/components/creative-work/CreativeResultCard.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/creative-work/useCreativeComposer.test.tsx 'src/app/api/creative-work/[id]/route.test.ts'`

Expected: FAIL because entry props, summary and copy are missing.

- [ ] **Step 3: Add safe editor summary to the common GET**

Project only:

```ts
layerEditor: toPublicLayerEditorSummary(output.layerEditor),
```

The summary contains `revision`, `layerCount`, `updatedAt` and safe regeneration status; it contains no layers, keys, lease user id, prompt or URLs. Keep the full document behind `openLayerEditor`.

- [ ] **Step 4: Update Result card states**

- Selected completed output without Layerize: show `Separar em camadas` when entitlement/provider are enabled.
- Active Layerize: show its current durable state.
- Completed Layerize or any editor summary on a selected output: show primary `Editar camadas` plus PSD export.
- Completed unselected child with editor summary: show `Visualizar camadas`; existing approval remains separate.
- Diagnostic ZIP is removed from ordinary member UI.
- Exhausted Layerize quota keeps inspect/edit/export visible and disables only a new external attempt.
- On mobile, hide `Separar em camadas`; mobile can inspect/export an existing document but cannot initiate Layerize or regeneration.

- [ ] **Step 5: Add confirmation and stable Layerize operation ids**

Create `operationId = crypto.randomUUID()` when the confirmation opens. Reuse it until a confirmed response; retain it on uncertain timeout and clear it after accepted/typed terminal response. Pass it through `useLayerizeOutput()`. Disable confirmation submit while the mutation is pending.

- [ ] **Step 6: Mount one editor overlay in `CreativeProposalGrid`**

Track `layerEditorOutputId`, derive `mode = useIsMobile() || !selected.isSelected ? "inspect" : "edit"`, close the annotation dialog before opening the layer editor, and render one `LayerEditorDialog` adjacent to the existing annotation `Dialog`. Closing returns to the same result card/thumbnail.

- [ ] **Step 7: Add exact pt-BR/en copy and API error keys**

Add labels for editor title, saved/saving/error, layers, visibility, order, restore, export PNG/PSD, quota confirmation, regenerate, candidate accept/discard, lock/read-only, conflict, submission unknown, mobile inspect and publication. Add `errors` keys for `layer_editor_not_available`, `layer_editor_quota_exhausted`, `layer_editor_locked`, `layer_editor_revision_conflict`, `layer_regeneration_dispatch_failed`, `layer_regeneration_provider_failed`, `layer_regeneration_invalid_asset`, `layer_regeneration_submission_unknown`, `layer_editor_artifact_missing` and `layer_editor_publish_conflict` in both locales.

- [ ] **Step 8: Run component/route tests and typecheck**

Run: `cd app && npm test -- src/components/creative-work/CreativeResultCard.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/creative-work/useCreativeComposer.test.tsx 'src/app/api/creative-work/[id]/route.test.ts' && npm run typecheck`

Expected: PASS; no new route/page is introduced and mobile never sends an edit command.

- [ ] **Step 9: Commit Results integration**

```bash
git add 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/components/creative-work/CreativeResultCard.tsx app/src/components/creative-work/CreativeResultCard.test.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx app/src/components/creative-work/useCreativeComposer.ts app/src/components/creative-work/useCreativeComposer.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: open layer editor from creative results"
```

---

### Task 11: End-to-End Journey, Visual Gate, Runbook, and Final Verification

**Files:**
- Create: `app/tests/integration/creative-work-layer-editor-journey.test.ts`
- Create: `app/scripts/seed-layer-editor-e2e.ts`
- Create: `app/tests/e2e/layer-editor.spec.ts`
- Modify: `app/package.json`
- Modify: `app/playwright.config.ts`
- Modify: `docs/creative-work-layerization-runbook.md`

**Interfaces:**
- Consumes: complete server/client flow, fixture DB, object storage and provider fake.
- Produces: reproducible no-paid evidence, screenshots and operational instructions.

- [ ] **Step 1: Write the failing integration journey**

Seed a workspace entitlement, two members, one selected completed output, two synthetic RGBA layers and completed Layerize state. Prove in one test:

1. member A opens edit and gets the lease;
2. member B opens read-only;
3. A renames/reorders/moves/resizes/saves;
4. regeneration claims one unit and a provider fake writes one candidate;
5. accepting changes only the chosen layer key/hash;
6. publication creates one unselected child;
7. existing approval selects the child;
8. original, parent, source and untouched layer hashes are unchanged;
9. private fields are absent from every public response;
10. generated PNG/PSD open and match the saved geometry.

- [ ] **Step 2: Run the integration journey and verify it fails before the fixture exists**

Run: `cd app && npm test -- tests/integration/creative-work-layer-editor-journey.test.ts`

Expected: FAIL until the test fixture/fake is wired to the completed feature.

- [ ] **Step 3: Implement the deterministic E2E seed**

`seed-layer-editor-e2e.ts` reuses the existing local E2E user/workspace, upserts `layer_editor_v1` with limits `{ layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 5 }`, uploads only generated Sharp PNGs, creates a completed selected output with completed Layerize, and writes `tests/fixtures/layer-editor-e2e.json` with ids/login only. Add:

```json
"seed:layer-editor-e2e": "tsx scripts/seed-layer-editor-e2e.ts"
```

No production key, provider call, user asset or signed URL is written to the fixture.

- [ ] **Step 4: Add Playwright desktop/tablet/mobile coverage**

In `layer-editor.spec.ts`:

- Desktop 1440×1000: open overlay, select, rename, hide/show, reorder, move, resize, undo, redo, save, reload and compare persisted geometry.
- Tablet 900×1100: verify 44 px targets and Pointer Events edit.
- Mobile 390×844: verify inspect/export only and no mutation request.
- Seeded ready candidate: preview current/candidate before accept.
- Seeded foreign lease: read-only banner and disabled mutation controls.
- Exhausted regeneration quota: editing/export remain enabled while regenerate is disabled.

Use `expect(page).toHaveScreenshot()` for approved overlay, candidate, read-only and mobile states with animations disabled and synthetic image fixtures.

- [ ] **Step 5: Register the focused Playwright flow**

Add `layer-editor` to the serial-flow `testMatch` regex in `playwright.config.ts`. Run seed and then:

Run: `cd app && npm run seed:layer-editor-e2e && npm run test:e2e -- tests/e2e/layer-editor.spec.ts --project=serial-flows`

Expected: PASS with no network request to OpenAI or Atlas.

- [ ] **Step 6: Update the runbook with exact operations**

Document:

- owner/ops SQL upsert for `kind = 'layer_editor_v1'` with both nonnegative monthly limits;
- verification query for monthly `layerize_v1` and `layer_regeneration_v1` sums;
- R2 lifecycle requirement: delete prefix `layer-editor-candidates/` after 24 hours;
- candidate best-effort cleanup and immutable accepted/published prefixes;
- lease takeover/revision conflict recovery;
- `submission_unknown` with no automatic retry;
- local fake-provider validation;
- deploy health, authenticated smoke, paid smoke and human PSD review as separate gates;
- explicit statement that implementation does not authorize entitlement activation, paid calls or deploy.
- provider contract/retention review before any customer asset leaves ADScale;
- any later paid smoke uses one owned/synthetic asset, one call, zero retries, an explicit cap and the billed cost actually observed rather than catalog pricing.

- [ ] **Step 7: Run the complete local gate**

Run:

```bash
cd app
npm test -- src/server/layer-editor src/server/repositories/creative-work-layer-editor.test.ts src/server/application/manage-creative-work-layer-editor.test.ts src/server/application/request-creative-work-layer-regeneration.test.ts src/server/application/publish-creative-work-layer-editor.test.ts src/server/jobs/creative-work-layer-regeneration.test.ts src/components/creative-work/layer-editor tests/integration/creative-work-layer-editor-quota.test.ts tests/integration/creative-work-layer-editor-journey.test.ts
npm run typecheck
npm run lint
```

Expected: all focused tests, typecheck and lint PASS. Record unrelated broad-suite failures separately without weakening the focused result.

- [ ] **Step 8: Refresh the code graph and inspect the final diff**

Run:

```bash
graphify update .
git diff --check
git status --short
git diff --stat
```

Expected: graph updated, no whitespace errors, no secrets/binary user assets, and only planned files plus pre-existing unrelated WIP.

- [ ] **Step 9: Commit the no-paid acceptance gate**

```bash
git add app/tests/integration/creative-work-layer-editor-journey.test.ts app/scripts/seed-layer-editor-e2e.ts app/tests/e2e/layer-editor.spec.ts app/tests/e2e/layer-editor.spec.ts-snapshots app/package.json app/playwright.config.ts docs/creative-work-layerization-runbook.md graphify-out
git commit -m "test: verify native layer editor journey"
```

- [ ] **Step 10: Stop at authorization boundaries**

Report separately: focused/local tests, broad suite, authenticated browser visual, deploy/health, authenticated app smoke, paid provider evidence and human PSD approval. Do not deploy, activate an entitlement, change a secret, invoke OpenAI/Atlas or mark release-ready without explicit authorization for that exact gate.
