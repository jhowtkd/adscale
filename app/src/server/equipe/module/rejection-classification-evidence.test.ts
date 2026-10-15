import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { ctx, openTestRound, releaseAll, scoreAll, setupCalibration } from "./testing/calibration";
import { createAdjustmentEvidenceHandler } from "../jobs/adjustment-evidence";
import { ADJUSTMENT_EVIDENCE_TASK_EVENT, consumeAdjustmentEvidence, listAdjustmentEvidenceForBrand } from "./adjustment-evidence";
import { consumeRejectionClassificationEvidence, listRejectionClassificationEvidenceForBrand } from "./rejection-classification-evidence";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
import type { EquipeEvent } from "../data";

const factualRows = vi.hoisted(() => vi.fn());
const recompute = vi.hoisted(() => vi.fn());
vi.mock("@/server/output-learning/service", () => ({ recomputeClientOutputLearnings: recompute }));
vi.mock("@/server/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: factualRows }) }) }) }) } }));
vi.mock("@/server/repositories/human-quality-corpus", () => ({ listEvaluatedCorpusWithEvaluations: vi.fn(async () => []) }));
beforeEach(() => {
  factualRows.mockResolvedValue([]);
  recompute.mockReset().mockResolvedValue({});
});

async function fixture(category: "taste" | "brand" | "fact" = "brand") {
  const { t, ids } = await setupCalibration();
  const round = await openTestRound(t, ids);
  const itemId = round.itemIds[0]!;
  await scoreAll(t, ids, round.roundId, [itemId]);
  await releaseAll(t, ids, round.roundId, [itemId]);
  const adjusted = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "request_adjustment", payload: { itemId, category: "voice", note: "Mais direto" },
  });
  if (!adjusted.ok) throw new Error(adjusted.error.code);
  const classified = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
    type: "classify_rejection", payload: { roundId: round.roundId, itemId, category, evidence: "Conferido pela qualidade" },
  });
  if (!classified.ok) throw new Error(classified.error.code);
  const source = classified.value.events.find(event => event.eventType === "round.rejection_classified")!;
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const deps = { uow: t.deps.uow, authorize: vi.fn(async () => ({ allowed: true as const })) };
  const consume = createAdjustmentEvidenceHandler(deps);
  const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };
  const intent = (await deps.uow.repos.taskOutbox.list(scope)).find(row => row.data.sourceEventId === source.id);
  const adjustmentSource = adjusted.value.events.find(event => event.eventType === "agent_work.requested")!;
  return { t, ids, round, itemId, source, adjustmentSource, scope, deps, intent, step, consume };
}

/** The alert reader's query: factual alerts and classifications of the brand, in ledger order. */
async function serveFactualRows(f: Awaited<ReturnType<typeof fixture>>) {
  const events = (await f.deps.uow.repos.events.list(f.scope))
    .filter(event => ["learning.rejection_factual_alert", "round.rejection_classified"].includes(event.eventType));
  factualRows.mockResolvedValue(events.map(event => ({ event, clientProfileId: f.ids.profileId })));
}

async function reclassify(f: Awaited<ReturnType<typeof fixture>>, category: "taste" | "brand" | "fact") {
  const classified = await executeCommand(f.t.deps, ctx(f.ids, f.ids.actors.quality), {
    type: "classify_rejection", payload: { roundId: f.round.roundId, itemId: f.itemId, category, evidence: "Revisto pela qualidade" },
  });
  if (!classified.ok) throw new Error(classified.error.code);
  const source = classified.value.events.find(event => event.eventType === "round.rejection_classified")!;
  await consumeRejectionClassificationEvidence(f.deps, f.scope, source.id);
  return source;
}

