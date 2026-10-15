import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "@/server/equipe/module/commands";
import { ctx, deliverTestBatch, setup } from "@/server/equipe/module/testing/items";
import { createAdjustmentEvidenceHandler } from "@/server/equipe/jobs/adjustment-evidence";
import { createAgentWorkOutboxHandler } from "@/server/equipe/jobs/agent-work-outbox";
import { CAPTION_EVIDENCE_EVENT, CAPTION_EVIDENCE_TASK_EVENT, consumeCaptionEvidence, listCaptionEvidenceForBrand } from "@/server/equipe/module/caption-evidence";

const authorize = async () => ({ allowed: true as const });

async function fixture(agent = false) {
  const { t, ids } = await setup();
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{ caption: "Legenda original" }] });
  const itemId = itemIds[0];
  if (agent) {
    const adjustment = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment", payload: { itemId, expectedVersionHash: versionHashes[0], category: "voice" },
    });
    if (!adjustment.ok) throw new Error(adjustment.error.code);
  }
  const result = await executeCommand(t.deps, ctx(ids, agent ? ids.actors.agent : ids.actors.approver), {
    type: agent ? "submit_item_version" : "edit_caption",
    payload: { itemId, expectedVersionHash: versionHashes[0], caption: "Legenda editada" },
  });
  if (!result.ok) throw new Error(result.error.code);
  const source = result.value.events.find(e => e.eventType === (agent ? "item.version_submitted" : "caption.edited"))!;
  return { t, ids, scope, itemId, source, previousVersionHash: versionHashes[0],
    versionHash: result.value.data.versionHash, deps: { uow: t.deps.uow, authorize },
    brandScope: { workspaceId: ids.workspaceId, clientProfileId: ids.profileId } };
}

