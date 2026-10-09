// Equipe job handlers (#549): thin-adapter behavior with an in-memory
// unit of work and a fixed clock — window/business-day gating, the pilot
// gate, delegation to the module commands, and per-object isolation.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "../module/commands";
import {
  approveLiveMandate,
  ctx,
  deliverDueApprovedItem,
  deliverTestBatch,
  encryptedInstagramToken,
  frontIdOf,
  makeTestDeps,
  openTestAccount,
  seedInstagramConnection,
  type TestDeps,
} from "../module/testing/publication";
import { setNow } from "../module/testing/calibration";
import { QUALITY_EFFORT_RECORDED_EVENT } from "../module/jobs-monitor";
import { createDispatchHandler } from "./dispatch";
import { createReconcileHandler } from "./reconcile";
import { createRemindersHandler } from "./reminders";
import { createDeadlinesHandler } from "./deadlines";
import { createMonitorHandler } from "./monitor";
import { createSignalsHandler } from "./signals";
import {
  forEachEnabledAccount,
  type EquipeJobDeps,
} from "./shared";

// The in-memory stores stamp rows with the wall clock (like Postgres defaultNow), while the domain runs on
// the fixed test clock (2026-10-05T14:00Z). Pin the wall clock to it, or business-day math drifts with the calendar.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T14:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };

function makeJobDeps(t: TestDeps, publishEnabled = () => true): EquipeJobDeps {
  return {
    uow: t.deps.uow,
    clock: t.deps.clock,
    gatewayFor: () => t.gateway,
    publisher: t.publisher,
    isPublishEnabled: publishEnabled,
  };
}

async function setupEnabled(t: TestDeps) {
  const ids = await openTestAccount(t);
  return ids;
}

