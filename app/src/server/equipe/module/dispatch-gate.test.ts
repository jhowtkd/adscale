import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { mandateRuleOf, mandateVersionHash } from "./plan-mandate";
import { releaseAll, scoreAll } from "./testing/calibration";
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

  it("a legacy intent without a destination pin cannot authorize sending", async () => {
    const { t, ids } = await setup();
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    await t.deps.uow.repos.intents.update(scopeOf(ids), intentId, { destinationIgUserId: null });
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "held",
      reasons: ["instagram_destination_changed"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("an expired connection row blocks the gate without flipping anything", async () => {
    const { t, ids } = await setup();
    await approveLiveMandate(t, ids);
    const connectionId = await seedInstagramConnection(t, ids);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    await t.deps.uow.repos.connections.update(scopeOf(ids), connectionId, { status: "expired" });
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

  it("sends nothing while the global stop is active (#583)", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const stopped = await executeCommand(
      t.deps,
      { actor: ids.actors.operations, workspaceId: ids.workspaceId },
      { type: "stop_all_publications", payload: { reason: "provedor instável" } },
    );
    expect(stopped.ok).toBe(true);
    // The stop already held the due item; dispatch stays out either way.
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "none",
      held: true,
      reason: "parada global",
    });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("the deploy switch stays on top of the global stop (#583)", async () => {
    const t = makeTestDeps({ publishEnabled: false });
    const ids = await openTestAccount(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const stopped = await executeCommand(
      t.deps,
      { actor: ids.actors.operations, workspaceId: ids.workspaceId },
      { type: "stop_all_publications", payload: { reason: "provedor instável" } },
    );
    expect(stopped.ok).toBe(true);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await dispatchOf(t, ids, intentId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Kill switch first: the held reason is the deploy switch, not the stop.
    expect(outcome.value.data).toMatchObject({
      action: "held",
      reasons: ["publish_disabled"],
    });
    expect(t.publisher.publishes).toHaveLength(0);
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

  it("in calibration the item needs the quality release before it can go out", async () => {
    const { t, ids } = await setupReady();
    // Approvals land while the account is still deploying (no client
    // conference), so every item already has its intent; the calibration
    // commands below need a calibrating account instead.
    const delivered = await deliverTestBatch(t, ids, {
      items: [1, 2, 3, 4].map((n) => ({
        scheduledFor: new Date("2026-10-05T13:55:00.000Z"),
        caption: `legenda ${n}`,
      })),
    });
    for (let index = 0; index < delivered.itemIds.length; index += 1) {
      await approveTestItem(t, ids, delivered.itemIds[index]!, delivered.versionHashes[index]!);
    }
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
      status: "calibrating",
    });
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roundId = (opened.value.data as { roundId: string }).roundId;

    // No score, no release: nothing goes out.
    const firstIntent = await intentOf(t, ids, delivered.itemIds[0]!, delivered.versionHashes[0]!);
    const blocked = await dispatchOf(t, ids, firstIntent.id);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["calibration_check_missing"],
    });
    expect(t.publisher.publishes).toHaveLength(0);

    // A passing score alone is not the conference: still blocked.
    await scoreAll(t, ids, roundId, [delivered.itemIds[1]!]);
    const secondIntent = await intentOf(t, ids, delivered.itemIds[1]!, delivered.versionHashes[1]!);
    const scored = await dispatchOf(t, ids, secondIntent.id);
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["calibration_check_missing"],
    });
    expect(t.publisher.publishes).toHaveLength(0);

    // Score + release to the client: the current version goes out.
    await scoreAll(t, ids, roundId, [delivered.itemIds[2]!]);
    await releaseAll(t, ids, roundId, [delivered.itemIds[2]!]);
    const thirdIntent = await intentOf(t, ids, delivered.itemIds[2]!, delivered.versionHashes[2]!);
    const sent = await dispatchOf(t, ids, thirdIntent.id);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.data).toMatchObject({ action: "published" });
    expect(t.publisher.publishes).toHaveLength(1);
  });

  it("a caption edit on a released item blocks dispatch until re-release", async () => {
    const { t, ids } = await setupReady();
    const delivered = await deliverTestBatch(t, ids, {
      items: [1, 2, 3, 4].map((n) => ({
        scheduledFor: new Date("2026-10-05T13:55:00.000Z"),
        caption: `legenda ${n}`,
      })),
    });
    for (let index = 0; index < delivered.itemIds.length; index += 1) {
      await approveTestItem(t, ids, delivered.itemIds[index]!, delivered.versionHashes[index]!);
    }
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
      status: "calibrating",
    });
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roundId = (opened.value.data as { roundId: string }).roundId;
    await scoreAll(t, ids, roundId, delivered.itemIds);
    await releaseAll(t, ids, roundId, delivered.itemIds.slice(0, 3));

    // The released version goes out.
    const firstIntent = await intentOf(t, ids, delivered.itemIds[0]!, delivered.versionHashes[0]!);
    const sent = await dispatchOf(t, ids, firstIntent.id);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.data).toMatchObject({ action: "published" });

    // Both clients edit their caption; only the second is re-released.
    const editedSecond = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: delivered.itemIds[1]!, caption: "legenda 2 reescrita" },
    });
    expect(editedSecond.ok).toBe(true);
    if (!editedSecond.ok) return;
    const secondHash = editedSecond.value.data.versionHash as string;
    const editedThird = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: delivered.itemIds[2]!, caption: "legenda 3 reescrita" },
    });
    expect(editedThird.ok).toBe(true);
    if (!editedThird.ok) return;
    const thirdHash = editedThird.value.data.versionHash as string;
    const rechecked = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId, itemId: delivered.itemIds[2]! },
    });
    expect(rechecked.ok).toBe(true);
    if (!rechecked.ok) return;
    expect(rechecked.value.data).toMatchObject({ versionHash: thirdHash, corrected: true });

    // Back to deploying so approvals skip the client conference: the
    // dispatch gate below is the only conference check under test. Triage
    // returns both versions to decision; only the release confers them.
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "deploying" });
    for (const itemId of [delivered.itemIds[1]!, delivered.itemIds[2]!]) {
      const triaged = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
        type: "record_caption_triage",
        payload: { itemId, natures: ["none"], qualityRecheckPassed: true },
      });
      expect(triaged.ok).toBe(true);
    }
    await approveTestItem(t, ids, delivered.itemIds[1]!, secondHash);
    const blockedIntent = await intentOf(t, ids, delivered.itemIds[1]!, secondHash);
    const blocked = await dispatchOf(t, ids, blockedIntent.id);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.value.data).toMatchObject({
      action: "missed_window",
      reasons: ["calibration_check_missing"],
    });
    await approveTestItem(t, ids, delivered.itemIds[2]!, thirdHash);
    const freedIntent = await intentOf(t, ids, delivered.itemIds[2]!, thirdHash);
    const freed = await dispatchOf(t, ids, freedIntent.id);
    expect(freed.ok).toBe(true);
    if (!freed.ok) return;
    expect(freed.value.data).toMatchObject({ action: "published" });
    expect(t.publisher.publishes).toHaveLength(2);
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
