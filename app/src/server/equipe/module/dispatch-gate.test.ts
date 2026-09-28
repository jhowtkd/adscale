import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { mandateRuleOf, mandateVersionHash } from "./plan-mandate";
import {
  approveLiveMandate,
  approveTestItem,
  ctx,
  deliverDueApprovedItem,
  deliverTestBatch,
  frontIdOf,
  intentOf,
  makeTestDeps,
  openTestAccount,
  seedInstagramConnection,
  setup,
  type ItemIds,
  type TestDeps,
} from "./testing/publication";

async function setupReady() {
  const { t, ids } = await setup();
  await approveLiveMandate(t, ids);
  await seedInstagramConnection(t, ids);
  return { t, ids };
}

function scopeOf(ids: { workspaceId: string; accountId: string }) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function dispatchOf(t: TestDeps, ids: ItemIds, intentId: string) {
  return executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "dispatch_publication",
    payload: { intentId },
  });
}

describe("dispatch_publication gate", () => {
  it("without an approved mandate the item misses its window instead of sending", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["mandate_not_approved"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("missed_window");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("canceled");
  });

  it("a shadow mandate does not authorize sending", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = scopeOf(ids);
    const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: { shadow: true },
    });
    expect(proposed.ok).toBe(true);
    const mandates = await t.deps.uow.repos.mandates.list(scope);
    const open = mandates.find((row) => row.status === "proposed")!;
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate",
      payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) },
    });
    expect(approved.ok).toBe(true);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["mandate_not_approved"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("without a verified connection nothing is sent", async () => {
    const { t, ids } = await setup();
    await approveLiveMandate(t, ids);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["connection_not_verified"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("an expired connection row blocks the gate without flipping anything", async () => {
    const { t, ids } = await setup();
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids, { status: "expired" });
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["connection_not_verified"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("outside the assisted window nothing is sent", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-04T14:00:00.000Z") });
    const ids = await openTestAccount(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-04T13:55:00.000Z") }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await intentOf(t, ids, itemIds[0]!, versionHashes[0]!);
    const outcome = await dispatchOf(t, ids, intent.id);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["outside_assisted_window"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("a failing gate before the item time holds with reasons instead of missing", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-05T18:00:00.000Z") }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await intentOf(t, ids, itemIds[0]!, versionHashes[0]!);
    // Force the gate evaluation on a future item (the job only claims due
    // ones; the command still revalidates before anything goes out).
    await t.deps.uow.repos.intents.update(scope, intent.id, {
      scheduledFor: new Date("2026-10-05T13:55:00.000Z"),
    });
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, {
      scheduledFor: new Date("2026-10-05T18:00:00.000Z"),
    });
    const outcome = await dispatchOf(t, ids, intent.id);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "held",
      reasons: ["mandate_not_approved"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("held");
    expect((await t.deps.uow.repos.intents.get(scope, intent.id))?.status).toBe("held");
  });

  it("nothing is sent while the account is paused", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const paused = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "pause_publications",
      payload: {},
    });
    expect(paused.ok).toBe(true);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "missed_window" });
    expect(outcome.value.data).toMatchObject({
      reasons: expect.arrayContaining(["paused_publication"]),
    });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("missed_window");
  });

  it("an open escalation on the item blocks the send", async () => {
    const { t, ids } = await setupReady();
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "normal", itemId, reason: "claim sem fonte" },
    });
    expect(opened.ok).toBe(true);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["blocking_escalation_open"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("in calibration the item needs the quality check before it can go out", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    await t.deps.uow.repos.fronts.update(scope, frontId, { status: "calibrating" });
    const { itemId, versionHash, intentId } = await deliverDueApprovedItem(t, ids);
    const blocked = await dispatchOf(t, ids, intentId);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["calibration_check_missing"],
    });
    expect(t.publisher.publishes).toHaveLength(0);

    const round = await t.deps.uow.repos.calibrationRounds.create(scope, {
      frontId,
      sequence: 1,
    });
    const second = await deliverDueApprovedItem(t, ids, { caption: "legenda 2" });
    await t.deps.uow.repos.calibrationScores.create(scope, {
      roundId: round.id,
      itemId: second.itemId,
      versionHash: second.versionHash,
      verdict: "pass",
    });
    const sent = await dispatchOf(t, ids, second.intentId);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.data).toMatchObject({ action: "published" });
    expect(itemId).not.toBe(second.itemId);
    expect(versionHash).not.toBe(second.versionHash);
  });

  it("the 7th post of the week is held back by the contract limit", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const delivered = await deliverTestBatch(t, ids, {
      items: Array.from({ length: 7 }, (_, index) => ({
        scheduledFor: new Date("2026-10-05T13:55:00.000Z"),
        caption: `legenda ${index + 1}`,
      })),
    });
    for (let index = 0; index < 6; index += 1) {
      await approveTestItem(t, ids, delivered.itemIds[index]!, delivered.versionHashes[index]!);
      const intent = await intentOf(t, ids, delivered.itemIds[index]!, delivered.versionHashes[index]!);
      const sent = await dispatchOf(t, ids, intent.id);
      expect(sent.ok).toBe(true);
    }
    expect(t.publisher.publishes).toHaveLength(6);
    await approveTestItem(t, ids, delivered.itemIds[6]!, delivered.versionHashes[6]!);
    const last = await intentOf(t, ids, delivered.itemIds[6]!, delivered.versionHashes[6]!);
    const outcome = await dispatchOf(t, ids, last.id);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["weekly_limit_reached"],
    });
    expect(t.publisher.publishes).toHaveLength(6);
    expect((await t.deps.uow.repos.items.get(scope, delivered.itemIds[6]!))?.status).toBe(
      "missed_window",
    );
  });

  it("the 27th post of the month is held back by the contract limit", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    // Same month (October), previous week: the monthly limit fires alone.
    const before = new Date("2026-10-02T14:00:00.000Z");
    for (let index = 0; index < 26; index += 1) {
      await t.deps.uow.repos.events.create(scope, {
        actorType: "system",
        actorId: "dispatch",
        actorRole: "system",
        eventType: "item.published",
        objectType: "item",
        objectId: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
        payload: {},
        occurredAt: before,
      });
    }
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["monthly_limit_reached"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });
});