describe("dispatch handler", () => {
  it("skips the tick outside the assisted window without claiming", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { intentId } = await deliverDueApprovedItem(t, ids);
    // Sunday: outside the window.
    setNow(t, new Date("2026-10-11T14:00:00.000Z"));
    const outcome = await createDispatchHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome).toEqual({ skipped: "outside_window" });
    expect(t.publisher.publishes).toHaveLength(0);
    const intent = await t.deps.uow.repos.intents.get(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      intentId,
    );
    expect(intent?.status).toBe("pending");
  });

  it("claims due intents and dispatches each once", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await createDispatchHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome).toMatchObject({ claimed: 1, dispatched: [intentId], failed: [] });
    expect(t.publisher.publishes).toHaveLength(1);
    const item = await t.deps.uow.repos.items.get(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      itemId,
    );
    expect(item?.status).toBe("published");
  });

  it("retoma hold de publish_disabled vencido e perde a janela sem publicar", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z"), publishEnabled: false });
    const ids = await setupEnabled(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const held = await createDispatchHandler(makeJobDeps(t, () => false))({
      event: { data: {} }, step,
    });
    expect(held).toMatchObject({ claimed: 1, failed: [] });
    expect(t.publisher.publishes).toHaveLength(0);

    // Claim leases are five minutes; the next cron after expiry revalidates
    // the held intent through the normal gate and records a reschedule request.
    setNow(t, new Date("2026-10-05T14:06:00.000Z"));
    const deps = makeJobDeps(t, () => true);
    const first = await createDispatchHandler(deps)({ event: { data: {} }, step });
    const second = await createDispatchHandler(deps)({ event: { data: {} }, step });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect(first).toMatchObject({ claimed: 1, failed: [] });
    expect(second).toMatchObject({ claimed: 0, dispatched: [], failed: [] });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("missed_window");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("canceled");
    expect(await t.deps.uow.repos.events.list(scope, {
      eventType: "agent_work.requested", objectId: itemId,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ payload: expect.objectContaining({ kind: "reschedule_proposal" }) }),
    ]));
  });

  it("hold de horário futuro é revalidado, espera o horário e publica uma vez", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z"), publishEnabled: false });
    const ids = await setupEnabled(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    await createDispatchHandler(makeJobDeps(t, () => false))({ event: { data: {} }, step });
    const future = new Date("2026-10-05T14:30:00.000Z");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("held");
    expect((await t.deps.uow.repos.events.list(scope, { eventType: "item.held", objectId: itemId })).at(-1)?.payload)
      .toMatchObject({ reason: "publish_disabled", reasons: ["publish_disabled"], heldIntentIds: [intentId] });
    await t.deps.uow.repos.items.update(scope, itemId, { scheduledFor: future });
    await t.deps.uow.repos.intents.update(scope, intentId, { scheduledFor: future });

    setNow(t, new Date("2026-10-05T14:06:00.000Z"));
    const deps = makeJobDeps(t, () => true);
    const revalidated = await createDispatchHandler(deps)({ event: { data: {} }, step });
    expect(revalidated).toMatchObject({ claimed: 1, failed: [] });
    expect(t.publisher.publishes).toHaveLength(0);
    setNow(t, future);
    const futureDeps = makeJobDeps(t, () => true);
    const sent = await createDispatchHandler(futureDeps)({ event: { data: {} }, step });
    const retried = await createDispatchHandler(futureDeps)({ event: { data: {} }, step });
    expect(sent).toMatchObject({ claimed: 1, dispatched: [intentId], failed: [] });
    expect(retried).toMatchObject({ claimed: 0, dispatched: [], failed: [] });
    expect(t.publisher.publishes).toHaveLength(1);
  });

  it("revalida destino novamente depois do claim e não publica se ele mudou", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z"), publishEnabled: false });
    const ids = await setupEnabled(t);
    await approveLiveMandate(t, ids);
    const connectionId = await seedInstagramConnection(t, ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    await createDispatchHandler(makeJobDeps(t, () => false))({ event: { data: {} }, step });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const future = new Date("2026-10-05T14:30:00.000Z");
    await t.deps.uow.repos.items.update(scope, itemId, { scheduledFor: future });
    await t.deps.uow.repos.intents.update(scope, intentId, { scheduledFor: future });
    setNow(t, new Date("2026-10-05T14:06:00.000Z"));

    const gateChangesAfterClaim = {
      run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        if (name === `dispatch-${intentId}`) {
          await t.deps.uow.repos.connections.update(scope, connectionId, {
            encryptedToken: encryptedInstagramToken("ig_changed_after_claim"),
          });
        }
        return fn();
      },
    };
    const outcome = await createDispatchHandler(makeJobDeps(t, () => true))({
      event: { data: {} }, step: gateChangesAfterClaim,
    });
    expect(outcome).toMatchObject({ claimed: 1, failed: [] });
    expect(t.publisher.publishes).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.get(scope, intentId)).toMatchObject({
      status: "held", lastError: "instagram_destination_changed",
    });
  });
});

describe("reconcile handler", () => {
  it("reconciles verifying items through the command", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    t.publisher.failNext("publish", { kind: "uncertain" });
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids, { caption: "post reconciliado" });
    const dispatched = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: {
        intentId: (
          await t.deps.uow.repos.intents.list(scope)
        ).find((intent) => intent.itemId === itemId)!.id,
      },
    });
    expect(dispatched.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    // A provider acknowledgement survived while the final receipt did not.
    await t.deps.uow.repos.intents.update(scope, intentId, { externalId: "ig_1" });
    t.publisher.recentMedia = [
      {
        externalId: "ig_1",
        igUserId: "ig_test_brand",
        caption: "post reconciliado",
        permalink: "https://ig/post/1",
        takenAt: new Date("2026-10-05T14:01:00.000Z"),
      },
    ];
    const outcome = await createReconcileHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome).toMatchObject({ accounts: 1, reconciled: [itemId], failed: [] });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("published");
  });
});

