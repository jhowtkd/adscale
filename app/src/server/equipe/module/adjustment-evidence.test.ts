import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, setup } from "./testing/items";
import { ADJUSTMENT_EVIDENCE_EVENT, consumeAdjustmentEvidence, listAdjustmentEvidenceForBrand } from "./adjustment-evidence";
import { createAgentWorkOutboxHandler } from "../jobs/agent-work-outbox";

const record = vi.hoisted(() => vi.fn());
vi.mock("@/server/output-learning/output-decision-recorder", () => ({ recordLocalLearningDecisionEvidence: record }));
const authorize = vi.fn(async () => ({ allowed: true as const }));
beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue({ id: crypto.randomUUID() });
});

async function fixture() {
  const { t, ids } = await setup();
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{}] });
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "request_adjustment", payload: { itemId: itemIds[0], category: "voice", note: "Mais direto" },
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  const source = outcome.value.events.find(event => event.eventType === "agent_work.requested")!;
  return { t, ids, scope, source, itemId: itemIds[0]!, versionHash: versionHashes[0]!, deps: { uow: t.deps.uow, authorize } };
}

describe("confirmed adjustment evidence", () => {
  it("records one attributed correction on replay without changing operational state or receipts", async () => {
    const f = await fixture();
    const before = await f.t.deps.uow.repos.items.get(f.scope, f.itemId);
    const receipts = await f.t.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId);
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    const evidence = await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ sourceEventId: f.source.id, itemId: f.itemId,
      category: "voice", note: "Mais direto", versionHash: f.versionHash,
      actorType: "client_person", actorId: f.source.actorId, actorRole: "approver" });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ userId: null, authorType: "equipe_actor",
      equipeEventId: f.source.id, actorId: f.source.actorId, actorRole: "approver", action: "regenerated",
      snapshotExtras: expect.objectContaining({ itemId: f.itemId, itemVersionHash: f.versionHash }) }), authorize);
    expect(await f.t.deps.uow.repos.items.get(f.scope, f.itemId)).toEqual(before);
    expect(await f.t.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId)).toEqual(receipts);
  });

  it("consumes completed requests on closed accounts through the existing outbox sweep", async () => {
    const f = await fixture();
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", eventType: "agent_work.completed",
      objectType: "agent_work", objectId: f.source.id, payload: { sourceEventId: f.source.id } });
    await f.t.deps.uow.repos.accounts.update(f.scope.workspaceId, f.scope.accountId, { status: "closed" });
    const handler = createAgentWorkOutboxHandler({ uow: f.deps.uow, clock: f.t.deps.clock,
      gatewayFor: () => f.t.gateway, authorizeLocalLearning: authorize });
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn(), sendEvent: vi.fn() };
    await handler({ step });
    await handler({ step });
    expect(await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).toHaveLength(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("resolves the immutable requested version after a newer version becomes current", async () => {
    const f = await fixture();
    const version = await f.t.deps.uow.repos.itemVersions.getByHash(f.scope, f.itemId, f.versionHash);
    await f.t.deps.uow.repos.itemVersions.create(f.scope, { itemId: f.itemId, versionHash: "new-hash",
      creativeWorkOutputId: crypto.randomUUID(), caption: "Legenda nova", authorRole: "agent" });
    await f.t.deps.uow.repos.items.update(f.scope, f.itemId, { currentVersionHash: "new-hash" });
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ creativeWorkOutputId: version!.creativeWorkOutputId }), authorize);
    const [evidence] = await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(evidence.versionHash).toBe(f.versionHash);
  });

  it("keeps a typed evidence reference without Peça and sanitizes untrusted notes", async () => {
    const f = await fixture();
    const version = await f.t.deps.uow.repos.itemVersions.getByHash(f.scope, f.itemId, f.versionHash);
    f.t.store.itemVersions.rows.set(version!.id, { ...version!, creativeWorkOutputId: null });
    f.t.store.events.rows.set(f.source.id, { ...f.source, payload: { kind: "adjustment", category: "brand",
      note: "DATABASE_URL=postgres://secret", versionHash: f.versionHash } });
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    const [evidence] = await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(evidence).toMatchObject({ sourceEventId: f.source.id, creativeWorkOutputId: null,
      outputDecisionEventId: null, note: null, evidenceSanitized: true });
    expect(record).not.toHaveBeenCalled();
  });

  it.each(["actorId", "actorRole", "versionHash", "version"])("retains historical limitations for missing %s despite neighboring authored events", async missing => {
    const f = await fixture();
    const source = { ...f.source };
    if (missing === "actorId" || missing === "actorRole") source[missing] = null;
    if (missing === "versionHash") source.payload = { kind: "adjustment", category: "voice", note: "Mais direto" };
    if (missing === "version") source.payload = { kind: "adjustment", category: "voice", versionHash: "unknown" };
    f.t.store.events.rows.set(source.id, source);
    expect(await consumeAdjustmentEvidence(f.deps, f.scope, source.id)).toBeNull();
    expect(await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).toEqual([]);
    expect(record).not.toHaveBeenCalled();
  });

  it("denies capture and reading through the same authorization port", async () => {
    const f = await fixture();
    const denied = { uow: f.deps.uow, authorize: vi.fn(async () => ({ allowed: false as const, reason: "local_learning_denied" as const })) };
    await expect(consumeAdjustmentEvidence(denied, f.scope, f.source.id)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: ADJUSTMENT_EVIDENCE_EVENT })).toEqual([]);
    expect(record).not.toHaveBeenCalled();
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    await expect(listAdjustmentEvidenceForBrand(denied, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).rejects.toMatchObject({ reason: "local_learning_denied" });
  });

  it("serializes concurrent redelivery and isolates evidence by workspace and brand", async () => {
    const f = await fixture();
    await Promise.all([consumeAdjustmentEvidence(f.deps, f.scope, f.source.id), consumeAdjustmentEvidence(f.deps, f.scope, f.source.id)]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: crypto.randomUUID() })).toEqual([]);
    expect(await consumeAdjustmentEvidence(f.deps, { ...f.scope, workspaceId: crypto.randomUUID() }, f.source.id)).toBeNull();
  });

  it("a failed projection stays retryable and does not stop business work dispatch", async () => {
    const f = await fixture();
    record.mockRejectedValueOnce(new Error("temporary projection failure"));
    const handler = createAgentWorkOutboxHandler({ uow: f.deps.uow, clock: f.t.deps.clock,
      gatewayFor: () => f.t.gateway, authorizeLocalLearning: authorize });
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn(), sendEvent: vi.fn() };
    expect(await handler({ step })).toEqual({ emitted: 1 });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: ADJUSTMENT_EVIDENCE_EVENT })).toEqual([]);
    await handler({ step });
    expect(await listAdjustmentEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).toHaveLength(1);
  });
});
