// run_deadlines: item limits, client-wait expiry, escalation/exception
// SLA alerts and the calibration 6-week trigger. Simulated clock; every
// branch idempotent across re-runs.

import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { SLA_BREACHED_EVENT } from "./jobs-deadlines";
import {
  ctx,
  deliverTestBatch,
  setup,
  type ItemIds,
  type TestDeps,
} from "./testing/items";
import { openTestRound, setNow, setupCalibration } from "./testing/calibration";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function runDeadlines(t: TestDeps, ids: ItemIds) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "run_deadlines",
    payload: {},
  });
  if (!outcome.ok) {
    throw new Error(`run_deadlines failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return outcome.value.data as Record<string, unknown>;
}

async function notificationsFor(t: TestDeps, ids: ItemIds, templateKey: string) {
  const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
    eventType: "notification.requested",
  });
  return events.filter(
    (event) => (event.payload as { templateKey?: unknown })?.templateKey === templateKey,
  );
}

async function openContentEscalation(t: TestDeps, ids: ItemIds, itemId: string) {
  const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "open_escalation",
    payload: { kind: "content", severity: "normal", itemId, reason: "claim without source" },
  });
  if (!opened.ok) throw new Error(`open failed: ${opened.error.code}`);
  return (opened.value.data as { escalationId: string }).escalationId;
}

describe("run_deadlines items", () => {
  it("expires items past their limit, once", async () => {
    const { t, ids } = await setup();
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    const itemId = batch.itemIds[0]!;
    // Limit Fri 10:00Z; before it, nothing happens.
    setNow(t, new Date("2026-10-09T09:00:00.000Z"));
    expect((await runDeadlines(t, ids)).itemsExpired).toEqual([]);
    setNow(t, new Date("2026-10-09T10:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    expect(outcome.itemsExpired).toEqual([itemId]);
    const item = await t.deps.uow.repos.items.get(SCOPE(ids), itemId);
    expect(item?.status).toBe("missed_window");
    expect(await notificationsFor(t, ids, "item.window_missed")).toHaveLength(1);
    // Re-run: already missed, quiet.
    expect((await runDeadlines(t, ids)).itemsExpired).toEqual([]);
    expect(await notificationsFor(t, ids, "item.window_missed")).toHaveLength(1);
  });
});

describe("run_deadlines client waits", () => {
  it("expires overdue waits and declines the item", async () => {
    const { t, ids } = await setup();
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-30T12:00:00.000Z") }],
    });
    const itemId = batch.itemIds[0]!;
    const escalationId = await openContentEscalation(t, ids, itemId);
    const deferred = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "defer_to_client" },
    });
    expect(deferred.ok).toBe(true);
    // Due Wed 10-07 14:00Z; the wait survives until then.
    setNow(t, new Date("2026-10-07T13:00:00.000Z"));
    expect((await runDeadlines(t, ids)).clientWaitsExpired).toEqual([]);
    setNow(t, new Date("2026-10-07T15:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    expect(outcome.clientWaitsExpired).toEqual([escalationId]);
    const escalation = await t.deps.uow.repos.escalations.get(SCOPE(ids), escalationId);
    expect(escalation).toMatchObject({ status: "closed", cause: "no_client_response" });
    const item = await t.deps.uow.repos.items.get(SCOPE(ids), itemId);
    expect(item?.status).toBe("do_not_publish");
    expect((await runDeadlines(t, ids)).clientWaitsExpired).toEqual([]);
  });
});

describe("run_deadlines SLA", () => {
  it("alerts the queue and the founder on breached escalation SLA, once", async () => {
    const { t, ids } = await setup();
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-30T12:00:00.000Z") }],
    });
    const escalationId = await openContentEscalation(t, ids, batch.itemIds[0]!);
    // Normal escalation due Tue 10-06 14:00Z.
    setNow(t, new Date("2026-10-06T13:00:00.000Z"));
    expect((await runDeadlines(t, ids)).slaBreached).toMatchObject({
      escalations: [],
      exceptions: [],
    });
    setNow(t, new Date("2026-10-06T15:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    expect(outcome.slaBreached).toMatchObject({ escalations: [escalationId] });
    const markers = await t.deps.uow.repos.events.list(SCOPE(ids), {
      objectType: "escalation",
      objectId: escalationId,
    });
    expect(markers.some((event) => event.eventType === SLA_BREACHED_EVENT)).toBe(true);
    const notes = await notificationsFor(t, ids, "escalation.sla_breached");
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => (note.payload as { recipientRole?: unknown }).recipientRole).sort()).toEqual(
      ["founder", "quality"],
    );
    // The marker suppresses further alerts.
    const quiet = await runDeadlines(t, ids);
    expect(quiet.slaBreached).toMatchObject({ escalations: [] });
    expect(await notificationsFor(t, ids, "escalation.sla_breached")).toHaveLength(2);
  });

  it("alerts support and the founder on breached exception SLA", async () => {
    const { t, ids } = await setup();
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "open_exception",
      payload: { trigger: "stuck_connection", reason: "OAuth failed twice" },
    });
    if (!opened.ok) throw new Error(`open failed: ${opened.error.code}`);
    const exceptionId = (opened.value.data as { exceptionId: string }).exceptionId;
    setNow(t, new Date("2026-10-06T15:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    expect(outcome.slaBreached).toMatchObject({ exceptions: [exceptionId] });
    const notes = await notificationsFor(t, ids, "exception.sla_breached");
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => (note.payload as { recipientRole?: unknown }).recipientRole).sort()).toEqual(
      ["founder", "support"],
    );
  });
});

describe("run_deadlines scope trigger", () => {
  it("opens the scope decision at 6 weeks without 3 passes", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    // 5 weeks and 6 days: not yet.
    setNow(t, new Date("2026-11-15T14:00:00.000Z"));
    expect((await runDeadlines(t, ids)).scopeDecisionsOpened).toEqual([]);
    // 6 weeks: the founder decides with the client.
    setNow(t, new Date("2026-11-16T14:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    expect(outcome.scopeDecisionsOpened).toEqual([round.frontId]);
    const front = await t.deps.uow.repos.fronts.get(SCOPE(ids), round.frontId);
    expect(front?.status).toBe("scope_decision");
    // Already decided: quiet.
    expect((await runDeadlines(t, ids)).scopeDecisionsOpened).toEqual([]);
  });
});

describe("run_deadlines robustness", () => {
  it("collects per-object failures and continues", async () => {
    const { t, ids } = await setup();
    const batch = await deliverTestBatch(t, ids, {
      items: [
        { scheduledFor: new Date("2026-10-09T12:00:00.000Z") },
        { scheduledFor: new Date("2026-10-09T15:00:00.000Z") },
      ],
    });
    const escalationId = await openContentEscalation(t, ids, batch.itemIds[0]!);
    const deferred = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "defer_to_client" },
    });
    expect(deferred.ok).toBe(true);
    // Corrupt the parts jsonb: the wait expiry fails on read.
    await t.deps.uow.repos.escalations.update(SCOPE(ids), escalationId, {
      parts: "junk" as unknown as never,
    });
    setNow(t, new Date("2026-10-09T12:00:00.000Z"));
    const outcome = await runDeadlines(t, ids);
    // The expired item still went through despite the poisoned escalation.
    expect(outcome.itemsExpired).toEqual([batch.itemIds[0]]);
    expect(outcome.failures).toMatchObject([{ objectId: escalationId, code: "corrupt_parts" }]);
  });

  it("skips closed accounts and forbids non-system actors", async () => {
    const { t, ids } = await setup();
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "closed" });
    expect((await runDeadlines(t, ids)).skipped).toBe("closed");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "run_deadlines",
      payload: {},
    });
    expect(outcome.ok).toBe(false);
  });
});
