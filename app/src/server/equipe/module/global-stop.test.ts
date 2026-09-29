// Parada global de publicações (#583): one platform-wide stop row, read by
// the dispatch gate for every account — including accounts opened while
// the stop is active. Operations-only, reason required, both directions.

import { describe, expect, it } from "vitest";
import { fixedClock, type Actor } from "../domain";
import { executeCommand } from "./commands";
import { getGlobalStopState, GLOBAL_STOP_HOLD_REASON } from "./global-stop";
import { ctx, deliverTestBatch, openTestAccount, setup, type ItemIds } from "./testing/items";
import { seedStaff, testActors, type TestDeps } from "./testing/deps";
import { seedInstagramConnection } from "./testing/publication";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

function stopCtx(ids: ItemIds, actor: Actor) {
  // Accountless, like open_account: the workspace never scopes the stop.
  return { actor, workspaceId: ids.workspaceId };
}

async function stopAll(t: TestDeps, ids: ItemIds, actor: Actor, reason = "provedor instável") {
  return executeCommand(t.deps, stopCtx(ids, actor), {
    type: "stop_all_publications",
    payload: { reason },
  });
}

async function resumeAll(t: TestDeps, ids: ItemIds, actor: Actor, reason = "provedor voltou") {
  return executeCommand(t.deps, stopCtx(ids, actor), {
    type: "resume_all_publications",
    payload: { reason },
  });
}

async function approveScheduled(
  t: TestDeps,
  ids: ItemIds,
  scheduledFor = new Date("2026-10-09T12:00:00.000Z"),
): Promise<{ itemId: string; versionHash: string }> {
  if (!(await t.deps.uow.repos.connections.list(SCOPE(ids))).length) await seedInstagramConnection(t, ids);
  const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
    items: [{ scheduledFor }],
  });
  const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_item",
    payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
  });
  if (!approved.ok) throw new Error(`approve failed: ${approved.error.code}`);
  return { itemId: itemIds[0]!, versionHash: versionHashes[0]! };
}

type Payload = Record<string, unknown>;

function payloadOf(event: { payload: unknown }): Payload {
  return (event.payload ?? {}) as Payload;
}

describe("stop_all_publications", () => {
  it("holds the scheduled items of every account with the global reason", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    const first = await approveScheduled(t, a);
    const second = await approveScheduled(t, b);
    // Awaiting items keep their state: production continues during the stop.
    const { itemIds: awaitingIds } = await deliverTestBatch(t, a);

    const outcome = await stopAll(t, a, a.actors.operations);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.stopId).toEqual(expect.any(String));
    expect(outcome.value.data.stoppedAccounts).toEqual(
      expect.arrayContaining([a.accountId, b.accountId]),
    );
    expect(outcome.value.data.heldByAccount).toEqual({
      [a.accountId]: [first.itemId],
      [b.accountId]: [second.itemId],
    });

    for (const [ids, item] of [
      [a, first],
      [b, second],
    ] as const) {
      const scope = SCOPE(ids);
      expect((await t.deps.uow.repos.items.get(scope, item.itemId))?.status).toBe("held");
      const intent = await t.deps.uow.repos.intents.getByItemVersion(
        scope,
        item.itemId,
        item.versionHash,
      );
      expect(intent?.status).toBe("held");
    }
    expect(
      (await t.deps.uow.repos.items.get(SCOPE(a), awaitingIds[0]!))?.status,
    ).toBe("awaiting_approval");

    // One audit event per account plus operations + founder notifications.
    const applied = outcome.value.events.filter((e) => e.eventType === "global_stop.applied");
    expect(applied).toHaveLength(2);
    expect(applied.map((e) => payloadOf(e).reason)).toEqual([
      "provedor instável",
      "provedor instável",
    ]);
    const notes = outcome.value.events.filter(
      (e) =>
        e.eventType === "notification.requested" &&
        payloadOf(e).templateKey === "global_stop.applied",
    );
    expect(notes.map((e) => payloadOf(e).recipientRole).sort()).toEqual([
      "founder",
      "founder",
      "operations",
      "operations",
    ]);

    // The single source of truth: who stopped, when, why.
    const active = await t.deps.uow.internal.globalStops.getActive();
    expect(active).toMatchObject({ reason: "provedor instável", status: "active" });
    expect(active?.stoppedBy).toBe(
      a.actors.operations.kind === "staff" ? a.actors.operations.staffId : null,
    );
    const state = await getGlobalStopState(t.deps.uow.internal);
    expect(state).toMatchObject({ active: true, reason: "provedor instável" });

    // Stopping twice refuses; no pause rows were fanned out anywhere.
    const again = await stopAll(t, a, a.actors.operations);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("global_stop_already_active");
    for (const ids of [a, b]) {
      expect(await t.deps.uow.repos.pauses.list(SCOPE(ids))).toEqual([]);
    }
  });

  it("skips closed accounts: nothing may move there anymore", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    await t.deps.uow.repos.accounts.update(b.workspaceId, b.accountId, { status: "closed" });
    const outcome = await stopAll(t, a, a.actors.operations);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.stoppedAccounts).toEqual([a.accountId]);
    expect(outcome.value.data.heldByAccount).toEqual({ [a.accountId]: [] });
    expect(
      outcome.value.events.filter((e) => e.eventType === "global_stop.applied"),
    ).toHaveLength(1);
  });

  it("covers an account opened while the stop is active", async () => {
    const { t, ids: a } = await setup();
    const stopped = await stopAll(t, a, a.actors.operations);
    expect(stopped.ok).toBe(true);

    const b = await openTestAccount(t);
    const { itemId, versionHash } = await approveScheduled(t, b);
    const scope = SCOPE(b);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemId, versionHash);
    expect(intent).toBeTruthy();

    const outcome = await executeCommand(t.deps, ctx(b, b.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent!.id },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "held",
      reasons: [GLOBAL_STOP_HOLD_REASON],
    });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    // The new account needs no row of its own: the gate reads the one stop.
    expect(await t.deps.uow.repos.pauses.list(scope)).toEqual([]);
  });
});

