// Pending signals discovery + the notification outbox record (#549):
// signals without an ingest marker stay pending, deliveries record per
// event with channel union, and the record command only accepts real
// `notification.requested` events.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { recordNotificationDeliveredPayloadSchema } from "./envelope";
import { NOTIFICATION_REQUESTED_EVENT, listNotificationOutbox } from "./jobs-delivery";
import { pendingSignalEvents } from "./jobs-signals";
import {
  ctx,
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

async function seedEvent(
  t: TestDeps,
  ids: ItemIds,
  input: { eventType: string; at?: Date; payload?: unknown },
): Promise<string> {
  const event = await t.deps.uow.repos.events.create(SCOPE(ids), {
    actorType: "agent",
    actorId: "estrategista",
    actorRole: "agent",
    eventType: input.eventType,
    payload: input.payload ?? null,
    occurredAt: input.at ?? t.deps.clock.now(),
  });
  return event.id;
}

describe("pendingSignalEvents", () => {
  it("lists signals without an ingest marker, oldest first", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const first = await seedEvent(t, ids, {
      eventType: "agent.turn_failed",
      at: new Date("2026-10-06T10:00:00.000Z"),
      payload: { taskKind: "research", error: "timeout" },
    });
    const second = await seedEvent(t, ids, {
      eventType: "agent.budget_exceeded",
      at: new Date("2026-10-06T11:00:00.000Z"),
      payload: { taskKind: "writing" },
    });
    await seedEvent(t, ids, { eventType: "item.approved" });
    expect((await pendingSignalEvents(t.deps.uow.repos, scope)).map((e) => e.id)).toEqual([
      first,
      second,
    ]);
    const ingested = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId: first },
    });
    expect(ingested.ok).toBe(true);
    expect((await pendingSignalEvents(t.deps.uow.repos, scope)).map((e) => e.id)).toEqual([second]);
  });
});

describe("record_notification_delivered", () => {
  async function setupNotification(t: TestDeps, ids: ItemIds): Promise<string> {
    // A day-2 stall writes a notification.requested through the real path.
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "run_reminders",
      payload: {},
    });
    if (!outcome.ok) throw new Error(`reminders failed: ${outcome.error.code}`);
    const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
      eventType: NOTIFICATION_REQUESTED_EVENT,
    });
    const requested = events.find(
      (event) => (event.payload as { templateKey?: unknown })?.templateKey === "implantation.reminder_day2",
    );
    if (!requested) throw new Error("no reminder notification requested");
    return requested.id;
  }

  it("records deliveries per event, unioning channels", async () => {
    const { t, ids } = await setup();
    const eventId = await setupNotification(t, ids);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered",
      payload: { eventId, channels: ["inapp"] },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered",
      payload: { eventId, channels: ["email", "inapp"] },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ eventId, channels: ["inapp", "email"] });
    const outbox = await listNotificationOutbox(t.deps.uow.repos, SCOPE(ids));
    expect(outbox.find((entry) => entry.event.id === eventId)).toMatchObject({
      deliveredChannels: ["inapp", "email"],
    });
  });

  it("rejects unknown events, non-notifications and non-system actors", async () => {
    const { t, ids } = await setup();
    const eventId = await setupNotification(t, ids);
    const other = await seedEvent(t, ids, { eventType: "item.approved" });
    const unknown = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered",
      payload: { eventId: "00000000-0000-0000-0000-000000000000", channels: ["inapp"] },
    });
    expect(unknown.ok).toBe(false);
    const notNotification = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered",
      payload: { eventId: other, channels: ["inapp"] },
    });
    expect(notNotification.ok).toBe(false);
    if (!notNotification.ok) {
      expect(notNotification.error.code).toBe("not_a_notification");
    }
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "record_notification_delivered",
      payload: { eventId, channels: ["inapp"] },
    });
    expect(forbidden.ok).toBe(false);
  });

  it("channel enum accepts the terminal marker and every legacy value, up to 5, and rejects the rest", () => {
    const eventId = "00000000-0000-4000-8000-000000000001";
    const parse = (channels: unknown) => recordNotificationDeliveredPayloadSchema.safeParse({ eventId, channels }).success;
    for (const channels of [["inapp"], ["email"], ["internal"], ["skipped"], ["completed"], ["inapp", "email"],
      ["inapp", "email", "completed"], ["inapp", "email", "internal", "skipped", "completed"]]) {
      expect(parse(channels), JSON.stringify(channels)).toBe(true);
    }
    expect(parse([])).toBe(false);
    expect(parse(["inapp", "email", "internal", "skipped", "completed", "inapp"])).toBe(false);   // > 5
    expect(parse(["done"])).toBe(false);
    expect(parse(["COMPLETED"])).toBe(false);
    expect(parse(["completed", "sms"])).toBe(false);
    expect(parse("completed")).toBe(false);
    expect(parse([null])).toBe(false);
  });

  it("persists the completed marker unioned with transport channels", async () => {
    const { t, ids } = await setup();
    const eventId = await setupNotification(t, ids);
    const out = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered", payload: { eventId, channels: ["inapp"] },
    });
    expect(out.ok).toBe(true);
    const done = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "record_notification_delivered", payload: { eventId, channels: ["completed"] },
    });
    expect(done.ok).toBe(true);
    const outbox = await listNotificationOutbox(t.deps.uow.repos, SCOPE(ids));
    expect(outbox.find((entry) => entry.event.id === eventId)?.deliveredChannels).toEqual(["inapp", "completed"]);
  });
});
