// The global stop and the free accounts (ticket 11): with `*` nearly every account is `free`, so the stop reads and
// holds only the paid accounts. The platform-wide guarantee does not depend on visiting every account: the dispatch
// gate reads the single global row, so an account that stops being free during the stop is held at dispatch and enters
// the resume's revalidation like any paid one.

import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { GLOBAL_STOP_HOLD_REASON } from "./global-stop";
import { ctx, deliverTestBatch, openTestAccount, setup, type ItemIds } from "./testing/items";
import { uuid, type TestDeps } from "./testing/deps";
import { seedInstagramConnection } from "./testing/publication";
import type { Actor } from "../domain";
import type { EquipeAccountStatus } from "../data";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });
type Payload = Record<string, unknown>;
const payloadOf = (event: { payload: unknown }) => (event.payload ?? {}) as Payload;
const OPS_FLOW_EVENTS = ["global_stop.applied", "global_stop.lifted"];

const stopCtx = (ids: ItemIds, actor: Actor) => ({ actor, workspaceId: ids.workspaceId });
const stopAll = (t: TestDeps, ids: ItemIds) =>
  executeCommand(t.deps, stopCtx(ids, ids.actors.operations), { type: "stop_all_publications", payload: { reason: "provedor instável" } });
const resumeAll = (t: TestDeps, ids: ItemIds) =>
  executeCommand(t.deps, stopCtx(ids, ids.actors.operations), { type: "resume_all_publications", payload: { reason: "provedor voltou" } });

async function approveScheduled(t: TestDeps, ids: ItemIds) {
  if (!(await t.deps.uow.repos.connections.list(SCOPE(ids))).length) await seedInstagramConnection(t, ids);
  const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }] });
  const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
  });
  if (!approved.ok) throw new Error(`approve failed: ${approved.error.code}`);
  return { itemId: itemIds[0]!, versionHash: versionHashes[0]! };
}

const setStatus = (t: TestDeps, ids: ItemIds, status: EquipeAccountStatus) =>
  t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status });

/** A free account with an approved, scheduled item: what a sign-up that already works would have. */
async function freeWithScheduledItem(t: TestDeps) {
  const ids = await openTestAccount(t);
  const item = await approveScheduled(t, ids);
  await setStatus(t, ids, "free");
  return { ids, item };
}

/** Everything the stop/resume writes on an account: audit events and the stop notifications. */
async function stopTrail(t: TestDeps, ids: ItemIds) {
  const events = await t.deps.uow.repos.events.list(SCOPE(ids));
  return {
    audit: events.filter((event) => OPS_FLOW_EVENTS.includes(event.eventType)),
    notes: events.filter((event) => event.eventType === "notification.requested"
      && String(payloadOf(event).templateKey).startsWith("global_stop.")),
  };
}

describe("global stop with free accounts", () => {
  it("does not read, hold or record anything on free accounts, and leaves the paid ones exactly as before", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    const paidItems = [await approveScheduled(t, a), await approveScheduled(t, b)];
    const free1 = await freeWithScheduledItem(t);
    const free2 = await freeWithScheduledItem(t);
    await executeCommand(t.deps, ctx(a, a.actors.approver), { type: "request_support", payload: { note: "x" } }); // paid noise
    const frees = [free1, free2];

    const stopped = await stopAll(t, a);
    if (!stopped.ok) throw new Error(stopped.error.code);
    const stoppedAccounts = stopped.value.data.stoppedAccounts as string[];
    const heldByAccount = stopped.value.data.heldByAccount as Record<string, string[]>;
    expect(stoppedAccounts.sort()).toEqual([a.accountId, b.accountId].sort());
    expect(heldByAccount).toEqual({ [a.accountId]: [paidItems[0]!.itemId], [b.accountId]: [paidItems[1]!.itemId] });
    for (const { ids, item } of frees) {
      expect(stoppedAccounts).not.toContain(ids.accountId);
      expect(heldByAccount).not.toHaveProperty(ids.accountId);
      expect(await stopTrail(t, ids)).toEqual({ audit: [], notes: [] });
      expect((await t.deps.uow.repos.items.get(SCOPE(ids), item.itemId))?.status).toBe("scheduled");
      expect((await t.deps.uow.repos.intents.getByItemVersion(SCOPE(ids), item.itemId, item.versionHash))?.status).not.toBe("held");
    }
    for (const [index, ids] of [a, b].entries()) {
      const trail = await stopTrail(t, ids);
      expect(trail.audit).toHaveLength(1);
      expect(payloadOf(trail.audit[0]!).heldItemIds).toEqual([paidItems[index]!.itemId]);
      expect(trail.notes.map((event) => payloadOf(event).recipientRole).sort()).toEqual(["founder", "operations"]);
      expect((await t.deps.uow.repos.items.get(SCOPE(ids), paidItems[index]!.itemId))?.status).toBe("held");
    }
    const outcomeEvents = stopped.value.events.filter((event) => event.eventType === "global_stop.applied");
    expect(outcomeEvents).toHaveLength(2);

    const resumed = await resumeAll(t, a);
    if (!resumed.ok) throw new Error(resumed.error.code);
    const resumedAccounts = resumed.value.data.resumedAccounts as string[];
    expect(resumedAccounts.sort()).toEqual([a.accountId, b.accountId].sort());
    expect(resumed.value.data.resumed).toEqual(expect.arrayContaining(paidItems.map((item) => item.itemId)));
    for (const { ids, item } of frees) {
      expect(resumedAccounts).not.toContain(ids.accountId);
      expect(await stopTrail(t, ids)).toEqual({ audit: [], notes: [] });
      expect((await t.deps.uow.repos.items.get(SCOPE(ids), item.itemId))?.status).toBe("scheduled");
    }
    expect(resumed.value.events.filter((event) => event.eventType === "global_stop.lifted")).toHaveLength(2);
    expect(await t.deps.uow.internal.globalStops.getActive()).toBeNull();
  });

  it("writes the same number of rows with 50 free accounts as with none", async () => {
    async function rowsWritten(freeCount: number) {
      const { t, ids: a } = await setup();
      const b = await openTestAccount(t);
      await approveScheduled(t, a);
      await approveScheduled(t, b);
      for (let i = 0; i < freeCount; i += 1) await setStatus(t, await openTestAccount(t), "free");
      const before = t.store.events.rows.size;
      expect((await stopAll(t, a)).ok).toBe(true);
      const afterStop = t.store.events.rows.size;
      expect((await resumeAll(t, a)).ok).toBe(true);
      return { stop: afterStop - before, resume: t.store.events.rows.size - afterStop };
    }
    const baseline = await rowsWritten(0);
    expect(baseline.stop).toBeGreaterThan(0);
    expect(baseline.resume).toBeGreaterThan(0);
    expect(await rowsWritten(50)).toEqual(baseline);
  });
});

