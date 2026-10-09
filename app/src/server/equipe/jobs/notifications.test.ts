// Notification outbox delivery (#549): recipient resolution, preference
// filtering, partial-failure resume, idempotent re-runs, and the proof
// that a send failure never undoes the requesting command.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
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
import { listEnabledAccounts, type EquipeJobDeps } from "./shared";

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
    users: { get: vi.fn(async (userId: string) => users[userId] ?? null) },
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
  actorType: "system" | "agent" = "system",
): Promise<string> {
  const event = await t.deps.uow.repos.events.create(SCOPE(ids), {
    actorType,
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
  recordFn?: (id: string, channels: string[]) => Promise<void>,
) {
  const outbox = await listNotificationOutbox(t.deps.uow.repos, SCOPE(ids));
  const entry = outbox.find((row) => row.event.id === eventId)!;
  return deliverOutboxEntry({
    stores: { repos: t.deps.uow.repos, internal: t.deps.uow.internal },
    adapters,
    scope: SCOPE(ids),
    entry,
    record: recordFn ?? ((id, channels) => record(t, ids, id, channels)),
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
  it("resolves client, staff and internal roles", async () => {
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
    // Staff roles read the global staff rows.
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
    // The queue includes the login-less seeded row.
    expect(await resolveNotificationRecipients(stores, SCOPE(ids), "quality")).toEqual([
      { userId: null, email: null },
      { userId: "user-founder", email: null },
    ]);
  });

  it("resolves the founder to allowlisted staff users only", async () => {
    const { t, ids } = await setupPeople();
    const stores = { repos: t.deps.uow.repos, internal: t.deps.uow.internal };
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
    await t.deps.uow.internal.staff.create({
      role: "support",
      displayName: "S",
      active: true,
      userId: "user-other",
    });
    const { adapters } = makeAdapters({
      "user-founder": { ...VERIFIED_USER, email: "Founder@Adscale.test" },
      "user-other": { ...VERIFIED_USER, email: "other@adscale.test" },
    });
    vi.mocked(logger.warn).mockClear();
    const resolved = await resolveNotificationRecipients(stores, SCOPE(ids), "founder", {
      users: adapters.users,
      ownerEmails: new Set(["founder@adscale.test"]),
    });
    // One row for the founder despite two staff roles; other staff and the
    // login-less seeded rows are excluded. Matching is case-insensitive.
    expect(resolved).toEqual([{ userId: "user-founder", email: null }]);
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  it("falls back to the operations queue when the allowlist matches nobody", async () => {
    const { t, ids } = await setupPeople();
    const stores = { repos: t.deps.uow.repos, internal: t.deps.uow.internal };
    await t.deps.uow.internal.staff.create({
      role: "quality",
      displayName: "Q",
      active: true,
      userId: "user-q",
    });
    await t.deps.uow.internal.staff.create({
      role: "operations",
      displayName: "Ops",
      active: true,
      userId: "user-ops",
    });
    const { adapters } = makeAdapters({
      "user-q": VERIFIED_USER,
      "user-ops": { ...VERIFIED_USER, email: "ops@adscale.test" },
    });
    vi.mocked(logger.warn).mockClear();
    const resolved = await resolveNotificationRecipients(stores, SCOPE(ids), "founder", {
      users: adapters.users,
      ownerEmails: new Set(["owner-without-login@adscale.test"]),
    });
    // The allowlist owner holds no staff login: the breach pages the
    // operations queue (login-less seeded row included, like the role).
    expect(resolved).toEqual([
      { userId: null, email: null },
      { userId: "user-ops", email: null },
    ]);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toContain("falling back to operations");
  });
});

describe("deliverOutboxEntry", () => {
  it("defers automated delivery during suspension and delivers once after resume", async () => {
    const { t, ids } = await setupPeople();
    const { inbox, sent, adapters } = makeAdapters({ "user-ana": VERIFIED_USER });
    const eventId = await seedRequested(t, ids, { recipientRole: "approver", templateKey: "batch.delivered" }, "agent");
    const suspended = await executeCommand(t.deps, ctx(ids, ids.actors.operations), { type: "suspend_execution", payload: {} });
    expect(suspended.ok).toBe(true);
    const recordSpy = vi.fn(async () => {});
    const blocked = await deliver(t, ids, adapters, eventId, recordSpy);
    expect(blocked).toEqual({ eventId, channels: [], delivered: false });
    expect(adapters.users.get).not.toHaveBeenCalled();
    expect(inbox).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(recordSpy).not.toHaveBeenCalled();
    const pauseId = suspended.ok ? suspended.value.data.pauseId as string : "";
    expect((await executeCommand(t.deps, ctx(ids, ids.actors.operations), { type: "resume_pause", payload: { pauseId } })).ok).toBe(true);
    const resumed = await deliver(t, ids, adapters, eventId);
    expect(resumed).toMatchObject({ eventId, channels: ["inapp", "email"], delivered: true });
    expect(await deliver(t, ids, adapters, eventId)).toMatchObject({ delivered: false });
    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("still records operational notices while execution is suspended", async () => {
    const { t, ids } = await setupPeople();
    const suspended = await executeCommand(t.deps, ctx(ids, ids.actors.operations), { type: "suspend_execution", payload: {} });
    expect(suspended.ok).toBe(true);
    const eventId = await seedRequested(t, ids, { recipientRole: "strategist", templateKey: "pause.applied" }, "agent");
    const { adapters } = makeAdapters();
    const result = await deliver(t, ids, adapters, eventId);
    expect(result).toMatchObject({ eventId, channels: ["internal"], delivered: false });
    const recorded = await t.deps.uow.repos.deliveries.list(SCOPE(ids));
    expect(recorded.find((row) => row.eventId === eventId)?.channels).toEqual(["internal"]);
  });

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
    expect(inbox[0]).toMatchObject({ title: "Atualização do ADScale" });
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

describe("free accounts still notify Support (request_support → Assinar o plano)", () => {
  async function setupFree(options: { status?: "free" | "closed" } = {}) {
    const t = makeTestDeps();
    const ids = await openTestAccount(t, {
      people: [{ name: "Ana", role: "approver", userId: "user-ana", email: "ana@client.com" }],
    });
    await t.deps.uow.internal.staff.create({ role: "support", displayName: "Suporte", active: true, userId: "user-support" });
    // The real request happens while the account is free (allowed by FREE_ACCOUNT_COMMANDS).
    t.store.accounts.rows.get(ids.accountId)!.status = "free";
    const requested = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_support", payload: { note: "Quero assinar o plano" },
    });
    if (!requested.ok) throw new Error(`request_support failed: ${requested.error.code}`);
    if (options.status) t.store.accounts.rows.get(ids.accountId)!.status = options.status;
    return { t, ids };
  }
  const supportUser: NotificationUser = { email: "suporte@adscale.test", emailVerified: true, emailNotificationsEnabled: true };
  const depsFor = (t: TestDeps, adapters: NotificationDeliveryAdapters): NotificationsJobDeps => ({
    uow: t.deps.uow, clock: t.deps.clock,
    gatewayFor: () => t.gateway, publisher: t.publisher, delivery: adapters,
  });
  const run = (t: TestDeps, adapters: NotificationDeliveryAdapters) =>
    createNotificationsHandler(depsFor(t, adapters))({ event: { data: {} }, step });

  it("delivers the support notification for a FREE account, persists the delivery, and a rerun is quiet", async () => {
    const { t, ids } = await setupFree();
    const { inbox, sent, adapters } = makeAdapters({ "user-support": supportUser });
    const requested = await t.deps.uow.repos.events.list(SCOPE(ids), { eventType: "notification.requested" });
    expect(requested.some((e) => (e.payload as { recipientRole?: string }).recipientRole === "support")).toBe(true);

    const first = await run(t, adapters);
    expect(first.failed).toEqual([]);
    expect(first.delivered.length).toBeGreaterThan(0);
    expect(inbox.filter((row) => row.userId === "user-support")).toHaveLength(1);
    expect(sent.filter((mail) => mail.to === "suporte@adscale.test")).toHaveLength(1);
    for (const id of first.delivered) expect(await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), id)).not.toBeNull();
    // Every eligible channel finished → the terminal marker is persisted.
    const receipt = await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), first.delivered[0]!);
    expect(receipt?.channels).toContain("completed");

    const inboxCount = inbox.length; const sentCount = sent.length;
    const quiet = await run(t, adapters);
    expect(quiet).toMatchObject({ delivered: [], failed: [] });
    expect(inbox).toHaveLength(inboxCount);
    expect(sent).toHaveLength(sentCount);
  });

  it("resumes after a partial failure without duplicating what already went out", async () => {
    const { t } = await setupFree();
    const { inbox, sent, adapters } = makeAdapters({ "user-support": supportUser });
    let failMail = true;
    const flaky: NotificationDeliveryAdapters = { ...adapters, mailer: { send: async (mail) => {
      if (failMail) throw new Error("smtp down");
      await adapters.mailer.send(mail);
    } } };
    const failed = await run(t, flaky);
    expect(failed.failed.length).toBeGreaterThan(0);
    failMail = false;
    const resumed = await run(t, flaky);
    expect(resumed.failed).toEqual([]);
    expect(sent.filter((mail) => mail.to === "suporte@adscale.test")).toHaveLength(1);
    expect(inbox.filter((row) => row.userId === "user-support")).toHaveLength(1);
    const quiet = await run(t, flaky);
    expect(quiet).toMatchObject({ delivered: [], failed: [] });
    expect(sent.filter((mail) => mail.to === "suporte@adscale.test")).toHaveLength(1);
  });

  it("the paid-account sweep selection (default listEnabledAccounts) still does NOT list free accounts", async () => {
    const { t, ids } = await setupFree();
    const listed = await listEnabledAccounts(depsFor(t, makeAdapters().adapters));
    expect(listed.map((a) => a.accountId)).not.toContain(ids.accountId);
  });

  it("never notifies a closed account", async () => {
    const closed = await setupFree({ status: "closed" });
    const c = makeAdapters({ "user-support": supportUser });
    expect(await run(closed.t, c.adapters)).toMatchObject({ delivered: [], failed: [] });
    expect(c.inbox).toEqual([]);
    expect(c.sent).toEqual([]);
  });
});

describe("free accounts are visited only while a notification is pending", () => {
  const supportUser: NotificationUser = { email: "suporte@adscale.test", emailVerified: true, emailNotificationsEnabled: true };
  const optOutUser: NotificationUser = { ...supportUser, emailNotificationsEnabled: false };

  /** A free account whose approver asked for support (real command), optionally without any request. */
  async function freeAccount(t: TestDeps, options: { request?: boolean } = {}) {
    const ids = await openTestAccount(t, { people: [{ name: "Ana", role: "approver", userId: "user-ana", email: "ana@client.com" }] });
    t.store.accounts.rows.get(ids.accountId)!.status = "free";
    if (options.request !== false) {
      const out = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "request_support", payload: { note: "Assinar" } });
      if (!out.ok) throw new Error(`request_support failed: ${out.error.code}`);
      // Only the Support request is under test: close the approver's own notice as already handled.
      const requested = await t.deps.uow.repos.events.list(SCOPE(ids), { eventType: "notification.requested" });
      for (const event of requested) {
        if ((event.payload as { recipientRole?: string }).recipientRole !== "support") {
          await t.deps.uow.repos.deliveries.record(SCOPE(ids), { eventId: event.id, channels: ["completed"] });
        }
      }
    }
    return ids;
  }
  const depsFor = (t: TestDeps, adapters: NotificationDeliveryAdapters): NotificationsJobDeps => ({
    uow: t.deps.uow, clock: t.deps.clock, gatewayFor: () => t.gateway,
    publisher: t.publisher, delivery: adapters,
  });
  const run = (t: TestDeps, adapters: NotificationDeliveryAdapters) =>
    createNotificationsHandler(depsFor(t, adapters))({ event: { data: {} }, step });
  async function support(t: TestDeps, user: NotificationUser = supportUser) {
    await t.deps.uow.internal.staff.create({ role: "support", displayName: "Suporte", active: true, userId: "user-support" });
    return makeAdapters({ "user-support": user });
  }
  /** Spies proving WHICH reads the handler performs. */
  function spies(t: TestDeps) {
    return {
      outbox: vi.spyOn(t.deps.uow.repos.events, "list"),
      byStatus: vi.spyOn(t.deps.uow.internal, "listAccountsByStatus"),
    };
  }
  const freeSweeps = (s: ReturnType<typeof spies>) => s.byStatus.mock.calls.filter(([status]) => status === "free");

  it("many free accounts with no requests or only terminal receipts cause NO outbox reads and no free-status sweep", async () => {
    const t = makeTestDeps();
    const { adapters } = await support(t);
    await freeAccount(t, { request: false });
    await freeAccount(t, { request: false });
    const done = await freeAccount(t);
    await run(t, adapters);                               // delivers + marks the only pending one
    const s = spies(t);
    const quiet = await run(t, adapters);
    expect(quiet).toMatchObject({ delivered: [], failed: [] });
    expect(s.outbox).not.toHaveBeenCalled();              // no outbox enumeration for any free account
    expect(freeSweeps(s)).toEqual([]);                    // never lists every free account
    void done;
  });

  it("a completed free notification is not re-enumerated on later runs", async () => {
    const t = makeTestDeps();
    const { inbox, sent, adapters } = await support(t);
    const ids = await freeAccount(t);
    expect((await run(t, adapters)).delivered.length).toBeGreaterThan(0);
    const inboxCount = inbox.length; const sentCount = sent.length;
    const s = spies(t);
    for (let i = 0; i < 3; i += 1) expect(await run(t, adapters)).toMatchObject({ delivered: [], failed: [] });
    expect(s.outbox.mock.calls.filter(([scope]) => scope.accountId === ids.accountId)).toEqual([]);
    expect(inbox).toHaveLength(inboxCount);
    expect(sent).toHaveLength(sentCount);
  });

  it("a partial delivery stays pending and resumes without duplicating, then completes", async () => {
    const t = makeTestDeps();
    const { inbox, sent, adapters } = await support(t);
    const ids = await freeAccount(t);
    let failMail = true;
    const flaky: NotificationDeliveryAdapters = { ...adapters, mailer: { send: async (mail) => {
      if (failMail) throw new Error("smtp down");
      await adapters.mailer.send(mail);
    } } };
    expect((await run(t, flaky)).failed.length).toBeGreaterThan(0);
    const inappAfterFailure = inbox.filter((r) => r.userId === "user-support").length;
    const pendingEvent = (await t.deps.uow.repos.events.list(SCOPE(ids), { eventType: "notification.requested" }))
      .find((e) => (e.payload as { recipientRole?: string }).recipientRole === "support")!;
    const partial = await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), pendingEvent.id);
    expect(partial?.channels ?? []).not.toContain("completed");          // partial is NOT terminal
    failMail = false;
    const resumed = await run(t, flaky);
    expect(resumed.failed).toEqual([]);
    expect(inbox.filter((r) => r.userId === "user-support")).toHaveLength(inappAfterFailure); // inapp not resent
    expect(sent.filter((m) => m.to === "suporte@adscale.test")).toHaveLength(1);
    expect((await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), pendingEvent.id))?.channels).toContain("completed");
    const s = spies(t);
    await run(t, flaky);
    expect(s.outbox.mock.calls.filter(([scope]) => scope.accountId === ids.accountId)).toEqual([]);
  });

  it("an email opt-out finishes inapp-only, is marked completed and never comes back", async () => {
    const t = makeTestDeps();
    const { inbox, sent, adapters } = await support(t, optOutUser);
    const ids = await freeAccount(t);
    const first = await run(t, adapters);
    expect(first.failed).toEqual([]);
    expect(inbox.filter((r) => r.userId === "user-support")).toHaveLength(1);
    expect(sent).toEqual([]);
    const event = (await t.deps.uow.repos.events.list(SCOPE(ids), { eventType: "notification.requested" }))
      .find((e) => (e.payload as { recipientRole?: string }).recipientRole === "support")!;
    expect((await t.deps.uow.repos.deliveries.getByEvent(SCOPE(ids), event.id))?.channels).toEqual(expect.arrayContaining(["inapp", "completed"]));
    const s = spies(t);
    await run(t, adapters);
    expect(s.outbox.mock.calls.filter(([scope]) => scope.accountId === ids.accountId)).toEqual([]);
    expect(inbox.filter((r) => r.userId === "user-support")).toHaveLength(1);
  });

  it("legacy receipts: inapp+email without marker is terminal; inapp-only is re-evaluated once without duplicating", async () => {
    const t = makeTestDeps();
    const { inbox, sent, adapters } = await support(t, optOutUser);
    const full = await freeAccount(t);
    const inappOnly = await freeAccount(t);
    const eventOf = async (ids: ItemIds) => (await t.deps.uow.repos.events.list(SCOPE(ids), { eventType: "notification.requested" }))
      .find((e) => (e.payload as { recipientRole?: string }).recipientRole === "support")!;
    await t.deps.uow.repos.deliveries.record(SCOPE(full), { eventId: (await eventOf(full)).id, channels: ["inapp", "email"] });
    await t.deps.uow.repos.deliveries.record(SCOPE(inappOnly), { eventId: (await eventOf(inappOnly)).id, channels: ["inapp"] });
    const s = spies(t);
    const first = await run(t, adapters);
    expect(first.failed).toEqual([]);
    // legacy full receipt: never enumerated; legacy inapp-only (email opted out): evaluated, nothing resent
    expect(s.outbox.mock.calls.some(([scope]) => scope.accountId === full.accountId)).toBe(false);
    expect(s.outbox.mock.calls.some(([scope]) => scope.accountId === inappOnly.accountId)).toBe(true);
    expect(inbox.filter((r) => r.userId === "user-support")).toHaveLength(0);
    expect(sent).toEqual([]);
    expect((await t.deps.uow.repos.deliveries.getByEvent(SCOPE(inappOnly), (await eventOf(inappOnly)).id))?.channels).toContain("completed");
    s.outbox.mockClear();
    await run(t, adapters);
    expect(s.outbox.mock.calls.some(([scope]) => scope.accountId === inappOnly.accountId)).toBe(false);
    // legacy inapp-only WITH a deliverable email: only the missing email goes out
    const t2 = makeTestDeps();
    const r2 = await support(t2);
    const ids2 = await freeAccount(t2);
    const ev2 = (await t2.deps.uow.repos.events.list(SCOPE(ids2), { eventType: "notification.requested" }))
      .find((e) => (e.payload as { recipientRole?: string }).recipientRole === "support")!;
    await t2.deps.uow.repos.deliveries.record(SCOPE(ids2), { eventId: ev2.id, channels: ["inapp"] });
    await run(t2, r2.adapters);
    expect(r2.inbox).toHaveLength(0);
    expect(r2.sent).toHaveLength(1);
  });

  it("ignores closed or paid accounts in the free pending selection", async () => {
    const t = makeTestDeps();
    const { inbox, sent, adapters } = await support(t);
    const closed = await freeAccount(t);
    t.store.accounts.rows.get(closed.accountId)!.status = "closed";
    expect(await run(t, adapters)).toMatchObject({ delivered: [], failed: [] });
    expect(inbox).toEqual([]); expect(sent).toEqual([]);
  });
});
