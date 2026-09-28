import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getItemDetail } from "./queries";
import { ctx, deliverTestBatch, frontIdOf, setup } from "./testing/items";

const SCOPE = (ids: { workspaceId: string; accountId: string }) => ({
  workspaceId: ids.workspaceId,
  accountId: ids.accountId,
});

describe("open_escalation", () => {
  it("opens a normal escalation and blocks the item immediately", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "normal", itemId: itemIds[0]!, reason: "claim sem fonte" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const escalationId = outcome.value.data.escalationId as string;
    const row = await t.deps.uow.repos.escalations.get(scope, escalationId);
    expect(row).toMatchObject({
      kind: "content",
      severity: "medium",
      status: "open",
      ownerRole: "quality",
      itemId: itemIds[0],
    });
    expect(row?.dueAt).toEqual(new Date("2026-10-06T14:00:00.000Z"));
    // The item is blocked: review shows blocked, approval refuses, lifecycle stays.
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.review.status).toBe("blocked");
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "escalation.opened",
      "notification.requested",
    ]);
  });

  it("routes the owner by kind and severity", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    for (const [kind, ownerRole] of [
      ["content", "quality"],
      ["technical", "operations"],
      ["security", "operations"],
    ] as const) {
      const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
        type: "open_escalation",
        payload: { kind, severity: "normal", reason: "roteamento" },
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const row = await t.deps.uow.repos.escalations.get(
        scope,
        outcome.value.data.escalationId as string,
      );
      expect(row?.ownerRole).toBe(ownerRole);
    }
    // Cross-account containment is always operations, even for content.
    const cross = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_escalation",
      payload: { kind: "content", severity: "critical_cross_account", reason: "conta errada" },
    });
    expect(cross.ok).toBe(true);
    if (!cross.ok) return;
    const row = await t.deps.uow.repos.escalations.get(
      scope,
      cross.value.data.escalationId as string,
    );
    expect(row).toMatchObject({ ownerRole: "operations", severity: "critical_cross_account" });
  });

  it("pauses the front and opens a support case on critical", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "critical", itemId: itemIds[0]!, reason: "preço errado no ar" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const data = outcome.value.data as { pauseIds: string[]; exceptionId: string };
    expect(data.pauseIds).toHaveLength(1);
    const pause = await t.deps.uow.repos.pauses.get(scope, data.pauseIds[0]!);
    expect(pause).toMatchObject({
      origin: "content_incident",
      level: "publishing",
      scope: "front",
      frontId,
      status: "active",
    });
    // The scheduled item is held; the support case links the escalation.
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("held");
    const exception = await t.deps.uow.repos.exceptions.get(scope, data.exceptionId);
    expect(exception).toMatchObject({ trigger: "critical_incident", status: "open" });
    expect(exception?.dueAt).toEqual(new Date("2026-10-05T16:00:00.000Z"));
    const opened = outcome.value.events.find((e) => e.eventType === "support_exception.opened");
    expect(opened?.payload).toMatchObject({ escalationId: outcome.value.data.escalationId });
  });

  it("suspends execution and isolates connections on cross-account incidents", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const connection = await t.deps.uow.repos.connections.create(scope, {
      provider: "instagram",
      encryptedToken: "tok",
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_escalation",
      payload: {
        kind: "security",
        severity: "critical_cross_account",
        reason: "post na conta errada",
        systemic: true,
        connectionIds: [connection.id],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const data = outcome.value.data as {
      pauseIds: string[];
      exceptionId: string;
      isolatedConnectionIds: string[];
      globalStopId: string | null;
    };
    // (#583) Systemic applies the real global stop immediately — containment
    // before any other action — with no per-account global_stop pause row.
    expect(data.pauseIds).toHaveLength(1);
    expect(data.globalStopId).toEqual(expect.any(String));
    expect(data.isolatedConnectionIds).toEqual([connection.id]);
    const pauses = await t.deps.uow.repos.pauses.list(scope);
    expect(pauses.filter((p) => p.status === "active")).toHaveLength(1);
    const summaries = pauses.map((p) => [p.origin, p.level, p.scope].join("/"));
    expect(summaries).toContain("security/execution/account");
    const active = await t.deps.uow.internal.globalStops.getActive();
    expect(active?.id).toBe(data.globalStopId);
    expect(active).toMatchObject({
      reason: `systemic cause suspected (escalation ${outcome.value.data.escalationId})`,
      status: "active",
    });
    const applied = outcome.value.events.filter((e) => e.eventType === "global_stop.applied");
    expect(applied).toHaveLength(1);
    expect(applied[0]?.payload).toMatchObject({
      escalationId: outcome.value.data.escalationId,
    });
    const notes = outcome.value.events.filter(
      (e) =>
        e.eventType === "notification.requested" &&
        (e.payload as { templateKey?: string })?.templateKey === "global_stop.applied",
    );
    expect(notes.map((e) => (e.payload as { recipientRole?: string }).recipientRole).sort()).toEqual(
      ["founder", "operations"],
    );
    // Isolated through the suspension — the stored status stays untouched,
    // only operations revoke (see revoke_connection).
    expect((await t.deps.uow.repos.connections.get(scope, connection.id))?.status).toBe("active");
    const opened = outcome.value.events.find((e) => e.eventType === "escalation.opened");
    expect(opened?.payload).toMatchObject({
      isolatedConnectionIds: [connection.id],
      globalStopId: data.globalStopId,
    });
    const suspended = outcome.value.events.find((e) => e.eventType === "pause.applied");
    expect(suspended?.payload).toMatchObject({ isolatedConnectionIds: [connection.id] });
    expect(data.exceptionId).toBeTruthy();
  });

  it("rejects bad scope, connections outside cross-account, and client actors", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const otherFront = await frontIdOf(t, ids, "midia_paga");
    const mismatch = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: {
        kind: "content",
        severity: "normal",
        itemId: itemIds[0]!,
        frontId: otherFront,
        reason: "x",
      },
    });
    expect(mismatch.ok).toBe(false);
    const noFront = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "critical", reason: "sem frente" },
    });
    expect(noFront.ok).toBe(false);
    if (!noFront.ok) expect(noFront.error.code).toBe("front_required");
    const connection = await t.deps.uow.repos.connections.create(SCOPE(ids), {
      provider: "instagram",
      encryptedToken: "tok",
    });
    const badContainment = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_escalation",
      payload: {
        kind: "technical",
        severity: "normal",
        reason: "x",
        connectionIds: [connection.id],
      },
    });
    expect(badContainment.ok).toBe(false);
    const clientOpen = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "open_escalation",
      payload: { kind: "content", severity: "normal", reason: "x" },
    });
    expect(clientOpen.ok).toBe(false);
    if (!clientOpen.ok) expect(clientOpen.error.code).toBe("forbidden_actor");
  });
});

describe("report_item_problem", () => {
  it("opens a normal content escalation on undecided items", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "report_item_problem",
      payload: { itemId: itemIds[0]!, note: "o preço está errado" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.severity).toBe("normal");
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.review.status).toBe("blocked");
  });

  it("opens a critical escalation when the item already went out", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, { status: "published" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "report_item_problem",
      payload: { itemId: itemIds[0]!, note: "esse post já saiu errado" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.severity).toBe("critical");
    expect(outcome.value.data.pauseIds).toBeTruthy();
    const pauses = await t.deps.uow.repos.pauses.list(scope);
    expect(pauses.some((p) => p.origin === "content_incident" && p.status === "active")).toBe(true);
  });

  it("refuses agents and unknown items", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "report_item_problem",
      payload: { itemId: itemIds[0]!, note: "x" },
    });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.error.code).toBe("forbidden_actor");
    const unknown = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "report_item_problem",
      payload: { itemId: "00000000-0000-4000-8000-000000000000", note: "x" },
    });
    expect(unknown.ok).toBe(false);
  });
});
