// run_calibration_monitor: rejection spikes on released fronts open a
// content escalation; quality-hours budgets alert quality (6 h) and the
// founder (8 h). Simulated clock; re-runs stay quiet.

import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  QUALITY_EFFORT_RECORDED_EVENT,
  QUALITY_HOURS_ALERTED_EVENT,
  QUALITY_HOURS_ESCALATED_EVENT,
} from "./jobs-monitor";
import {
  ctx,
  deliverTestBatch,
  frontIdOf,
  setup,
  uuid,
  type ItemIds,
  type TestDeps,
} from "./testing/items";
import { openTestRound, setNow } from "./testing/calibration";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function runMonitor(t: TestDeps, ids: ItemIds) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "run_calibration_monitor",
    payload: {},
  });
  if (!outcome.ok) {
    throw new Error(`run_calibration_monitor failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return outcome.value.data as {
    released: Array<{ frontId: string; rejections: number; window: number; escalated: boolean }>;
    budgets: Array<{ frontId: string; minutes: number; warned: boolean; escalated: boolean }>;
  };
}

async function releaseSocialFront(t: TestDeps, ids: ItemIds): Promise<string> {
  await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "active" });
  const frontId = await frontIdOf(t, ids, "social_instagram");
  await t.deps.uow.repos.fronts.update(SCOPE(ids), frontId, {
    status: "released",
    releasedAt: new Date("2026-10-06T12:00:00.000Z"),
  });
  return frontId;
}

/** Deliver count items and stagger their creation order deterministically. */
async function deliverOrderedItems(
  t: TestDeps,
  ids: ItemIds,
  count: number,
  baseAt: Date,
): Promise<string[]> {
  const batch = await deliverTestBatch(t, ids, {
    items: Array.from({ length: count }, (_, index) => ({
      caption: `post ${index + 1}`,
      scheduledFor: new Date("2026-11-20T15:00:00.000Z"),
    })),
  });
  batch.itemIds.forEach((itemId, index) => {
    t.store.items.rows.get(itemId)!.createdAt = new Date(baseAt.getTime() + index * 60_000);
  });
  return batch.itemIds;
}

async function approveItem(t: TestDeps, ids: ItemIds, itemId: string) {
  const item = await t.deps.uow.repos.items.get(SCOPE(ids), itemId);
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_item",
    payload: { itemId, expectedVersionHash: item!.currentVersionHash! },
  });
  if (!outcome.ok) throw new Error(`approve failed: ${outcome.error.code} ${outcome.error.message}`);
}

async function rejectItem(
  t: TestDeps,
  ids: ItemIds,
  itemId: string,
  category: "fact" | "brand" | "voice",
) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "request_adjustment",
    payload: { itemId, category, note: "não é isso" },
  });
  if (!outcome.ok) throw new Error(`reject failed: ${outcome.error.code} ${outcome.error.message}`);
}

async function notificationsFor(t: TestDeps, ids: ItemIds, templateKey: string) {
  const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
    eventType: "notification.requested",
  });
  return events.filter(
    (event) => (event.payload as { templateKey?: unknown })?.templateKey === templateKey,
  );
}

describe("run_calibration_monitor rejections", () => {
  it("opens a content escalation above 20% fact/brand rejections in 10", async () => {
    const { t, ids } = await setup();
    const frontId = await releaseSocialFront(t, ids);
    const itemIds = await deliverOrderedItems(t, ids, 10, new Date("2026-10-20T12:00:00.000Z"));
    setNow(t, new Date("2026-10-21T12:00:00.000Z"));
    for (const itemId of itemIds.slice(0, 3)) {
      await rejectItem(t, ids, itemId, "fact");
    }
    for (const itemId of itemIds.slice(3)) {
      await approveItem(t, ids, itemId);
    }
    setNow(t, new Date("2026-10-22T12:00:00.000Z"));
    const outcome = await runMonitor(t, ids);
    expect(outcome.released).toMatchObject([
      { frontId, rejections: 3, window: 10, escalated: true },
    ]);
    const escalations = await t.deps.uow.repos.escalations.list(SCOPE(ids));
    expect(escalations).toHaveLength(1);
    expect(escalations[0]).toMatchObject({
      kind: "content",
      severity: "medium",
      status: "open",
      ownerRole: "quality",
      frontId,
    });
    // The open escalation suppresses further monitor escalations.
    const quiet = await runMonitor(t, ids);
    expect(quiet.released).toMatchObject([{ escalated: false }]);
    expect(await t.deps.uow.repos.escalations.list(SCOPE(ids))).toHaveLength(1);
  });

  it("stays quiet at exactly 20% and counts only the latest decision", async () => {
    const { t, ids } = await setup();
    const frontId = await releaseSocialFront(t, ids);
    const itemIds = await deliverOrderedItems(t, ids, 10, new Date("2026-10-20T12:00:00.000Z"));
    setNow(t, new Date("2026-10-21T12:00:00.000Z"));
    await rejectItem(t, ids, itemIds[0]!, "brand");
    await rejectItem(t, ids, itemIds[1]!, "voice");
    await rejectItem(t, ids, itemIds[2]!, "fact");
    // Taste rejections never count; the fact rejection below is superseded
    // by a later approval of the same item (seeded: the approve command
    // only accepts ready items, while the monitor reads the event log).
    await t.deps.uow.repos.events.create(SCOPE(ids), {
      actorType: "client_person",
      actorId: "person-ana",
      actorRole: "approver",
      eventType: "item.approved",
      objectType: "item",
      objectId: itemIds[2],
      payload: { versionHash: "v-final" },
      occurredAt: new Date("2026-10-21T13:00:00.000Z"),
    });
    for (const itemId of itemIds.slice(3)) {
      await approveItem(t, ids, itemId);
    }
    setNow(t, new Date("2026-10-22T12:00:00.000Z"));
    const outcome = await runMonitor(t, ids);
    expect(outcome.released).toMatchObject([{ frontId, rejections: 1, escalated: false }]);
    expect(await t.deps.uow.repos.escalations.list(SCOPE(ids))).toHaveLength(0);
  });
});

async function setupBudget() {
  const { t, ids } = await setup();
  await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "active" });
  const frontId = await frontIdOf(t, ids, "social_instagram");
  await t.deps.uow.repos.fronts.update(SCOPE(ids), frontId, { status: "calibrating" });
  return { t, ids, frontId };
}

describe("run_calibration_monitor quality hours", () => {
  async function recordEffort(t: TestDeps, ids: ItemIds, frontId: string, minutes: number) {
    await t.deps.uow.repos.events.create(SCOPE(ids), {
      actorType: "staff",
      actorId: "staff-q",
      actorRole: "quality",
      eventType: QUALITY_EFFORT_RECORDED_EVENT,
      objectType: "front",
      objectId: frontId,
      payload: { frontId, minutes },
      occurredAt: t.deps.clock.now(),
    });
  }

  it("warns quality above 6 h, once", async () => {
    const { t, ids, frontId } = await setupBudget();
    await recordEffort(t, ids, frontId, 370);
    const outcome = await runMonitor(t, ids);
    expect(outcome.budgets).toMatchObject([{ frontId, minutes: 370, warned: true }]);
    expect(await notificationsFor(t, ids, "quality.hours_warning")).toHaveLength(1);
    const quiet = await runMonitor(t, ids);
    expect(quiet.budgets).toMatchObject([{ warned: false, escalated: false }]);
    const markers = await t.deps.uow.repos.events.list(SCOPE(ids), {
      objectType: "front",
      objectId: frontId,
    });
    expect(markers.filter((e) => e.eventType === QUALITY_HOURS_ALERTED_EVENT)).toHaveLength(1);
  });

  it("alerts the founder above 8 h", async () => {
    const { t, ids, frontId } = await setupBudget();
    await recordEffort(t, ids, frontId, 300);
    await recordEffort(t, ids, frontId, 190);
    const outcome = await runMonitor(t, ids);
    expect(outcome.budgets).toMatchObject([
      { frontId, minutes: 490, warned: true, escalated: true },
    ]);
    expect(await notificationsFor(t, ids, "quality.hours_over_budget")).toHaveLength(1);
    const markers = await t.deps.uow.repos.events.list(SCOPE(ids), {
      objectType: "front",
      objectId: frontId,
    });
    expect(markers.filter((e) => e.eventType === QUALITY_HOURS_ESCALATED_EVENT)).toHaveLength(1);
  });

  it("holds the exact boundaries: 6 h warns nothing, 8 h warns only", async () => {
    const { t, ids, frontId } = await setupBudget();
    await recordEffort(t, ids, frontId, 360);
    expect((await runMonitor(t, ids)).budgets).toMatchObject([
      { warned: false, escalated: false },
    ]);
    await recordEffort(t, ids, frontId, 120);
    expect((await runMonitor(t, ids)).budgets).toMatchObject([
      { minutes: 480, warned: true, escalated: false },
    ]);
  });
});

describe("run_calibration_monitor gates", () => {
  it("skips accounts outside calibration", async () => {
    const { t, ids } = await setup();
    const skipped = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "run_calibration_monitor",
      payload: {},
    });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.value.data).toMatchObject({ skipped: "deploying" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "run_calibration_monitor",
      payload: {},
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("record_quality_effort", () => {
  it("lets quality book time, with optional round and note", async () => {
    const { t, ids, frontId } = await setupBudget();
    const round = await openTestRound(t, ids, { front: "social_instagram" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "record_quality_effort",
      payload: { frontId, roundId: round.roundId, minutes: 90, note: "revisão do lote" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ frontId, minutes: 90 });
    const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
      objectType: "front",
      objectId: frontId,
    });
    const booked = events.filter((event) => event.eventType === QUALITY_EFFORT_RECORDED_EVENT);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      actorRole: "quality",
      payload: { frontId, roundId: round.roundId, minutes: 90, note: "revisão do lote" },
    });
  });

  it("forbids agent, system and support actors", async () => {
    const { t, ids, frontId } = await setupBudget();
    for (const actor of [ids.actors.agent, ids.actors.system, ids.actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "record_quality_effort",
        payload: { frontId, minutes: 30 },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    const booked = await t.deps.uow.repos.events.list(SCOPE(ids), {
      eventType: QUALITY_EFFORT_RECORDED_EVENT,
    });
    expect(booked).toHaveLength(0);
  });

  it("rejects bad minutes, unknown fronts and foreign rounds", async () => {
    const { t, ids, frontId } = await setupBudget();
    const otherFrontRound = await openTestRound(t, ids, { front: "midia_paga" });
    const quality = ctx(ids, ids.actors.quality);
    for (const minutes of [0, 481, 1.5]) {
      const outcome = await executeCommand(t.deps, quality, {
        type: "record_quality_effort",
        payload: { frontId, minutes },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.error.code).toBe("invalid_command");
    }
    const unknownFront = await executeCommand(t.deps, quality, {
      type: "record_quality_effort",
      payload: { frontId: uuid(), minutes: 30 },
    });
    expect(unknownFront.ok).toBe(false);
    if (!unknownFront.ok) expect(unknownFront.error.code).toBe("unknown_front");
    const unknownRound = await executeCommand(t.deps, quality, {
      type: "record_quality_effort",
      payload: { frontId, roundId: uuid(), minutes: 30 },
    });
    expect(unknownRound.ok).toBe(false);
    if (!unknownRound.ok) expect(unknownRound.error.code).toBe("unknown_round");
    const foreignRound = await executeCommand(t.deps, quality, {
      type: "record_quality_effort",
      payload: { frontId, roundId: otherFrontRound.roundId, minutes: 30 },
    });
    expect(foreignRound.ok).toBe(false);
    if (!foreignRound.ok) expect(foreignRound.error.code).toBe("round_not_in_front");
  });
});

describe("record_quality_effort feeds the monitor", () => {
  it("fires the 6 h warning and the 8 h escalation once each per front", async () => {
    const { t, ids, frontId } = await setupBudget();
    const quality = ctx(ids, ids.actors.quality);
    async function book(minutes: number) {
      const outcome = await executeCommand(t.deps, quality, {
        type: "record_quality_effort",
        payload: { frontId, minutes },
      });
      if (!outcome.ok) throw new Error(`book failed: ${outcome.error.code}`);
    }
    await book(200);
    await book(170);
    expect(await runMonitor(t, ids)).toMatchObject({
      budgets: [{ frontId, minutes: 370, warned: true, escalated: false }],
    });
    expect(await notificationsFor(t, ids, "quality.hours_warning")).toHaveLength(1);
    expect(await runMonitor(t, ids)).toMatchObject({
      budgets: [{ warned: false, escalated: false }],
    });
    await book(120);
    expect(await runMonitor(t, ids)).toMatchObject({
      budgets: [{ minutes: 490, warned: false, escalated: true }],
    });
    expect(await notificationsFor(t, ids, "quality.hours_over_budget")).toHaveLength(1);
    expect(await runMonitor(t, ids)).toMatchObject({
      budgets: [{ warned: false, escalated: false }],
    });
    expect(await notificationsFor(t, ids, "quality.hours_warning")).toHaveLength(1);
    expect(await notificationsFor(t, ids, "quality.hours_over_budget")).toHaveLength(1);
  });
});
