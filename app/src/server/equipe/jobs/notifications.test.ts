// Notification outbox delivery (#549): recipient resolution, preference
// filtering, partial-failure resume, idempotent re-runs, and the proof
// that a send failure never undoes the requesting command.

import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import {
  ctx,
  deliverTestBatch,
  makeTestDeps,
  openTestAccount,
  type ItemIds,
  type TestDeps,
} from "../module/testing/publication";
import { listNotificationOutbox } from "../module/jobs-delivery";
import { setNow } from "../module/testing/calibration";
import {
  createNotificationsHandler,
  deliverOutboxEntry,
  knownTemplateKeys,
  notificationTypeFor,
  resolveNotificationRecipients,
  type NotificationDeliveryAdapters,
  type NotificationUser,
  type NotificationsJobDeps,
} from "./notifications";
import type { EquipeJobDeps } from "./shared";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });
const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };

const VERIFIED_USER: NotificationUser = {
  email: "ana@login.com",
  emailVerified: true,
  emailNotificationsEnabled: true,
};

function makeAdapters(users: Record<string, NotificationUser> = {}) {
  const inbox: Array<{ userId: string; type: string; title: string; message: string }> = [];
  const sent: Array<{ to: string; subject: string }> = [];
  const adapters: NotificationDeliveryAdapters = {
    users: { get: async (userId) => users[userId] ?? null },
    inbox: {
      insert: async (row) => {
        inbox.push(row);
      },
    },
    mailer: {
      send: async (mail) => {
        sent.push(mail);
      },
    },
  };
  return { inbox, sent, adapters };
}

async function setupPeople() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t, {
    people: [
      { name: "Ana", role: "approver", userId: "user-ana", email: "ana@client.com" },
      { name: "Carla", role: "substitute", email: "carla@client.com" },
    ],
  });
  return { t, ids };
}

async function seedRequested(
  t: TestDeps,
  ids: ItemIds,
  payload: { recipientRole: string; templateKey: string; detail?: unknown },
): Promise<string> {
  const event = await t.deps.uow.repos.events.create(SCOPE(ids), {
    actorType: "system",
    actorId: "probe",
    actorRole: "system",
    eventType: "notification.requested",
    payload,
    occurredAt: t.deps.clock.now(),
  });
  return event.id;
}

async function record(t: TestDeps, ids: ItemIds, eventId: string, channels: string[]) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "record_notification_delivered",
    payload: { eventId, channels },
  });
  if (!outcome.ok) throw new Error(`record failed: ${outcome.error.code}`);
}

async function deliver(
  t: TestDeps,
  ids: ItemIds,
  adapters: NotificationDeliveryAdapters,
  eventId: string,
) {
  const outbox = await listNotificationOutbox(t.deps.uow.repos, SCOPE(ids));
  const entry = outbox.find((row) => row.event.id === eventId)!;
  return deliverOutboxEntry({
    stores: { repos: t.deps.uow.repos, internal: t.deps.uow.internal },
    adapters,
    scope: SCOPE(ids),
    entry,
    record: (id, channels) => record(t, ids, id, channels),
  });
}

describe("notification types", () => {
  it("every template maps to a type that fits the 32-char column", () => {
    for (const key of knownTemplateKeys()) {
      const type = notificationTypeFor(key);
      expect(type.length).toBeLessThanOrEqual(32);
      expect(type.startsWith("eq_")).toBe(true);
    }
    expect(notificationTypeFor("item.window_missed")).toBe("eq_item_window_missed");
  });
});

describe("recipient resolution", () => {
  it("resolves client, staff and founder roles", async () => {
    const { t, ids } = await setupPeople();
    const stores = { repos: t.deps.uow.repos, internal: t.deps.uow.internal };
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "approver")).toEqual([
      { userId: "user-ana", email: "ana@client.com" },
    ]);
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "custodian")).toEqual([]);
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "strategist")).toEqual({
      internal: true,
    });
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "nope")).toEqual({
      unknown: true,
    });
    // Staff and founder read the global staff rows.
    await t.deps.uow.internal.staff.create({
      role: "quality",
      displayName: "Q",
      active: true,
      userId: "user-founder",
    });
    await t.deps.uow.internal.staff.create({
      role: "operations",
      displayName: "Ops",
      active: true,
      userId: "user-founder",
    });
    // The queue includes the login-less seeded row; founder skips nulls.
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "quality")).toEqual([
      { userId: null, email: null },
      { userId: "user-founder", email: null },
    ]);
    // Founder fans out to every active staffer, deduped by user.
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "founder")).toEqual([
      { userId: "user-founder", email: null },
    ]);
  });
});

