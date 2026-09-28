import { describe, expect, it } from "vitest";
import { fixedClock, type Actor } from "../domain";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, frontIdOf, setup, type ItemIds } from "./testing/items";
import { seedStaff } from "./testing/deps";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function pauseAs(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: ItemIds,
  actor: Actor,
  command: string,
  payload: Record<string, unknown> = {},
) {
  return executeCommand(t.deps, ctx(ids, actor), {
    type: command as "pause_publications",
    payload,
  });
}

async function approveFirstScheduled(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: ItemIds,
  scheduledFor = new Date("2026-10-09T12:00:00.000Z"),
): Promise<{ itemId: string; versionHash: string }> {
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

async function seedConnection(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds) {
  return t.deps.uow.repos.connections.create(SCOPE(ids), {
    provider: "instagram",
    encryptedToken: "tok",
  });
}

describe("pause commands", () => {
  it("pauses from every origin with the right level, scope and resumable-by", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const cases: Array<{
      command: string;
      actor: Actor;
      payload: Record<string, unknown>;
      expected: Record<string, unknown>;
    }> = [
      {
        command: "pause_publications",
        actor: ids.actors.approver,
        payload: {},
        expected: { origin: "client", level: "publishing", scope: "account", resumableBy: "client" },
      },
      {
        command: "pause_account_team",
        actor: ids.actors.support,
        payload: { reason: "risco" },
        expected: { origin: "team", level: "publishing", scope: "account" },
      },
      {
        command: "pause_front_content",
        actor: ids.actors.quality,
        payload: { frontId },
        expected: { origin: "content_incident", scope: "front", frontId, resumableBy: "quality" },
      },
      {
        command: "pause_connection",
        actor: ids.actors.system,
        payload: {},
        expected: { origin: "connection", scope: "account", resumableBy: "system" },
      },
      {
        command: "pause_global",
        actor: ids.actors.operations,
        payload: {},
        expected: { origin: "global_stop", scope: "global", resumableBy: "operations" },
      },
      {
        command: "suspend_execution",
        actor: ids.actors.operations,
        payload: {},
        expected: { origin: "security", level: "execution", scope: "account" },
      },
      {
        command: "pause_delinquency",
        actor: ids.actors.system,
        payload: {},
        expected: { origin: "delinquency", level: "billing", scope: "account" },
      },
    ];
    for (const { command, actor, payload, expected } of cases) {
      const outcome = await pauseAs(t, ids, actor, command, payload);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const row = await t.deps.uow.repos.pauses.get(scope, outcome.value.data.pauseId as string);
      expect(row).toMatchObject({ ...expected, status: "active" });
    }
    // Same origin twice refuses; unknown front/connection refuse too.
    const duplicate = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe("pause_already_active");
    const badFront = await pauseAs(t, ids, ids.actors.quality, "pause_front_content", {
      frontId: "00000000-0000-4000-8000-000000000000",
    });
    expect(badFront.ok).toBe(false);
  });

  it("binds each pause to its role", async () => {
    const { t, ids } = await setup();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const refusals: Array<{ command: string; actor: Actor; payload?: Record<string, unknown> }> = [
      { command: "pause_publications", actor: ids.actors.member },
      { command: "pause_publications", actor: ids.actors.support },
      { command: "pause_account_team", actor: ids.actors.quality },
      { command: "pause_account_team", actor: ids.actors.approver },
      { command: "pause_front_content", actor: ids.actors.support, payload: { frontId } },
      { command: "pause_connection", actor: ids.actors.quality },
      { command: "pause_global", actor: ids.actors.quality },
      { command: "pause_global", actor: ids.actors.system },
      { command: "suspend_execution", actor: ids.actors.quality },
      { command: "pause_delinquency", actor: ids.actors.support },
    ];
    for (const { command, actor, payload } of refusals) {
      const outcome = await pauseAs(t, ids, actor, command, payload ?? {});
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error(`${command} allowed the wrong actor`);
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    // Operations may pause the account too, and the system may pause the front.
    expect((await pauseAs(t, ids, ids.actors.operations, "pause_account_team")).ok).toBe(true);
  });

  it("holds scheduled items and their pending intents", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemId, versionHash } = await approveFirstScheduled(t, ids);
    const outcome = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.heldItemIds).toEqual([itemId]);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemId, versionHash);
    expect(intent?.status).toBe("held");
  });

  it("suspend_execution isolates connections without revoking them", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const connection = await seedConnection(t, ids);
    const outcome = await pauseAs(t, ids, ids.actors.operations, "suspend_execution", {
      reason: "conta errada",
      connectionIds: [connection.id],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.isolatedConnectionIds).toEqual([connection.id]);
    expect((await t.deps.uow.repos.connections.get(scope, connection.id))?.status).toBe("active");
    const applied = outcome.value.events.find((e) => e.eventType === "pause.applied");
    expect(applied?.payload).toMatchObject({
      origin: "security",
      isolatedConnectionIds: [connection.id],
    });
  });
});

