import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs, outputDecisionEvents } from "@/server/db/schema";
import { listOutputDecisionEvents } from "@/server/repositories/output-decision-event";
import { listClientOutputLearnings, recomputeClientOutputLearnings } from "@/server/output-learning/service";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import type { EquipeUnitOfWork } from "../data";
import { equipeStaff } from "@/server/db/equipe-schema";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { executeCommand } from "./commands";
import { appendEvent, transact } from "./shared";
import { makeTestDeps } from "./testing/deps";
import { dispatchTaskIntent } from "./task-outbox";
import { createAdjustmentEvidenceHandler } from "../jobs/adjustment-evidence";
import { ADJUSTMENT_EVIDENCE_EVENT, ADJUSTMENT_EVIDENCE_TASK_EVENT, consumeAdjustmentEvidence, listAdjustmentEvidenceForBrand } from "./adjustment-evidence";
import { consumeCaptionEvidence, listCaptionEvidenceForBrand } from "./caption-evidence";

vi.mock("@/server/output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));
vi.mock("@/server/memory/output-learning-projection", () => ({ projectOutputLearnings: vi.fn() }));
const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Adjustment evidence tests require matching local database URLs ending in _test");
  }
}
const workspaceIds: string[] = [];
const staffIds: string[] = [];
const ownerId = randomUUID();

async function fixture(options: { noPiece?: boolean; staff?: boolean; category?: "fact" | "voice" } = {}) {
  const [workspace] = await db.insert(workspaces).values({ name: "Ajuste simulado", slug: randomUUID() }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  const [work] = await db.insert(creativeWorkItems).values({ workspaceId: workspace.id, clientProfileId: brand.id,
    createdByUserId: ownerId, title: "Trabalho simulado", request: "Teste", toolKind: "single", settings: { targetFormats: ["4:5"] } }).returning();
  const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId: workspace.id, workItemId: work.id,
    creativeLevel: "balanced", targetFormat: "4:5", operationKey: randomUUID(), status: "completed" }).returning();
  const uow = createPostgresEquipeUnitOfWork(db);
  const account = await uow.repos.accounts.create(workspace.id, { clientProfileId: brand.id, status: "active" });
  const scope = { workspaceId: workspace.id, accountId: account.id };
  const front = await uow.repos.fronts.create(scope, { key: "social_instagram", status: "released" });
  const person = await uow.repos.people.create(scope, { name: "Pessoa sem usuário", role: "approver", active: true });
  const staff = options.staff ? await uow.internal.staff.create({ displayName: "Qualidade simulada", role: "quality", active: true }) : null;
  if (staff) staffIds.push(staff.id);
  const actor = staff ? { kind: "staff" as const, staffId: staff.id, role: "quality" as const }
    : { kind: "client_person" as const, personId: person.id, role: "approver" as const };
  const item = await uow.repos.items.create(scope, { frontId: front.id, creativeWorkId: work.id, status: "awaiting_approval", currentVersionHash: "original-hash" });
  await uow.repos.itemVersions.create(scope, { itemId: item.id, versionHash: "original-hash", caption: "Legenda original",
    creativeWorkOutputId: options.noPiece ? null : output.id, authorRole: "agent", destination: "instagram:@simulada" });
  const deps = { ...makeTestDeps().deps, uow };
  const confirmed = staff
    ? await transact(deps, { ...scope, actor, now: deps.clock.now() }, async ctx => {
      await appendEvent(ctx, { eventType: "agent_work.requested", objectType: "item", objectId: item.id,
        payload: { kind: "adjustment", category: options.category ?? "voice", note: "Use uma frase curta", versionHash: "original-hash" } });
      return { ok: true, value: {} };
    })
    : await executeCommand(deps, { ...scope, actor }, { type: "request_adjustment",
      payload: { itemId: item.id, category: options.category ?? "voice", note: "Use uma frase curta", expectedVersionHash: "original-hash" } });
  if (!confirmed.ok) throw new Error(confirmed.error.code);
  const source = confirmed.value.events.find(event => event.eventType === "agent_work.requested")!;
  return { deps, uow, scope, brandScope: { workspaceId: workspace.id, clientProfileId: brand.id }, item, source, output, staff, actor };
}