describe("caption evidence from immutable Item versions", () => {
  it("delivers a human edit through the durable outbox and resolves its original versions on replay", async () => {
    const f = await fixture();
    const receipts = await f.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId);
    await f.deps.uow.repos.itemVersions.create(f.scope, { itemId: f.itemId, versionHash: "later",
      caption: "Texto atual diferente", authorRole: "agent" });
    await f.deps.uow.repos.items.update(f.scope, f.itemId, { currentVersionHash: "later" });
    const item = await f.deps.uow.repos.items.get(f.scope, f.itemId);
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn(), sendEvent: vi.fn() };
    const outbox = createAgentWorkOutboxHandler({ uow: f.deps.uow, clock: f.t.deps.clock, gatewayFor: () => f.t.gateway });
    await outbox({ step });
    const sent = step.sendEvent.mock.calls.map(([, event]) => event).find(e => e.data.sourceEventId === f.source.id);
    expect(sent).toBeDefined();
    const handler = createAdjustmentEvidenceHandler(f.deps);
    expect(await handler({ event: sent, step })).toMatchObject({ recorded: true });
    await handler({ event: sent, step });
    const evidence = await listCaptionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ sourceEventId: f.source.id, itemId: f.itemId, authorType: "equipe_actor",
      actorType: "client_person", actorId: f.source.actorId, actorRole: "approver",
      before: { versionHash: f.previousVersionHash, caption: "Legenda original" },
      after: { versionHash: f.versionHash, caption: "Legenda editada" } });
    const [stored] = await f.deps.uow.repos.events.list(f.scope, { eventType: CAPTION_EVIDENCE_EVENT });
    expect(stored.payload).toEqual({ sourceEventId: f.source.id, clientProfileId: f.ids.profileId,
      itemId: f.itemId, previousVersionHash: f.previousVersionHash, versionHash: f.versionHash });
    expect(await f.deps.uow.repos.items.get(f.scope, f.itemId)).toEqual(item);
    expect(await f.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId)).toEqual(receipts);
  });

  it("records an agent's submitted version as agent evidence, never as a human decision", async () => {
    const f = await fixture(true);
    await consumeCaptionEvidence(f.deps, f.scope, f.source.id);
    await consumeCaptionEvidence(f.deps, f.scope, f.source.id);
    const evidence = await listCaptionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ authorType: "agent", actorType: "agent", actorId: f.source.actorId,
      actorRole: "agent", before: { caption: "Legenda original" }, after: { caption: "Legenda editada", authorRole: "agent" } });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "item.approved" })).toEqual([]);
    expect(await f.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId)).toEqual([]);
  });

  it.each(["previousVersionHash", "versionHash", "actorId", "actorRole", "before", "after", "author"])("keeps a historical limitation for missing or unrelated %s", async missing => {
    const f = await fixture();
    const source = { ...f.source, payload: { ...f.source.payload as Record<string, unknown> } };
    if (missing === "previousVersionHash" || missing === "versionHash") delete source.payload[missing];
    if (missing === "actorId" || missing === "actorRole") source[missing] = null;
    if (missing === "before") source.payload.previousVersionHash = "not-in-this-item";
    if (missing === "after") source.payload.versionHash = "not-in-this-item";
    if (missing === "author") source.actorId = "unrelated-person";
    f.t.store.events.rows.set(source.id, source);
    expect(await consumeCaptionEvidence(f.deps, f.scope, source.id)).toBeNull();
    expect(await listCaptionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
  });

  it("denies capture and reading and isolates workspace, account, Item and brand", async () => {
    const f = await fixture();
    const denied = { ...f.deps, authorize: async () => ({ allowed: false as const, reason: "local_learning_denied" as const }) };
    await expect(consumeCaptionEvidence(denied, f.scope, f.source.id)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: CAPTION_EVIDENCE_EVENT })).toEqual([]);
    for (const field of ["workspaceId", "accountId"] as const) {
      expect(await consumeCaptionEvidence(f.deps, { ...f.scope, [field]: crypto.randomUUID() }, f.source.id)).toBeNull();
    }
    const [otherItem] = (await deliverTestBatch(f.t, f.ids, { items: [{}] })).itemIds;
    f.t.store.events.rows.set(f.source.id, { ...f.source, objectId: otherItem });
    expect(await consumeCaptionEvidence(f.deps, f.scope, f.source.id)).toBeNull();
    f.t.store.events.rows.set(f.source.id, f.source);
    await consumeCaptionEvidence(f.deps, f.scope, f.source.id);
    expect(await listCaptionEvidenceForBrand(f.deps, { ...f.brandScope, clientProfileId: crypto.randomUUID() })).toEqual([]);
    await expect(listCaptionEvidenceForBrand(denied, f.brandScope)).rejects.toMatchObject({ reason: "local_learning_denied" });
  });

  it("serializes redelivery and dispatches committed evidence on a closed account", async () => {
    const f = await fixture();
    await f.deps.uow.repos.accounts.update(f.scope.workspaceId, f.scope.accountId, { status: "closed" });
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn(), sendEvent: vi.fn() };
    const outbox = createAgentWorkOutboxHandler({ uow: f.deps.uow, clock: f.t.deps.clock, gatewayFor: () => f.t.gateway });
    expect(await outbox({ step })).toEqual({ emitted: 1 });
    const sent = step.sendEvent.mock.calls[0][1];
    expect(sent).toMatchObject({ name: CAPTION_EVIDENCE_TASK_EVENT, data: { ...f.scope, sourceEventId: f.source.id } });
    const handler = createAdjustmentEvidenceHandler(f.deps);
    await Promise.all([handler({ event: sent, step }), handler({ event: sent, step })]);
    expect(await listCaptionEvidenceForBrand(f.deps, f.brandScope)).toHaveLength(1);
    expect(await handler({ event: { data: { ...sent.data, sourceEventId: crypto.randomUUID() } }, step })).toEqual({ recorded: false, evidenceId: null });
  });

  it("omits unavailable immutable versions instead of falling back to current text", async () => {
    const f = await fixture();
    await consumeCaptionEvidence(f.deps, f.scope, f.source.id);
    const version = await f.deps.uow.repos.itemVersions.getByHash(f.scope, f.itemId, f.previousVersionHash);
    f.t.store.itemVersions.rows.delete(version!.id);
    expect(await listCaptionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
  });

  it("rolls back the edit if its durable evidence intent cannot be stored", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{}] });
    const before = await t.deps.uow.repos.items.get(scope, itemIds[0]);
    const events = await t.deps.uow.repos.events.list(scope);
    const versions = await t.deps.uow.repos.itemVersions.list(scope);
    const run = t.deps.uow.run.bind(t.deps.uow);
    t.deps.uow.run = fn => run((repos, internal) => fn({ ...repos, taskOutbox: { ...repos.taskOutbox,
      create: async () => { throw new Error("outbox unavailable"); },
    } }, internal));
    await expect(executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption",
      payload: { itemId: itemIds[0], expectedVersionHash: versionHashes[0], caption: "Mudança" },
    })).rejects.toThrow("outbox unavailable");
    expect(await t.deps.uow.repos.items.get(scope, itemIds[0])).toEqual(before);
    expect(await t.deps.uow.repos.events.list(scope)).toEqual(events);
    expect(await t.deps.uow.repos.itemVersions.list(scope)).toEqual(versions);
  });
});