describe("resume_pause", () => {
  it("lets only the matching owner resume each origin", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    async function pauseId(command: string, actor: Actor, payload: Record<string, unknown> = {}) {
      const outcome = await pauseAs(t, ids, actor, command, payload);
      if (!outcome.ok) throw new Error(`${command} failed: ${outcome.error.code}`);
      return outcome.value.data.pauseId as string;
    }
    const client = await pauseId("pause_publications", ids.actors.approver);
    // Another client role may resume; staff may not.
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
        type: "resume_pause",
        payload: { pauseId: client },
      })).ok,
    ).toBe(false);
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
        type: "resume_pause",
        payload: { pauseId: client },
      })).ok,
    ).toBe(true);
    const team = await pauseId("pause_account_team", ids.actors.support);
    const otherSupport = await seedStaff(t, "support");
    const otherResume = await executeCommand(t.deps, ctx(ids, otherSupport), {
      type: "resume_pause",
      payload: { pauseId: team },
    });
    expect(otherResume.ok).toBe(false);
    if (!otherResume.ok) expect(otherResume.error.code).toBe("forbidden_actor");
    const front = await pauseId("pause_front_content", ids.actors.quality, { frontId });
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.support), {
        type: "resume_pause",
        payload: { pauseId: front },
      })).ok,
    ).toBe(false);
    const connection = await pauseId("pause_connection", ids.actors.system);
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
        type: "resume_pause",
        payload: { pauseId: connection },
      })).ok,
    ).toBe(false);
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.system), {
        type: "resume_pause",
        payload: { pauseId: connection },
      })).ok,
    ).toBe(true);
    const global = await pauseId("pause_global", ids.actors.operations);
    expect(
      (await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
        type: "resume_pause",
        payload: { pauseId: global },
      })).ok,
    ).toBe(false);
    // Lifting twice refuses.
    const lifted = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "resume_pause",
      payload: { pauseId: connection },
    });
    expect(lifted.ok).toBe(false);
    expect(await t.deps.uow.repos.pauses.get(scope, connection)).toMatchObject({ status: "lifted" });
  });

  it("keeps the front paused while any covering pause remains stacked", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemId } = await approveFirstScheduled(t, ids);
    await seedConnection(t, ids);
    const first = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    const second = await pauseAs(t, ids, ids.actors.support, "pause_account_team");
    if (!first.ok || !second.ok) throw new Error("pause failed");
    const partial = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "resume_pause",
      payload: { pauseId: first.value.data.pauseId },
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.value.data).toMatchObject({ stillPaused: true, resumed: [] });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    const full = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "resume_pause",
      payload: { pauseId: second.value.data.pauseId },
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.value.data).toMatchObject({ stillPaused: false, resumed: [itemId] });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("scheduled");
  });

  it("revalidates every held item: scheduled, missed window, or stays", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemId: goodId, versionHash } = await approveFirstScheduled(t, ids);
    await seedConnection(t, ids);
    const paused = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    if (!paused.ok) throw new Error("pause failed");
    const resumed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "resume_pause",
      payload: { pauseId: paused.value.data.pauseId },
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.data.resumed).toEqual([goodId]);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, goodId, versionHash);
    expect(intent?.status).toBe("pending");
    // Time passed during the pause → missed window, needs a new client-approved time.
    const { itemId: lateId } = await approveFirstScheduled(t, ids);
    const pausedAgain = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    if (!pausedAgain.ok) throw new Error("pause failed");
    const lateDeps = { ...t.deps, clock: fixedClock(new Date("2026-10-12T14:00:00.000Z")) };
    const expired = await executeCommand(lateDeps, ctx(ids, ids.actors.approver), {
      type: "resume_pause",
      payload: { pauseId: pausedAgain.value.data.pauseId },
    });
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.value.data.missed).toEqual(expect.arrayContaining([lateId]));
    expect((await t.deps.uow.repos.items.get(scope, lateId))?.status).toBe("missed_window");
  });

  it("defers items with failed checks and leaves decided ones alone", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    // No verified connection → stays held with the reason.
    const { itemId: offlineId } = await approveFirstScheduled(t, ids);
    // Outside the assisted window (Sunday) → stays held too.
    const { itemIds: sundayIds, versionHashes: sundayHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-11T12:00:00.000Z") }],
    });
    const approvedSunday = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: sundayIds[0]!, expectedVersionHash: sundayHashes[0]! },
    });
    expect(approvedSunday.ok).toBe(true);
    // Cancelled items are never held and never move on resume.
    const { itemIds: cancelledIds, versionHashes: cancelledHashes } = await deliverTestBatch(
      t,
      ids,
      { items: [{}] },
    );
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: cancelledIds[0]!, expectedVersionHash: cancelledHashes[0]! },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled",
      payload: { itemId: cancelledIds[0]! },
    });
    const paused = await pauseAs(t, ids, ids.actors.approver, "pause_publications");
    if (!paused.ok) throw new Error("pause failed");
    // An escalation opened while held blocks the resume.
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "normal", itemId: offlineId, reason: "revisão" },
    });
    const resumed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "resume_pause",
      payload: { pauseId: paused.value.data.pauseId },
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    const deferred = resumed.value.data.deferred as Array<{ itemId: string; reasons: string[] }>;
    const byId = new Map(deferred.map((d) => [d.itemId, d.reasons]));
    expect(byId.get(offlineId)).toContain("blocking_escalation_open");
    expect(byId.get(offlineId)).toContain("connection_not_verified");
    expect(byId.get(sundayIds[0]!)).toContain("outside_assisted_window");
    expect((await t.deps.uow.repos.items.get(scope, offlineId))?.status).toBe("held");
    expect((await t.deps.uow.repos.items.get(scope, sundayIds[0]!))?.status).toBe("held");
    expect((await t.deps.uow.repos.items.get(scope, cancelledIds[0]!))?.status).toBe("cancelled");
  });
});
