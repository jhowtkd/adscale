import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getEscalationDetail } from "./escalation-queries";
import { ctx, setup, type ItemIds } from "./testing/items";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function openCrossAccount(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds) {
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
      connectionIds: [connection.id],
    },
  });
  if (!outcome.ok) throw new Error(`open failed: ${outcome.error.code}`);
  return { connectionId: connection.id, escalationId: outcome.value.data.escalationId as string };
}

describe("revoke_connection", () => {
  it("lets operations revoke with a reason and records it on the escalation", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { connectionId, escalationId } = await openCrossAccount(t, ids);
    expect((await t.deps.uow.repos.connections.get(scope, connectionId))?.status).toBe("active");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "revoke_connection",
      payload: { connectionId, escalationId, reason: "token vazado, forçar reconexão" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ connectionId, escalationId });
    const connection = await t.deps.uow.repos.connections.get(scope, connectionId);
    expect(connection?.status).toBe("revoked");
    expect(connection?.lastError).toContain("token vazado");
    const connectionEvents = await t.deps.uow.repos.events.list(scope, {
      objectType: "connection",
      objectId: connectionId,
    });
    expect(connectionEvents.map((e) => e.eventType)).toContain("connection.revoked");
    expect(
      connectionEvents.find((e) => e.eventType === "connection.revoked")?.payload,
    ).toMatchObject({ escalationId, reason: "token vazado, forçar reconexão" });
    // The escalation itself records the revocation.
    const detail = await getEscalationDetail(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      escalationId,
    );
    const recorded = detail?.events.find((e) => e.eventType === "connection.revoked");
    expect(recorded?.payload).toMatchObject({ connectionId, reason: "token vazado, forçar reconexão" });
  });

  it("refuses agent, system, support and quality", async () => {
    const { t, ids } = await setup();
    const { connectionId, escalationId } = await openCrossAccount(t, ids);
    for (const actor of [ids.actors.agent, ids.actors.system, ids.actors.support, ids.actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "revoke_connection",
        payload: { connectionId, escalationId, reason: "x" },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("revoke allowed the wrong actor");
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await t.deps.uow.repos.connections.get(SCOPE(ids), connectionId))?.status).toBe("active");
  });

  it("refuses unknown rows and double revokes", async () => {
    const { t, ids } = await setup();
    const { connectionId, escalationId } = await openCrossAccount(t, ids);
    const unknownConnection = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "revoke_connection",
      payload: {
        connectionId: "00000000-0000-4000-8000-000000000000",
        escalationId,
        reason: "x",
      },
    });
    expect(unknownConnection.ok).toBe(false);
    const unknownEscalation = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "revoke_connection",
      payload: {
        connectionId,
        escalationId: "00000000-0000-4000-8000-000000000000",
        reason: "x",
      },
    });
    expect(unknownEscalation.ok).toBe(false);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "revoke_connection",
      payload: { connectionId, escalationId, reason: "primeira" },
    });
    expect(first.ok).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "revoke_connection",
      payload: { connectionId, escalationId, reason: "segunda" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("connection_already_revoked");
  });
});