describe("resume_all_publications", () => {
  it("revalidates every held item with the same rules as other pauses", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    const c = await openTestAccount(t);
    const d = await openTestAccount(t);
    // Good: still future at resume time, approved, connection verified.
    const good = await approveScheduled(t, a, new Date("2026-10-20T12:00:00.000Z"));
    // Late: future at stop time, past at resume time.
    const late = await approveScheduled(t, b, new Date("2026-10-06T12:00:00.000Z"));
    // Covered by another pause: the client pauses after the stop.
    const covered = await approveScheduled(t, c);
    // Offline: no verified connection.
    const offline = await approveScheduled(t, d, new Date("2026-10-20T12:00:00.000Z"));
    const connection = (await t.deps.uow.repos.connections.list(SCOPE(d)))[0]!;
    await t.deps.uow.repos.connections.update(SCOPE(d), connection.id, { status: "expired" });

    const stopped = await stopAll(t, a, a.actors.operations);
    expect(stopped.ok).toBe(true);
    const clientPause = await executeCommand(t.deps, ctx(c, c.actors.approver), {
      type: "pause_publications",
      payload: {},
    });
    expect(clientPause.ok).toBe(true);

    const lateDeps = { ...t.deps, clock: fixedClock(new Date("2026-10-12T14:00:00.000Z")) };
    const outcome = await executeCommand(lateDeps, stopCtx(a, a.actors.operations), {
      type: "resume_all_publications",
      payload: { reason: "provedor voltou" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.stopId).toEqual(expect.any(String));
    expect(outcome.value.data.resumed).toEqual([good.itemId]);
    expect(outcome.value.data.missed).toEqual([late.itemId]);
    const deferred = outcome.value.data.deferred as Array<{ itemId: string; reasons: string[] }>;
    expect(deferred.map((entry) => entry.itemId)).toEqual([offline.itemId]);
    expect(deferred[0]!.reasons).toContain("connection_not_verified");

    expect((await t.deps.uow.repos.items.get(SCOPE(a), good.itemId))?.status).toBe("scheduled");
    const goodIntent = await t.deps.uow.repos.intents.getByItemVersion(
      SCOPE(a),
      good.itemId,
      good.versionHash,
    );
    expect(goodIntent?.status).toBe("pending");
    expect((await t.deps.uow.repos.items.get(SCOPE(b), late.itemId))?.status).toBe(
      "missed_window",
    );
    // Still covered by the client pause: untouched by the resume.
    expect((await t.deps.uow.repos.items.get(SCOPE(c), covered.itemId))?.status).toBe("held");
    expect((await t.deps.uow.repos.items.get(SCOPE(d), offline.itemId))?.status).toBe("held");

    // The stop is lifted with the resume reason; every account audited it
    // and paged operations + the founder.
    const lifted = await t.deps.uow.internal.globalStops.getActive();
    expect(lifted).toBeNull();
    expect(await getGlobalStopState(t.deps.uow.internal)).toEqual({ active: false });
    const events = outcome.value.events.filter((e) => e.eventType === "global_stop.lifted");
    expect(events).toHaveLength(4);
    const notes = outcome.value.events.filter(
      (e) =>
        e.eventType === "notification.requested" &&
        payloadOf(e).templateKey === "global_stop.lifted",
    );
    expect(notes).toHaveLength(8);

    const again = await resumeAll(t, a, a.actors.operations);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("global_stop_not_active");
  });
});

describe("global stop authorization", () => {
  it("lets only operations stop and resume, with a required reason", async () => {
    const { t, ids } = await setup();
    const others: Actor[] = [
      ids.actors.quality,
      ids.actors.support,
      ids.actors.system,
      ids.actors.approver,
      ids.actors.member,
    ];
    for (const actor of others) {
      const stopped = await stopAll(t, ids, actor);
      expect(stopped.ok).toBe(false);
      if (stopped.ok) throw new Error("stop allowed the wrong actor");
      expect(stopped.error.code).toBe("forbidden_actor");
      const resumed = await resumeAll(t, ids, actor);
      expect(resumed.ok).toBe(false);
      if (resumed.ok) throw new Error("resume allowed the wrong actor");
      expect(resumed.error.code).toBe("forbidden_actor");
    }
    // Operations without a staff row cannot bind either.
    const ghost = await stopAll(t, ids, testActors.operations!);
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) expect(ghost.error.code).toBe("forbidden_actor");

    // The reason is required in both directions.
    for (const type of ["stop_all_publications", "resume_all_publications"] as const) {
      for (const payload of [{}, { reason: "" }]) {
        const outcome = await executeCommand(t.deps, stopCtx(ids, ids.actors.operations), {
          type,
          payload,
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
      }
    }

    // Resuming without a stop refuses, even for operations.
    const idle = await resumeAll(t, ids, ids.actors.operations);
    expect(idle.ok).toBe(false);
    if (!idle.ok) expect(idle.error.code).toBe("global_stop_not_active");
  });

  it("records which operations member stopped and lifted", async () => {
    const { t, ids } = await setup();
    const second = await seedStaff(t, "operations", { displayName: "Ops 2" });
    const stopped = await stopAll(t, ids, ids.actors.operations, "queda geral");
    expect(stopped.ok).toBe(true);
    const state = await getGlobalStopState(t.deps.uow.internal);
    expect(state).toMatchObject({ active: true, reason: "queda geral", stoppedByName: "operations" });
    const resumed = await resumeAll(t, ids, second, "tudo certo");
    expect(resumed.ok).toBe(true);
    expect(await t.deps.uow.internal.globalStops.getActive()).toBeNull();
  });
});

describe("escalation-triggered global stop", () => {
  async function openCrossAccount(
    t: TestDeps,
    ids: ItemIds,
    systemic: boolean,
  ) {
    return executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_escalation",
      payload: {
        kind: "security",
        severity: "critical_cross_account",
        reason: "post na conta errada",
        systemic,
      },
    });
  }

  it("systemic critical cross-account escalation stops globally and holds another account", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    const first = await approveScheduled(t, a);
    const second = await approveScheduled(t, b);

    const outcome = await openCrossAccount(t, a, true);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const escalationId = outcome.value.data.escalationId as string;
    const stopId = outcome.value.data.globalStopId as string;
    expect(stopId).toEqual(expect.any(String));

    const active = await t.deps.uow.internal.globalStops.getActive();
    expect(active).toMatchObject({
      id: stopId,
      reason: `systemic cause suspected (escalation ${escalationId})`,
      status: "active",
    });
    // stoppedBy is the escalation's actor (system job), not operations staff.
    expect(active?.stoppedBy).toBe("reminders");

    // The other account's scheduled item is held under the global reason.
    expect((await t.deps.uow.repos.items.get(SCOPE(b), second.itemId))?.status).toBe("held");
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      SCOPE(b),
      second.itemId,
      second.versionHash,
    );
    expect(intent?.status).toBe("held");
    const held = await t.deps.uow.repos.events.list(SCOPE(b), {
      eventType: "item.held",
      objectId: second.itemId,
    });
    expect(held.at(-1)?.payload).toMatchObject({ reason: GLOBAL_STOP_HOLD_REASON });
    // The escalation account is held too (suspension + stop fan-out).
    expect((await t.deps.uow.repos.items.get(SCOPE(a), first.itemId))?.status).toBe("held");

    const applied = outcome.value.events.filter((e) => e.eventType === "global_stop.applied");
    expect(applied).toHaveLength(2);
    expect(applied.map((e) => payloadOf(e).escalationId)).toEqual([escalationId, escalationId]);
    const opened = outcome.value.events.find((e) => e.eventType === "escalation.opened");
    expect(opened?.payload).toMatchObject({ globalStopId: stopId });
    expect(opened?.payload).not.toHaveProperty("globalStopRecommended");
    for (const ids of [a, b]) {
      const pauses = await t.deps.uow.repos.pauses.list(SCOPE(ids));
      expect(pauses.some((p) => p.origin === "global_stop")).toBe(false);
    }

    // The command path sees the escalation stop: a second stop refuses.
    const again = await stopAll(t, a, a.actors.operations);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("global_stop_already_active");
  });

  it("a second systemic escalation while active reuses the stop", async () => {
    const { t, ids: a } = await setup();
    const first = await openCrossAccount(t, a, true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const stopId = first.value.data.globalStopId as string;

    const second = await openCrossAccount(t, a, true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data.globalStopId).toBe(stopId);
    expect((await t.deps.uow.internal.globalStops.getActive())?.id).toBe(stopId);
    // Idempotent: no second fan-out, no second row.
    expect(second.value.events.filter((e) => e.eventType === "global_stop.applied")).toHaveLength(0);
    const opened = second.value.events.find((e) => e.eventType === "escalation.opened");
    expect(opened?.payload).toMatchObject({ globalStopId: stopId });
  });

  it("a non-systemic cross-account escalation does not stop", async () => {
    const { t, ids } = await setup();
    const outcome = await openCrossAccount(t, ids, false);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.globalStopId).toBeNull();
    expect(await t.deps.uow.internal.globalStops.getActive()).toBeNull();
    expect(outcome.value.events.filter((e) => e.eventType === "global_stop.applied")).toHaveLength(0);
    const opened = outcome.value.events.find((e) => e.eventType === "escalation.opened");
    expect(opened?.payload).not.toHaveProperty("globalStopId");
  });

  it("the gate holds items for an account opened after the escalation-triggered stop", async () => {
    const { t, ids: a } = await setup();
    const escalated = await openCrossAccount(t, a, true);
    expect(escalated.ok).toBe(true);

    const b = await openTestAccount(t);
    const { itemId, versionHash } = await approveScheduled(t, b);
    const scope = SCOPE(b);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemId, versionHash);
    expect(intent).toBeTruthy();

    const outcome = await executeCommand(t.deps, ctx(b, b.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent!.id },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      action: "held",
      reasons: [GLOBAL_STOP_HOLD_REASON],
    });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    expect(await t.deps.uow.repos.pauses.list(scope)).toEqual([]);
  });

  it("closing the escalation does not lift; only operations resume lifts", async () => {
    const { t, ids } = await setup();
    const opened = await openCrossAccount(t, ids, true);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const escalationId = opened.value.data.escalationId as string;

    const resolved = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "resolve_technical_escalation",
      payload: { escalationId, exit: "fix" },
    });
    expect(resolved.ok).toBe(true);
    const closed = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "close_escalation",
      payload: { escalationId, cause: "isolation" },
    });
    expect(closed.ok).toBe(true);
    expect(await t.deps.uow.internal.globalStops.getActive()).not.toBeNull();

    const resumed = await resumeAll(t, ids, ids.actors.operations);
    expect(resumed.ok).toBe(true);
    expect(await t.deps.uow.internal.globalStops.getActive()).toBeNull();
  });
});
