// run_reminders: implantação stall path (2/5/7/10 business days), batch
// thresholds (24 h / 4 h), capped client-wait reminders, and the
// once-per-threshold idempotency. Simulated clock throughout.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { REMINDER_SENT_EVENT } from "./jobs-reminders";
import {
  ctx,
  deliverTestBatch,
  setup,
  type ItemIds,
  type TestDeps,
} from "./testing/items";
import { setNow } from "./testing/calibration";

// The in-memory stores stamp rows with the wall clock (like Postgres defaultNow), while the domain runs on
// the fixed test clock (2026-10-05T14:00Z). Pin the wall clock to it, or business-day math drifts with the calendar.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T14:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function runReminders(t: TestDeps, ids: ItemIds) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "run_reminders",
    payload: {},
  });
  if (!outcome.ok) {
    throw new Error(`run_reminders failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return outcome.value.data as Record<string, unknown>;
}

async function reminderMarkers(t: TestDeps, ids: ItemIds) {
  return t.deps.uow.repos.events.list(SCOPE(ids), { eventType: REMINDER_SENT_EVENT });
}

async function notificationsFor(t: TestDeps, ids: ItemIds, templateKey: string) {
  const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
    eventType: "notification.requested",
  });
  return events.filter(
    (event) => (event.payload as { templateKey?: unknown })?.templateKey === templateKey,
  );
}

async function seedClientActivity(t: TestDeps, ids: ItemIds, at: Date) {
  await t.deps.uow.repos.events.create(SCOPE(ids), {
    actorType: "client_person",
    actorId: "person-ana",
    actorRole: "approver",
    eventType: "comment.posted",
    occurredAt: at,
  });
}

describe("run_reminders implantação", () => {
  it("reminds at 2 business days stalled, once", async () => {
    const { t, ids } = await setup();
    // Opened Mon 2026-10-05 11:00 SP; Wed 10-07 is 2 business days later.
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    const first = await runReminders(t, ids);
    expect(first.implantation).toMatchObject({ action: "reminded", threshold: "day2" });
    expect(await notificationsFor(t, ids, "implantation.reminder_day2")).toHaveLength(1);
    const second = await runReminders(t, ids);
    expect(second.implantation).toMatchObject({ action: "none" });
    expect(await reminderMarkers(t, ids)).toHaveLength(1);
  });

  it("skips weekends and the 10-12 holiday before the day-5 reminder", async () => {
    const { t, ids } = await setup();
    // Fri 10-09: 4 business days stalled — day2 due, day5 not yet.
    setNow(t, new Date("2026-10-09T14:00:00.000Z"));
    const friday = await runReminders(t, ids);
    expect(friday.implantation).toMatchObject({ threshold: "day2" });
    // Mon 10-12 is Nossa Senhora Aparecida: still 4, nothing new.
    setNow(t, new Date("2026-10-12T14:00:00.000Z"));
    const holiday = await runReminders(t, ids);
    expect(holiday.implantation).toMatchObject({ action: "none" });
    // Tue 10-13: 5 business days — day5 with the simplify offer.
    setNow(t, new Date("2026-10-13T14:00:00.000Z"));
    const tuesday = await runReminders(t, ids);
    expect(tuesday.implantation).toMatchObject({ threshold: "day5" });
    const notes = await notificationsFor(t, ids, "implantation.reminder_day5");
    expect(notes).toHaveLength(1);
    expect((notes[0]!.payload as { detail?: unknown }).detail).toMatchObject({
      simplifyOffer: true,
    });
  });

  it("opens the stall exception at 7 and pauses at 10", async () => {
    const { t, ids } = await setup();
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    await runReminders(t, ids);
    setNow(t, new Date("2026-10-13T14:00:00.000Z"));
    await runReminders(t, ids);
    // Thu 10-15: 7 business days — automatic exception, once.
    setNow(t, new Date("2026-10-15T14:00:00.000Z"));
    const seventh = await runReminders(t, ids);
    expect(seventh.implantation).toMatchObject({ action: "exception_opened" });
    const exceptions = await t.deps.uow.repos.exceptions.list(SCOPE(ids));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ trigger: "stalled_implantation", status: "open" });
    // Tue 10-20: 10 business days — implantação pausada.
    setNow(t, new Date("2026-10-20T14:00:00.000Z"));
    const tenth = await runReminders(t, ids);
    expect(tenth.implantation).toMatchObject({ action: "paused" });
    const account = await t.deps.uow.repos.accounts.get(ids.workspaceId, ids.accountId);
    expect(account?.status).toBe("paused");
    // Paused accounts stay quiet.
    const quiet = await runReminders(t, ids);
    expect(quiet.implantation).toMatchObject({ action: "none" });
    expect(await t.deps.uow.repos.exceptions.list(SCOPE(ids))).toHaveLength(1);
  });

  it("catch-up run fires only the highest action and supersedes the rest", async () => {
    const { t, ids } = await setup();
    setNow(t, new Date("2026-10-20T14:00:00.000Z"));
    const outcome = await runReminders(t, ids);
    expect(outcome.implantation).toMatchObject({ action: "paused" });
    const markers = await reminderMarkers(t, ids);
    expect(markers).toHaveLength(4);
    const superseded = markers.filter(
      (marker) => (marker.payload as { supersededBy?: unknown }).supersededBy === "paused",
    );
    expect(superseded).toHaveLength(3);
    // No late day-2/day-5 reminders and no exception went out.
    expect(await notificationsFor(t, ids, "implantation.reminder_day2")).toHaveLength(0);
    expect(await t.deps.uow.repos.exceptions.list(SCOPE(ids))).toHaveLength(0);
  });

  it("client activity resets the stall clock", async () => {
    const { t, ids } = await setup();
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    await runReminders(t, ids);
    await seedClientActivity(t, ids, new Date("2026-10-07T15:00:00.000Z"));
    // The day-5 threshold counts from the new progress, not from opening:
    // Wed 10-07 → Tue 10-13 is 3 business days (weekend + holiday skipped).
    setNow(t, new Date("2026-10-13T14:00:00.000Z"));
    const outcome = await runReminders(t, ids);
    expect(outcome.implantation).toMatchObject({ action: "none", businessDaysStalled: 3 });
  });

  it("system events never count as progress", async () => {
    const { t, ids } = await setup();
    await t.deps.uow.repos.events.create(SCOPE(ids), {
      actorType: "system",
      actorId: "equipe-deadlines",
      actorRole: "system",
      eventType: "sla.breached",
      occurredAt: new Date("2026-10-07T13:00:00.000Z"),
    });
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    const outcome = await runReminders(t, ids);
    expect(outcome.implantation).toMatchObject({
      action: "reminded",
      threshold: "day2",
      businessDaysStalled: 2,
    });
  });
});

describe("run_reminders batches", () => {
  // Calibrating accounts isolate the batch path from the implantação one.
  async function setupBatch(now: string) {
    const { t, ids } = await setup();
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
      status: "calibrating",
    });
    setNow(t, new Date(now));
    return { t, ids };
  }

  it("reminds 24 h before aprovar até, once", async () => {
    const { t, ids } = await setupBatch("2026-10-06T12:00:00.000Z");
    await deliverTestBatch(t, ids, {
      approveByAt: new Date("2026-10-08T12:00:00.000Z"),
      items: [{ scheduledFor: new Date("2026-10-16T15:00:00.000Z") }],
    });
    setNow(t, new Date("2026-10-07T12:00:00.000Z"));
    const first = await runReminders(t, ids);
    expect(first.batches).toHaveLength(1);
    expect(await notificationsFor(t, ids, "batch.reminder_24h")).toHaveLength(1);
    const second = await runReminders(t, ids);
    expect(second.batches).toEqual([]);
  });

  it("reminds 4 h before the first pending item limit", async () => {
    const { t, ids } = await setupBatch("2026-10-06T12:00:00.000Z");
    await deliverTestBatch(t, ids, {
      approveByAt: new Date("2026-10-20T12:00:00.000Z"),
      items: [
        { scheduledFor: new Date("2026-10-09T12:00:00.000Z") },
        { scheduledFor: new Date("2026-10-10T12:00:00.000Z") },
      ],
    });
    // First limit Fri 10:00Z; the reminder is due from 06:00Z.
    setNow(t, new Date("2026-10-09T05:00:00.000Z"));
    expect((await runReminders(t, ids)).batches).toEqual([]);
    setNow(t, new Date("2026-10-09T06:00:00.000Z"));
    const outcome = await runReminders(t, ids);
    expect(outcome.batches).toMatchObject([{ reminded: ["item4h"] }]);
    expect(await notificationsFor(t, ids, "batch.reminder_item_4h")).toHaveLength(1);
  });

  it("stays quiet with no pending items or past thresholds", async () => {
    const { t, ids } = await setupBatch("2026-10-06T12:00:00.000Z");
    const batch = await deliverTestBatch(t, ids, {
      approveByAt: new Date("2026-10-08T12:00:00.000Z"),
      items: [{ scheduledFor: new Date("2026-10-16T15:00:00.000Z") }],
    });
    for (const itemId of batch.itemIds) {
      const declined = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "decline_publish",
        payload: { itemId, reason: "não vai sair" },
      });
      expect(declined.ok).toBe(true);
    }
    setNow(t, new Date("2026-10-07T12:00:00.000Z"));
    expect((await runReminders(t, ids)).batches).toEqual([]);
  });
});

describe("run_reminders client waits", () => {
  async function setupWait() {
    const { t, ids } = await setup();
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
      status: "calibrating",
    });
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-30T12:00:00.000Z") }],
    });
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: {
        kind: "content",
        severity: "normal",
        itemId: batch.itemIds[0],
        reason: "claim without source",
      },
    });
    if (!opened.ok) throw new Error(`open failed: ${opened.error.code}`);
    const escalationId = (opened.value.data as { escalationId: string }).escalationId;
    const deferred = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "defer_to_client" },
    });
    if (!deferred.ok) throw new Error(`defer failed: ${deferred.error.code}`);
    return { t, ids, escalationId };
  }

  it("reminds once per business day, capped at two", async () => {
    const { t, ids, escalationId } = await setupWait();
    // Deferred Mon 10-05 14:00Z; due Wed 10-07 14:00Z.
    setNow(t, new Date("2026-10-06T14:00:00.000Z"));
    const first = await runReminders(t, ids);
    expect(first.clientWaits).toMatchObject([{ escalationId, reminded: [1] }]);
    setNow(t, new Date("2026-10-07T13:00:00.000Z"));
    const second = await runReminders(t, ids);
    expect(second.clientWaits).toMatchObject([{ escalationId, reminded: [2] }]);
    // Past the wait: the deadlines sweep owns it now, not reminders.
    setNow(t, new Date("2026-10-07T15:00:00.000Z"));
    expect((await runReminders(t, ids)).clientWaits).toEqual([]);
    expect(await notificationsFor(t, ids, "escalation.client_reminder")).toHaveLength(2);
  });
});

describe("run_reminders gates", () => {
  it("skips suspended and closed accounts", async () => {
    const { t, ids } = await setup();
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
      status: "suspended",
    });
    setNow(t, new Date("2026-10-20T14:00:00.000Z"));
    const suspended = await runReminders(t, ids);
    expect(suspended.implantation).toMatchObject({ action: "none" });
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "closed" });
    expect((await runReminders(t, ids)).skipped).toBe("closed");
  });

  it("forbids non-system actors", async () => {
    const { t, ids } = await setup();
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "run_reminders",
      payload: {},
    });
    expect(outcome.ok).toBe(false);
  });
});