describe("deliverOutboxEntry", () => {
  it("delivers in-app + email and records both", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    const eventId = await seedRequested(t, ids, {
      recipientRole: "approver",
      templateKey: "item.window_missed",
    });
    const outcome = await deliver(t, ids, adapters, eventId);
    expect(outcome).toMatchObject({ eventId, channels: ["inapp", "email"], delivered: true });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      userId: "user-ana",
      type: "eq_item_window_missed",
      title: "Janela perdida",
    });
    // The login email wins over the bare contact email.
    expect(sent).toMatchObject([{ to: "ana@login.com", subject: "Janela perdida" }]);
    // Re-run: the record makes it a quiet skip.
    const again = await deliver(t, ids, adapters, eventId);
    expect(again.delivered).toBe(false);
    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("honors email preferences and bare contact emails", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({
      "user-ana": { ...VERIFIED_USER, emailNotificationsEnabled: false },
    });
    const eventId = await seedRequested(t, ids, {
      recipientRole: "approver",
      templateKey: "item.published",
    });
    await deliver(t, ids, adapters, eventId);
    // Opted out: in-app still lands, email does not.
    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(0);
    // The substitute has no login: the bare contact email receives.
    const subId = await seedRequested(t, ids, {
      recipientRole: "substitute",
      templateKey: "item.published",
    });
    await deliver(t, ids, adapters, subId);
    expect(sent).toMatchObject([{ to: "carla@client.com" }]);
    expect(inbox).toHaveLength(1);
  });

  it("resumes after a partial failure without duplicating", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    let failEmail = true;
    const flaky: NotificationDeliveryAdapters = {
      ...adapters,
      mailer: {
        send: async (mail) => {
          if (failEmail) throw new Error("resend down");
          sent.push(mail);
        },
      },
    };
    const eventId = await seedRequested(t, ids, {
      recipientRole: "approver",
      templateKey: "item.published",
    });
    await expect(deliver(t, ids, flaky, eventId)).rejects.toThrow("resend down");
    // In-app went out and is recorded; the retry only sends the email.
    failEmail = false;
    const outcome = await deliver(t, ids, flaky, eventId);
    expect(outcome).toMatchObject({ channels: ["inapp", "email"], delivered: true });
    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("records nothing when the first channel fails", async () => {
    const { t, ids } = await setupPeople();
    const { adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    const broken: NotificationDeliveryAdapters = {
      ...adapters,
      inbox: {
        insert: async () => {
          throw new Error("db down");
        },
      },
    };
    const eventId = await seedRequested(t, ids, {
      recipientRole: "approver",
      templateKey: "item.published",
    });
    await expect(deliver(t, ids, broken, eventId)).rejects.toThrow("db down");
    const record = await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), eventId);
    expect(record).toBeNull();
  });

  it("no-ops strategist mail and skips unknown roles, templates and payloads", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    const internal = await seedRequested(t, ids, {
      recipientRole: "strategist",
      templateKey: "item.held",
    });
    expect(await deliver(t, ids, adapters, internal)).toMatchObject({
      channels: ["internal"],
      delivered: false,
    });
    const skipped = await seedRequested(t, ids, {
      recipientRole: "ghost",
      templateKey: "item.held",
    });
    expect(await deliver(t, ids, adapters, skipped)).toMatchObject({
      channels: ["skipped"],
      delivered: false,
    });
    const fallback = await seedRequested(t, ids, {
      recipientRole: "approver",
      templateKey: "future.key",
    });
    const delivered = await deliver(t, ids, adapters, fallback);
    expect(delivered.delivered).toBe(true);
    expect(inbox[0]).toMatchObject({ title: "Atualização da Equipe" });
    const malformed = await t.deps.uow.repos.events.create(SCOPE(ids), {
      actorType: "system",
      actorId: "probe",
      actorRole: "system",
      eventType: "notification.requested",
      payload: { nope: true },
      occurredAt: t.deps.clock.now(),
    });
    expect(await deliver(t, ids, adapters, malformed.id)).toMatchObject({
      channels: ["skipped"],
      delivered: false,
    });
    expect(sent).toHaveLength(1);
  });
});

describe("notifications handler", () => {
  function makeDeps(t: TestDeps, adapters: NotificationDeliveryAdapters): NotificationsJobDeps {
    const base: EquipeJobDeps = {
      uow: t.deps.uow,
      clock: t.deps.clock,
      isEnabledForWorkspace: () => true,
      gatewayFor: () => t.gateway,
      publisher: t.publisher,
    };
    return { ...base, delivery: adapters };
  }

  it("drains the outbox and never undoes the requesting command on failure", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    // A real command requests the notification: expire an item past its
    // limit, which notifies the approver.
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    setNow(t, new Date("2026-10-09T10:00:00.000Z"));
    const expired = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "run_deadlines",
      payload: {},
    });
    expect(expired.ok).toBe(true);
    const scope = SCOPE(ids);
    const itemBefore = await t.deps.uow.repos.items.get(scope, batch.itemIds[0]!);
    expect(itemBefore?.status).toBe("missed_window");
    // Fail every send: the handler reports failures, the command stands.
    const failing: NotificationDeliveryAdapters = {
      ...adapters,
      inbox: {
        insert: async () => {
          throw new Error("db down");
        },
      },
    };
    const failed = await createNotificationsHandler(makeDeps(t, failing))({
      event: { data: {} },
      step,
    });
    expect(failed.failed.length).toBeGreaterThan(0);
    expect(inbox).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, batch.itemIds[0]!))?.status).toBe(
      "missed_window",
    );
    // The failed send records nothing for its event (internal/skipped
    // entries still record — only sends failed).
    const requested = await t.deps.uow.repos.events.list(scope, {
      eventType: "notification.requested",
    });
    const missedNote = requested.find(
      (note) => (note.payload as { templateKey?: unknown }).templateKey === "item.window_missed",
    )!;
    expect(await t.deps.uow.repos.deliveries.getByEvent(scope, missedNote.id)).toBeNull();
    // Healthy run: everything drains, second run is quiet.
    const drained = await createNotificationsHandler(makeDeps(t, adapters))({
      event: { data: {} },
      step,
    });
    expect(drained.failed).toEqual([]);
    expect(drained.delivered.length).toBeGreaterThan(0);
    expect(inbox.length).toBeGreaterThan(0);
    expect(sent.length).toBeGreaterThan(0);
    const quiet = await createNotificationsHandler(makeDeps(t, adapters))({
      event: { data: {} },
      step,
    });
    expect(quiet).toMatchObject({ delivered: [], failed: [] });
  });
});