describe("quality rejection classification evidence", () => {
  it("withdraws the factual alert once quality reclassifies the round Item, and keeps one alert when fact repeats", async () => {
    const brand = (f: Awaited<ReturnType<typeof fixture>>) => ({ workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    const withdrawn = await fixture("fact");
    await consumeRejectionClassificationEvidence(withdrawn.deps, withdrawn.scope, withdrawn.source.id);
    const taste = await reclassify(withdrawn, "taste");
    await serveFactualRows(withdrawn);
    expect(await listFactualIssueAlerts(brand(withdrawn))).toEqual([]);
    expect(await listRejectionClassificationEvidenceForBrand(withdrawn.deps, brand(withdrawn)))
      .toMatchObject([{ category: "taste", sourceEventId: taste.id }]);

    const repeated = await fixture("fact");
    await consumeRejectionClassificationEvidence(repeated.deps, repeated.scope, repeated.source.id);
    const latest = await reclassify(repeated, "fact");
    await serveFactualRows(repeated);
    const alerts = await listFactualIssueAlerts(brand(repeated));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].evidenceRefs.equipeEventRefs).toMatchObject([{ sourceEventId: latest.id }]);
  });

  it("returns only the latest non-factual classification of a round Item", async () => {
    const f = await fixture("taste");
    await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    const latest = await reclassify(f, "brand");
    const evidence = await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ category: "brand", sourceEventId: latest.id });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_classification_recorded" })).toHaveLength(2);
  });

  it("durably consumes the quality classification once with its actor and typed source", async () => {
    const f = await fixture();
    expect(f.intent?.eventName).toBe(ADJUSTMENT_EVIDENCE_TASK_EVENT);
    const event = { data: { ...f.scope, sourceEventId: f.source.id, taskIntentId: f.intent!.id } };
    expect(await f.consume({ event, step: f.step })).toMatchObject({ recorded: true });
    await f.consume({ event, step: f.step });
    const evidence = await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_classification_recorded" });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ actorType: "staff", actorId: f.source.actorId, actorRole: "quality",
      occurredAt: f.source.occurredAt, objectType: "learning_evidence", objectId: f.source.id,
      payload: { sourceEventId: f.source.id, clientProfileId: f.ids.profileId, itemId: f.itemId,
        roundId: f.round.roundId, from: "voice", category: "brand", evidence: "Conferido pela qualidade" } });
  });

  it.each(["taste", "brand"] as const)("keeps %s distinct and preserves operational state, rounds, fronts and receipts", async category => {
    const f = await fixture(category);
    const before = {
      item: await f.deps.uow.repos.items.get(f.scope, f.itemId),
      round: await f.deps.uow.repos.calibrationRounds.get(f.scope, f.round.roundId),
      front: await f.deps.uow.repos.fronts.get(f.scope, f.round.frontId),
      receipts: await f.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId),
    };
    await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    const evidence = await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ category, sourceEventId: f.source.id, actorRole: "quality" });
    expect(await f.deps.uow.repos.items.get(f.scope, f.itemId)).toEqual(before.item);
    expect(await f.deps.uow.repos.calibrationRounds.get(f.scope, f.round.roundId)).toEqual(before.round);
    expect(await f.deps.uow.repos.fronts.get(f.scope, f.round.frontId)).toEqual(before.front);
    expect(await f.deps.uow.repos.receipts.listByObject(f.scope, "item", f.itemId)).toEqual(before.receipts);
    expect(await listFactualIssueAlerts()).toEqual([]);
  });

  it("routes fact to the public factual alert service without taste evidence or invented corpus/verdict", async () => {
    const f = await fixture("fact");
    await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    expect(await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).toEqual([]);
    const events = await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_factual_alert" });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ adjustmentSourceEventId: f.adjustmentSource.id, versionHash: f.round.versionHashes[0] });
    expect(recompute).toHaveBeenCalledWith({ workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    await serveFactualRows(f);
    const alerts = await listFactualIssueAlerts({ workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId,
      rationale: "factual_guard_review_required", evidenceRefs: { corpusItemIds: [],
        equipeEventRefs: [{ sourceEventId: f.source.id, itemId: f.itemId, roundId: f.round.roundId,
          actorId: f.source.actorId, actorRole: "quality", category: "fact" }],
        stats: { count: 1, meanSignedDelta: null, meanAbsError: null } } });
  });

  it("retries a failed recompute after committing evidence without duplicating it", async () => {
    const f = await fixture("fact");
    recompute.mockRejectedValueOnce(new Error("recompute unavailable"));
    const event = { data: { ...f.scope, sourceEventId: f.source.id, taskIntentId: f.intent!.id } };
    await expect(f.consume({ event, step: f.step })).rejects.toThrow("recompute unavailable");
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_factual_alert" })).toHaveLength(1);
    expect(await f.consume({ event, step: f.step })).toMatchObject({ recorded: true });
    expect(recompute).toHaveBeenCalledTimes(2);
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_factual_alert" })).toHaveLength(1);
  });

  it("excludes only the causally classified request/Versão from the brand reader and keeps its history", async () => {
    const f = await fixture("fact");
    const hash = f.round.versionHashes[0]!;
    const version = await f.deps.uow.repos.itemVersions.getByHash(f.scope, f.itemId, hash);
    f.t.store.itemVersions.rows.set(version!.id, { ...version!, creativeWorkOutputId: null });
    await consumeAdjustmentEvidence(f.deps, f.scope, f.adjustmentSource.id);
    const brand = { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId };
    expect(await listAdjustmentEvidenceForBrand(f.deps, brand)).toEqual([]);
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.item_adjustment_recorded" })).toHaveLength(1);
    for (const invalid of [{ adjustmentSourceEventId: crypto.randomUUID() }, { versionHash: "another-version" }, { adjustmentSourceEventId: null }]) {
      f.t.store.events.rows.set(f.source.id, { ...f.source, payload: { ...(f.source.payload as object), ...invalid } });
      expect(await listAdjustmentEvidenceForBrand(f.deps, brand)).toMatchObject([{ sourceEventId: f.adjustmentSource.id, category: "voice", versionHash: hash }]);
    }
  });

  it("preserves the limitation of historical adjustments without a causal link", async () => {
    const f = await fixture("fact");
    f.t.store.events.rows.set(f.source.id, { ...f.source, payload: { ...(f.source.payload as object), adjustmentSourceEventId: null, versionHash: null } });
    const evidence = await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    expect(evidence?.payload).toMatchObject({ adjustmentSourceEventId: null, versionHash: null });
    expect(recompute).not.toHaveBeenCalled();
  });

  it("sanitizes evidence and serializes concurrent replay on a closed account", async () => {
    const f = await fixture();
    f.t.store.events.rows.set(f.source.id, { ...f.source, payload: { ...(f.source.payload as object), evidence: "DATABASE_URL=postgres://secret" } });
    await f.deps.uow.repos.accounts.update(f.ids.workspaceId, f.ids.accountId, { status: "closed" });
    const event = { data: { ...f.scope, sourceEventId: f.source.id, taskIntentId: f.intent!.id } };
    await Promise.all([f.consume({ event, step: f.step }), f.consume({ event, step: f.step })]);
    const [entry] = await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId });
    expect(entry).toMatchObject({ evidence: null, evidenceSanitized: true });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_classification_recorded" })).toHaveLength(1);
  });

  it("denies capture and reading, and isolates workspace, account and brand", async () => {
    const f = await fixture();
    const denied = { ...f.deps, authorize: async () => ({ allowed: false as const, reason: "local_learning_denied" as const }) };
    await expect(consumeRejectionClassificationEvidence(denied, f.scope, f.source.id)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: "learning.rejection_classification_recorded" })).toEqual([]);
    for (const field of ["workspaceId", "accountId"] as const) {
      expect(await consumeRejectionClassificationEvidence(f.deps, { ...f.scope, [field]: crypto.randomUUID() }, f.source.id)).toBeNull();
    }
    await consumeRejectionClassificationEvidence(f.deps, f.scope, f.source.id);
    expect(await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: crypto.randomUUID() })).toEqual([]);
    await expect(listRejectionClassificationEvidenceForBrand(denied, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).rejects.toMatchObject({ reason: "local_learning_denied" });
  });

  it.each(["actorId", "actorRole", "actorType", "payload", "objectId"] as const)("does not reconstruct historical classification with missing/invalid %s", async field => {
    const f = await fixture();
    const source: EquipeEvent = { ...f.source };
    if (field === "actorType") source.actorType = "agent";
    else source[field] = null;
    f.t.store.events.rows.set(source.id, source);
    expect(await consumeRejectionClassificationEvidence(f.deps, f.scope, source.id)).toBeNull();
    expect(await listRejectionClassificationEvidenceForBrand(f.deps, { workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId })).toEqual([]);
  });

  it("rolls back a classification when its durable intent cannot be stored", async () => {
    const f = await fixture();
    const before = await f.deps.uow.repos.events.list(f.scope);
    const run = f.deps.uow.run.bind(f.deps.uow);
    f.deps.uow.run = fn => run((repos, internal) => fn({ ...repos, taskOutbox: { ...repos.taskOutbox,
      create: async () => { throw new Error("outbox unavailable"); },
    } }, internal));
    await expect(executeCommand(f.t.deps, ctx(f.ids, f.ids.actors.quality), {
      type: "classify_rejection", payload: { roundId: f.round.roundId, itemId: f.itemId, category: "fact" },
    })).rejects.toThrow("outbox unavailable");
    expect(await f.deps.uow.repos.events.list(f.scope)).toEqual(before);
  });
});
