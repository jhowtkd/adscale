import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  getCrossAccountPipeline,
  getEscalationDetail,
  getExceptionsQueue,
} from "./escalation-queries";
import { ctx, deliverTestBatch, setup } from "./testing/items";
import { makeTestDeps, openTestAccount } from "./testing/deps";

describe("getExceptionsQueue", () => {
  it("lists open cases oldest-deadline first with the SLA breach flag", async () => {
    const { t, ids } = await setup();
    const slow = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "open_exception",
      payload: { trigger: "stuck_connection" },
    });
    const fast = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "open_exception",
      payload: { trigger: "critical_incident" },
    });
    if (!slow.ok || !fast.ok) throw new Error("open failed");
    await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "assume_exception",
      payload: { exceptionId: fast.value.data.exceptionId },
    });
    const queue = await getExceptionsQueue(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      new Date("2026-10-05T15:00:00.000Z"),
    );
    expect(queue?.open.map((entry) => entry.exception.id)).toEqual([
      fast.value.data.exceptionId,
      slow.value.data.exceptionId,
    ]);
    expect(queue?.open.map((entry) => entry.slaBreached)).toEqual([false, false]);
    const late = await getExceptionsQueue(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      new Date("2026-10-05T17:00:00.000Z"),
    );
    expect(late?.open[0]?.slaBreached).toBe(true);
    expect(late?.open[1]?.slaBreached).toBe(false);
    const missing = await getExceptionsQueue(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      "00000000-0000-4000-8000-000000000000",
      new Date(),
    );
    expect(missing).toBeNull();
  });

  it("carries the brand and workspace names", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t, {
      labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" },
    });
    const queue = await getExceptionsQueue(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      new Date(),
    );
    expect(queue?.brandName).toBe("Café Aurora");
    expect(queue?.workspaceName).toBe("Agência Sul");
  });
});

describe("getCrossAccountPipeline", () => {
  it("merges open work across account scopes, severest first", async () => {
    const t = makeTestDeps();
    const first = await openTestAccount(t);
    const second = await openTestAccount(t);
    const minor = await executeCommand(t.deps, ctx(first, first.actors.agent), {
      type: "open_escalation",
      payload: { kind: "content", severity: "normal", reason: "x" },
    });
    const major = await executeCommand(t.deps, ctx(second, second.actors.system), {
      type: "open_escalation",
      payload: { kind: "security", severity: "critical_cross_account", reason: "y" },
    });
    if (!minor.ok || !major.ok) throw new Error("open failed");
    await executeCommand(t.deps, ctx(first, first.actors.approver), {
      type: "pause_publications",
      payload: {},
    });
    const view = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(view.entries).toHaveLength(2);
    expect(view.entries[0]?.escalations.map((e) => e.id)).toEqual([
      minor.value.data.escalationId,
    ]);
    expect(view.entries[0]?.pauses).toHaveLength(1);
    expect(view.entries[1]?.escalations.map((e) => e.id)).toEqual([
      major.value.data.escalationId,
    ]);
    // Closed and lifted rows drop out of the pipeline.
    const closeId = minor.value.data.escalationId as string;
    await executeCommand(t.deps, ctx(first, first.actors.quality), {
      type: "resolve_content_escalation",
      payload: { escalationId: closeId, exit: "fix" },
    });
    await executeCommand(t.deps, ctx(first, first.actors.quality), {
      type: "close_escalation",
      payload: { escalationId: closeId, cause: "other" },
    });
    const after = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(after.entries[0]?.scope.accountId).toBe(first.accountId);
    expect(after.entries[0]?.escalations).toHaveLength(0);
    // The other account's critical case is still open.
    expect(after.entries[1]?.escalations).toHaveLength(1);
  });

  it("labels each entry with its brand and workspace names", async () => {
    const t = makeTestDeps();
    await openTestAccount(t, {
      labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" },
    });
    await openTestAccount(t, {
      labels: { brandName: "Papelaria Tinta", workspaceName: "Agência Norte" },
    });
    const view = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(view.entries.map((entry) => [entry.brandName, entry.workspaceName])).toEqual([
      ["Café Aurora", "Agência Sul"],
      ["Papelaria Tinta", "Agência Norte"],
    ]);
  });
});

describe("getEscalationDetail", () => {
  it("joins parts, item, events, covering pauses and the linked case", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: {
        kind: "content",
        severity: "critical",
        itemId: itemIds[0]!,
        reason: "preço errado no ar",
      },
    });
    if (!opened.ok) throw new Error("open failed");
    const escalationId = opened.value.data.escalationId as string;
    const detail = await getEscalationDetail(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      escalationId,
    );
    expect(detail?.escalation.id).toBe(escalationId);
    expect(detail?.parts).toEqual([{ kind: "content", resolved: false }]);
    expect(detail?.item?.id).toBe(itemIds[0]);
    expect(detail?.events.map((e) => e.eventType)).toContain("escalation.opened");
    expect(detail?.pauses.map((p) => p.origin)).toContain("content_incident");
    expect(detail?.exception?.trigger).toBe("critical_incident");
    expect(detail?.isolatedConnections).toEqual([]);
    const missing = await getEscalationDetail(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toBeNull();
  });

  it("carries the brand names and the isolated connections", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t, {
      labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" },
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const connection = await t.deps.uow.repos.connections.create(scope, {
      provider: "instagram",
      encryptedToken: "v1:seed",
      status: "active",
    });
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_escalation",
      payload: {
        kind: "security",
        severity: "critical_cross_account",
        reason: "token vazado",
        connectionIds: [connection.id],
      },
    });
    if (!opened.ok) throw new Error("open failed");
    const detail = await getEscalationDetail(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      opened.value.data.escalationId as string,
    );
    expect(detail?.brandName).toBe("Café Aurora");
    expect(detail?.workspaceName).toBe("Agência Sul");
    expect(detail?.isolatedConnections).toEqual([
      {
        id: connection.id,
        provider: "instagram",
        accountId: ids.accountId,
        status: "active",
      },
    ]);
  });
});