describe.skipIf(!testUrl)("adjustment evidence (Postgres)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: ownerId, name: "Criador do Trabalho", email: `${ownerId}@example.com` });
  });
  afterAll(async () => {
    if (workspaceIds.length) {
      await db.delete(outputDecisionEvents).where(inArray(outputDecisionEvents.workspaceId, workspaceIds));
      await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    }
    await db.delete(user).where(eq(user.id, ownerId));
    if (staffIds.length) await db.delete(equipeStaff).where(inArray(equipeStaff.id, staffIds));
  });

  it("captures caption versions once under concurrent redelivery without copying text", async () => {
    const f = await fixture();
    await f.uow.repos.items.update(f.scope, f.item.id, { status: "awaiting_approval" });
    const edit = await executeCommand(f.deps, { ...f.scope, actor: f.actor }, {
      type: "edit_caption", payload: { itemId: f.item.id, expectedVersionHash: "original-hash", caption: "Legenda alterada" },
    });
    if (!edit.ok) throw new Error(edit.error.code);
    const source = edit.value.events.find(e => e.eventType === "caption.edited")!;
    const versionHash = edit.value.data.versionHash as string;
    await f.uow.repos.itemVersions.create(f.scope, { itemId: f.item.id, versionHash: "later-hash", caption: "Legenda posterior", authorRole: "agent" });
    await f.uow.repos.items.update(f.scope, f.item.id, { currentVersionHash: "later-hash" });
    const [first, second] = await Promise.all([
      consumeCaptionEvidence(f.deps, f.scope, source.id), consumeCaptionEvidence(f.deps, f.scope, source.id),
    ]);
    expect(first?.id).toBe(second?.id);
    expect(first?.payload).toEqual({ sourceEventId: source.id, clientProfileId: f.brandScope.clientProfileId,
      itemId: f.item.id, previousVersionHash: "original-hash", versionHash });
    const evidence = await listCaptionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ authorType: "equipe_actor", actorId: source.actorId,
      before: { versionHash: "original-hash", caption: "Legenda original" },
      after: { versionHash, caption: "Legenda alterada" } });
  });

  it.each(["fact", "voice"] as const)("keeps attributed %s corrections while real recomputation excludes only factual taste", async category => {
    const f = await fixture({ category });
    const secondItem = await f.uow.repos.items.create(f.scope, { frontId: f.item.frontId,
      creativeWorkId: f.item.creativeWorkId, status: "awaiting_approval", currentVersionHash: "second-hash" });
    await f.uow.repos.itemVersions.create(f.scope, { itemId: secondItem.id, versionHash: "second-hash",
      creativeWorkOutputId: f.output.id, caption: "Outra Versão", authorRole: "agent" });
    const confirmed = await executeCommand(f.deps, { ...f.scope, actor: f.actor }, { type: "request_adjustment",
      payload: { itemId: secondItem.id, category, note: "Corrija esta Versão", expectedVersionHash: "second-hash" } });
    if (!confirmed.ok) throw new Error(confirmed.error.code);
    const secondSource = confirmed.value.events.find(event => event.eventType === "agent_work.requested")!;
    await f.uow.repos.accounts.update(f.scope.workspaceId, f.scope.accountId, { status: "closed" });
    const consume = createAdjustmentEvidenceHandler(f.deps);
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };
    for (const source of [f.source, secondSource]) {
      const intent = (await f.uow.repos.taskOutbox.list(f.scope)).find(row => row.data.sourceEventId === source.id)!;
      expect(intent.eventName).toBe(ADJUSTMENT_EVIDENCE_TASK_EVENT);
      const sent: Array<{ data: unknown }> = [];
      expect(await dispatchTaskIntent(f.uow.repos, intent, async event => { sent.push(event); }, f.deps.clock.now())).toBe(true);
      expect(sent).toHaveLength(1);
      const first = await consume({ event: sent[0], step });
      expect(first.recorded).toBe(true);
      expect(await consume({ event: sent[0], step })).toEqual(first);
    }
    const evidence = await listAdjustmentEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(2);
    expect(evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ category, versionHash: "original-hash", actorId: f.source.actorId }),
      expect.objectContaining({ category, versionHash: "second-hash", actorId: secondSource.actorId }),
    ]));
    const projections = await listOutputDecisionEvents(f.brandScope);
    expect(projections).toHaveLength(2);
    expect(projections.every(event => event.userId === null && event.contextSnapshot.reason?.code === category)).toBe(true);
    const recomputed = await recomputeClientOutputLearnings(f.brandScope);
    const persisted = await listClientOutputLearnings(f.brandScope);
    if (category === "fact") {
      expect(recomputed.learnings).toEqual([]);
      expect(persisted).toEqual([]);
    } else {
      expect(persisted).toMatchObject([{ variableKey: "avoid_pattern", variableValue: "voice", status: "approved", sampleEventCount: 2 }]);
    }
    await recomputeClientOutputLearnings(f.brandScope);
    expect((await listClientOutputLearnings(f.brandScope)).map(row => row.id)).toEqual(persisted.map(row => row.id));
  });

  it.each([false, true])("preserves checked client/staff authorship without user substitution (staff=%s)", async staff => {
    const f = await fixture({ staff });
    const before = await f.uow.repos.items.get(f.scope, f.item.id);
    const receipts = await f.uow.repos.receipts.listByObject(f.scope, "item", f.item.id);
    await Promise.all([consumeAdjustmentEvidence(f.deps, f.scope, f.source.id), consumeAdjustmentEvidence(f.deps, f.scope, f.source.id)]);
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    const evidence = await listAdjustmentEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ category: "voice", note: "Use uma frase curta", versionHash: "original-hash",
      actorType: staff ? "staff" : "client_person", actorId: f.source.actorId, actorRole: f.source.actorRole });
    const projections = await listOutputDecisionEvents(f.brandScope);
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({ userId: null, authorType: "equipe_actor", equipeEventId: f.source.id,
      actorId: f.source.actorId, actorRole: f.source.actorRole, creativeWorkOutputId: f.output.id,
      action: "regenerated", contextSnapshot: { itemVersionHash: "original-hash", reason: { code: "voice" }, notes: "Use uma frase curta" } });
    expect(await f.uow.repos.items.get(f.scope, f.item.id)).toEqual(before);
    expect(await f.uow.repos.receipts.listByObject(f.scope, "item", f.item.id)).toEqual(receipts);
  });

  it("repairs a partial projection failure without duplicating canonical evidence", async () => {
    const f = await fixture();
    const failingUow: EquipeUnitOfWork = { ...f.uow, run: fn => f.uow.run((repos, internal) => fn({
      ...repos, events: { ...repos.events, create: async (scope, input) => {
        if (input.eventType === ADJUSTMENT_EVIDENCE_EVENT) throw new Error("failed evidence reference");
        return repos.events.create(scope, input);
      } },
    }, internal)) };
    await expect(consumeAdjustmentEvidence({ ...f.deps, uow: failingUow }, f.scope, f.source.id)).rejects.toThrow("failed evidence reference");
    expect(await listAdjustmentEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    expect(await listAdjustmentEvidenceForBrand(f.deps, f.brandScope)).toHaveLength(1);
    expect(await listOutputDecisionEvents(f.brandScope)).toHaveLength(1);
  });

  it("references the typed event without creating a fictitious Peça", async () => {
    const f = await fixture({ noPiece: true });
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    expect(await listAdjustmentEvidenceForBrand(f.deps, f.brandScope)).toMatchObject([
      { sourceEventId: f.source.id, creativeWorkOutputId: null, outputDecisionEventId: null, actorId: f.source.actorId },
    ]);
    expect(await listOutputDecisionEvents(f.brandScope)).toEqual([]);
  });

  it("uses the requested immutable version rather than the current Peça", async () => {
    const f = await fixture();
    await f.uow.repos.itemVersions.create(f.scope, { itemId: f.item.id, versionHash: "later-hash",
      creativeWorkOutputId: randomUUID(), caption: "Outra versão", authorRole: "agent" });
    await f.uow.repos.items.update(f.scope, f.item.id, { currentVersionHash: "later-hash" });
    await consumeAdjustmentEvidence(f.deps, f.scope, f.source.id);
    expect(await listOutputDecisionEvents(f.brandScope)).toMatchObject([
      { creativeWorkOutputId: f.output.id, contextSnapshot: { itemVersionHash: "original-hash" } },
    ]);
  });

  it("does not reconstruct an old actor from nearby confirmed requests", async () => {
    const f = await fixture();
    const old = await f.uow.repos.events.create(f.scope, { actorType: "system", eventType: "agent_work.requested",
      objectType: "item", objectId: f.item.id, occurredAt: f.source.occurredAt, payload: f.source.payload });
    expect(await consumeAdjustmentEvidence(f.deps, f.scope, old.id)).toBeNull();
    expect(await listAdjustmentEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
    expect(await listOutputDecisionEvents(f.brandScope)).toEqual([]);
  });

  it("rejects injected denial and an account brand outside the workspace without writes", async () => {
    const f = await fixture();
    await expect(consumeAdjustmentEvidence({ ...f.deps, authorize: async () => ({ allowed: false, reason: "local_learning_denied" }) }, f.scope, f.source.id))
      .rejects.toMatchObject({ reason: "local_learning_denied" });
    const foreign = await fixture();
    await f.uow.repos.accounts.update(f.scope.workspaceId, f.scope.accountId, { clientProfileId: foreign.brandScope.clientProfileId });
    await expect(consumeAdjustmentEvidence(f.deps, f.scope, f.source.id)).rejects.toMatchObject({ reason: "brand_out_of_scope" });
    expect(await f.uow.repos.events.list(f.scope, { eventType: ADJUSTMENT_EVIDENCE_EVENT })).toEqual([]);
    expect(await listOutputDecisionEvents({ workspaceId: f.scope.workspaceId })).toEqual([]);
  });
});