describe("an account that stops being free during the stop stays protected", () => {
  async function dispatchOf(t: TestDeps, ids: ItemIds, item: { itemId: string; versionHash: string }) {
    const intent = await t.deps.uow.repos.intents.getByItemVersion(SCOPE(ids), item.itemId, item.versionHash);
    expect(intent).toBeTruthy();
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication", payload: { intentId: intent!.id },
    });
    if (!outcome.ok) throw new Error(outcome.error.code);
    return outcome.value.data;
  }

  async function expectHeldThenResumed(t: TestDeps, a: ItemIds, b: ItemIds, item: { itemId: string; versionHash: string }) {
    expect(await dispatchOf(t, b, item)).toMatchObject({ action: "held", reasons: [GLOBAL_STOP_HOLD_REASON] });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(SCOPE(b), item.itemId))?.status).toBe("held");

    const resumed = await resumeAll(t, a);
    if (!resumed.ok) throw new Error(resumed.error.code);
    expect(resumed.value.data.resumedAccounts).toContain(b.accountId);
    expect(resumed.value.data.resumed).toContain(item.itemId);
    expect((await t.deps.uow.repos.items.get(SCOPE(b), item.itemId))?.status).toBe("scheduled");
    expect((await stopTrail(t, b)).audit.map((event) => event.eventType)).toEqual(["global_stop.lifted"]);
  }

  it("a free account that becomes paid is held at dispatch and revalidated on resume", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    await setStatus(t, b, "free");

    const stopped = await stopAll(t, a);
    if (!stopped.ok) throw new Error(stopped.error.code);
    expect(stopped.value.data.stoppedAccounts).toEqual([a.accountId]);
    expect(await stopTrail(t, b)).toEqual({ audit: [], notes: [] });

    await setStatus(t, b, "deploying"); // paid; "active" would put the front under the calibration conference rule
    const item = await approveScheduled(t, b);
    await expectHeldThenResumed(t, a, b, item);
  });

  it("an account opened during the stop with open_free_account behaves the same once it is paid", async () => {
    const { t, ids: a } = await setup();
    expect((await stopAll(t, a)).ok).toBe(true);

    const workspaceId = uuid();
    const userId = `u-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const accountId = opened.value.accountId!;
    expect((await t.deps.uow.repos.accounts.get(workspaceId, accountId))?.status).toBe("free");
    expect(await stopTrail(t, { workspaceId, accountId } as ItemIds)).toEqual({ audit: [], notes: [] });

    // The sign-up subscribes: a paid account with what the item flow needs (people, front).
    const scope = { workspaceId, accountId };
    const approver = await t.deps.uow.repos.people.create(scope, { name: "Ana", role: "approver" });
    const custodian = await t.deps.uow.repos.people.create(scope, { name: "Cid", role: "custodian" });
    const actors = { ...a.actors, approver: { kind: "client_person", role: "approver", personId: approver.id } } satisfies ItemIds["actors"];
    void custodian;
    await t.deps.uow.repos.fronts.create(scope, { key: "social_instagram", status: "released" });
    await t.deps.uow.repos.accounts.update(workspaceId, accountId, { status: "active" });
    const b: ItemIds = { workspaceId, accountId, actors };
    const item = await approveScheduled(t, b);
    await expectHeldThenResumed(t, a, b, item);
  });
});

describe("escalation-triggered global stop skips free accounts too", () => {
  it("holds the paid accounts only; free ones get no audit event or notification", async () => {
    const { t, ids: a } = await setup();
    const b = await openTestAccount(t);
    const paidItem = await approveScheduled(t, b);
    const free = await freeWithScheduledItem(t);

    const outcome = await executeCommand(t.deps, ctx(a, a.actors.system), {
      type: "open_escalation",
      payload: { kind: "security", severity: "critical_cross_account", reason: "post na conta errada", systemic: true },
    });
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.value.data.globalStopId).toEqual(expect.any(String));

    expect((await t.deps.uow.repos.items.get(SCOPE(b), paidItem.itemId))?.status).toBe("held");
    expect(await stopTrail(t, free.ids)).toEqual({ audit: [], notes: [] });
    expect((await t.deps.uow.repos.items.get(SCOPE(free.ids), free.item.itemId))?.status).toBe("scheduled");
    const applied = outcome.value.events.filter((event) => event.eventType === "global_stop.applied");
    expect(applied.map((event) => event.accountId).sort()).toEqual([a.accountId, b.accountId].sort());
  });
});
