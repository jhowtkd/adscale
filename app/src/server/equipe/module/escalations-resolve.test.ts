import { describe, expect, it } from "vitest";
import { fixedClock } from "../domain";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, setup, type TestDeps, type ItemIds } from "./testing/items";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function openEscalation(
  t: TestDeps,
  ids: ItemIds,
  payload: Record<string, unknown>,
): Promise<string> {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "open_escalation",
    payload: { kind: "content", severity: "normal", reason: "caso", ...payload },
  });
  if (!outcome.ok) throw new Error(`open failed: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.value.data.escalationId as string;
}

describe("merge_escalations", () => {
  it("joins duplicates keeping owner and co-owner", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const normal = await openEscalation(t, ids, { kind: "technical", itemId: itemIds[0]! });
    const critical = await openEscalation(t, ids, {
      kind: "content",
      severity: "critical",
      itemId: itemIds[0]!,
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "merge_escalations",
      payload: { escalationIds: [normal, critical] },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Higher severity leads even when listed second.
    expect(outcome.value.data.escalationId).toBe(critical);
    expect(outcome.value.data.absorbedId).toBe(normal);
    const primary = await t.deps.uow.repos.escalations.get(scope, critical);
    expect(primary).toMatchObject({
      severity: "critical",
      status: "open",
      ownerRole: "quality",
      coOwnerRole: "operations",
    });
    // Parts follow the domain merge order (argument order, not severity).
    expect(primary?.parts).toEqual([
      { kind: "technical", resolved: false },
      { kind: "content", resolved: false },
    ]);
    expect((await t.deps.uow.repos.escalations.get(scope, normal))?.status).toBe("merged");
  });

  it("refuses different items, settled cases and non-owners", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const first = await openEscalation(t, ids, { itemId: itemIds[0]! });
    const otherItem = await openEscalation(t, ids, { itemId: itemIds[1]! });
    const different = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "merge_escalations",
      payload: { escalationIds: [first, otherItem] },
    });
    expect(different.ok).toBe(false);
    const self = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "merge_escalations",
      payload: { escalationIds: [first, first] },
    });
    expect(self.ok).toBe(false);
    const second = await openEscalation(t, ids, { kind: "technical", itemId: itemIds[0]! });
    const nonOwner = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "merge_escalations",
      payload: { escalationIds: [first, second] },
    });
    expect(nonOwner.ok).toBe(false);
    if (!nonOwner.ok) expect(nonOwner.error.code).toBe("forbidden_actor");
  });
});

describe("resolve + close", () => {
  it("resolves a single part and closes with cause and lesson", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const escalationId = await openEscalation(t, ids, { itemId: itemIds[0]! });
    const resolved = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "fix" },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.data).toMatchObject({ resolved: true });
    const closed = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_escalation",
      payload: { escalationId, cause: "missing_source", lessonCandidate: "pedir fonte na coleta" },
    });
    expect(closed.ok).toBe(true);
    const row = await t.deps.uow.repos.escalations.get(scope, escalationId);
    expect(row).toMatchObject({
      status: "closed",
      cause: "missing_source",
      lessonCandidate: "pedir fonte na coleta",
    });
  });

  it("needs every part resolved after a merge, each by its owner", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const content = await openEscalation(t, ids, { itemId: itemIds[0]! });
    const technical = await openEscalation(t, ids, { kind: "technical", itemId: itemIds[0]! });
    const merged = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "merge_escalations",
      payload: { escalationIds: [content, technical] },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const escalationId = merged.value.data.escalationId as string;
    const firstPart = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "confirm_no_issue" },
    });
    expect(firstPart.ok).toBe(true);
    if (!firstPart.ok) return;
    expect(firstPart.value.data.resolved).toBe(false);
    // Still open: closing refuses until the technical part resolves.
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_escalation",
      payload: { escalationId, cause: "other" },
    });
    expect(early.ok).toBe(false);
    const secondPart = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "resolve_technical_escalation",
      payload: { escalationId, exit: "fix" },
    });
    expect(secondPart.ok).toBe(true);
    if (!secondPart.ok) return;
    expect(secondPart.value.data.resolved).toBe(true);
    expect((await t.deps.uow.repos.escalations.get(scope, escalationId))?.status).toBe("resolved");
  });

  it("defers to the client with the earlier of 2 business days and the item limit", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [
        { scheduledFor: new Date("2026-10-09T12:00:00.000Z") },
        { scheduledFor: new Date("2026-10-06T13:00:00.000Z") },
      ],
    });
    const far = await openEscalation(t, ids, { itemId: itemIds[0]! });
    const deferredFar = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId: far, exit: "defer_to_client" },
    });
    expect(deferredFar.ok).toBe(true);
    if (!deferredFar.ok) return;
    // Item limit Oct 9 10:00Z; 2 business days (Oct 7 14:00Z) wins.
    expect(new Date(deferredFar.value.data.dueAt as string)).toEqual(new Date("2026-10-07T14:00:00.000Z"));
    expect((await t.deps.uow.repos.escalations.get(scope, far))?.status).toBe("awaiting_client");
    const near = await openEscalation(t, ids, { itemId: itemIds[1]! });
    const deferredNear = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId: near, exit: "defer_to_client" },
    });
    expect(deferredNear.ok).toBe(true);
    if (!deferredNear.ok) return;
    // Item limit Oct 6 11:00Z wins over Oct 7.
    expect(new Date(deferredNear.value.data.dueAt as string)).toEqual(
      new Date("2026-10-06T11:00:00.000Z"),
    );
  });

  it("closes without resuming the front: close, resume and recalibrate stay separate", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const escalationId = await openEscalation(t, ids, {
      severity: "critical",
      itemId: itemIds[0]!,
    });
    const resolved = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "fix" },
    });
    expect(resolved.ok).toBe(true);
    const closed = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_escalation",
      payload: { escalationId, cause: "model_error" },
    });
    expect(closed.ok).toBe(true);
    // The front pause survives the close; resume needs quality, not the close.
    const pauses = await t.deps.uow.repos.pauses.list(scope);
    const frontPause = pauses.find((p) => p.origin === "content_incident");
    expect(frontPause?.status).toBe("active");
    const resumed = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resume_pause",
      payload: { pauseId: frontPause!.id },
    });
    expect(resumed.ok).toBe(true);
    expect((await t.deps.uow.repos.escalations.get(scope, escalationId))?.status).toBe("closed");
    // And recalibration is its own command with its own condition.
    const recalibrated = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_front_calibration",
      payload: { frontId: "00000000-0000-4000-8000-000000000000", escalationId },
    });
    expect(recalibrated.ok).toBe(false);
  });

  it("reopens calibration only for closed critical content on a released front", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const front = fronts.find((f) => f.key === "social_instagram")!;
    await t.deps.uow.repos.fronts.update(scope, front.id, {
      status: "released",
      releasedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    const { itemIds } = await deliverTestBatch(t, ids);
    const escalationId = await openEscalation(t, ids, {
      severity: "critical",
      itemId: itemIds[0]!,
    });
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_front_calibration",
      payload: { frontId: front.id, escalationId },
    });
    expect(early.ok).toBe(false);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "fix" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_escalation",
      payload: { escalationId, cause: "model_error" },
    });
    const reopened = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_front_calibration",
      payload: { frontId: front.id, escalationId },
    });
    expect(reopened.ok).toBe(true);
    expect(await t.deps.uow.repos.fronts.get(scope, front.id)).toMatchObject({
      status: "calibrating",
      calibrationSequence: 0,
      roundsUsed: 0,
      releasedAt: null,
    });
    const operations = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "reopen_front_calibration",
      payload: { frontId: front.id, escalationId },
    });
    expect(operations.ok).toBe(false);
  });
});

describe("expire_escalation_client_wait", () => {
  it("closes unanswered cases and drops the item to 'não publicar'", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const escalationId = await openEscalation(t, ids, { itemId: itemIds[0]! });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId, exit: "defer_to_client" },
    });
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_escalation_client_wait",
      payload: { escalationId },
    });
    expect(early.ok).toBe(false);
    const lateDeps = { ...t.deps, clock: fixedClock(new Date("2026-10-08T14:00:00.000Z")) };
    const expired = await executeCommand(lateDeps, ctx(ids, ids.actors.system), {
      type: "expire_escalation_client_wait",
      payload: { escalationId },
    });
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.value.data).toMatchObject({ expired: true, itemDeclined: true });
    expect((await t.deps.uow.repos.escalations.get(scope, escalationId))?.cause).toBe(
      "no_client_response",
    );
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("do_not_publish");
    const again = await executeCommand(lateDeps, ctx(ids, ids.actors.system), {
      type: "expire_escalation_client_wait",
      payload: { escalationId },
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.data.expired).toBe(false);
  });
});