describe("reminders handler", () => {
  it("skips non-business days, delegates on business days", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    setNow(t, new Date("2026-10-11T14:00:00.000Z"));
    expect(await createRemindersHandler(makeJobDeps(t))({ event: { data: {} }, step })).toEqual({
      skipped: "non_business_day",
    });
    setNow(t, new Date("2026-10-07T14:00:00.000Z"));
    const outcome = await createRemindersHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome).toMatchObject({ accounts: 1 });
    const markers = await t.deps.uow.repos.events.list(scope, { eventType: "reminder.sent" });
    expect(markers).toHaveLength(1);
  });
});

describe("deadlines handler", () => {
  it("expires past-limit items through the command", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const batch = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    setNow(t, new Date("2026-10-09T10:00:00.000Z"));
    const outcome = await createDeadlinesHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome.accounts).toBe(1);
    expect((await t.deps.uow.repos.items.get(scope, batch.itemIds[0]!))?.status).toBe(
      "missed_window",
    );
  });
});

describe("monitor handler", () => {
  it("alerts quality hours through the command", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "active" });
    const frontId = await frontIdOf(t, ids, "social_instagram");
    await t.deps.uow.repos.fronts.update(scope, frontId, { status: "calibrating" });
    await t.deps.uow.repos.events.create(scope, {
      actorType: "staff",
      actorId: "staff-q",
      actorRole: "quality",
      eventType: QUALITY_EFFORT_RECORDED_EVENT,
      objectType: "front",
      objectId: frontId,
      payload: { frontId, minutes: 370 },
      occurredAt: t.deps.clock.now(),
    });
    const outcome = await createMonitorHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome.accounts).toBe(1);
    const notes = await t.deps.uow.repos.events.list(scope, { eventType: "notification.requested" });
    expect(
      notes.some(
        (note) => (note.payload as { templateKey?: unknown }).templateKey === "quality.hours_warning",
      ),
    ).toBe(true);
  });
});

describe("signals handler", () => {
  it("ingests pending signals through the command", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const ids = await setupEnabled(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const signal = await t.deps.uow.repos.events.create(scope, {
      actorType: "agent",
      actorId: "estrategista",
      actorRole: "agent",
      eventType: "agent.turn_failed",
      payload: { taskKind: "research", error: "timeout" },
      occurredAt: t.deps.clock.now(),
    });
    const outcome = await createSignalsHandler(makeJobDeps(t))({ event: { data: {} }, step });
    expect(outcome).toMatchObject({ accounts: 1, ingested: [signal.id], failed: [] });
    expect(await t.deps.uow.repos.escalations.list(scope)).toHaveLength(1);
  });
});

describe("per-account isolation", () => {
  it("records command errors per account and continues", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    await setupEnabled(t);
    await setupEnabled(t);
    const result = await forEachEnabledAccount("probe", makeJobDeps(t), {
      // Invalid on purpose: every account reports the same failure.
      type: "nope" as never,
      payload: {},
    });
    expect(result.accounts).toBe(2);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.every((o) => !o.ok)).toBe(true);
  });

  it("catches throwing accounts and continues", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    await setupEnabled(t);
    const throwing = {
      ...makeJobDeps(t),
      uow: {
        ...t.deps.uow,
        run: async <T>(): Promise<T> => {
          throw new Error("boom");
        },
      },
    };
    const result = await forEachEnabledAccount("probe", throwing, {
      type: "run_deadlines",
      payload: {},
    });
    expect(result).toMatchObject({
      accounts: 1,
      outcomes: [{ ok: false, code: "threw" }],
    });
  });

  it("visits the accounts of every workspace", async () => {
    const t = makeTestDeps({ now: new Date("2026-10-05T14:00:00.000Z") });
    const first = await setupEnabled(t);
    const second = await setupEnabled(t);
    const result = await forEachEnabledAccount("probe", makeJobDeps(t), {
      type: "run_deadlines",
      payload: {},
    });
    expect(result.accounts).toBe(2);
    expect(result.outcomes.map((outcome) => outcome.accountId).sort()).toEqual([first.accountId, second.accountId].sort());
    expect(result.outcomes.every((outcome) => outcome.ok)).toBe(true);
  });
});
