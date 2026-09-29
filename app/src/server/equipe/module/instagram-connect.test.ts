import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { findCustodianPersonForUser } from "./instagram-connect";
import {
  approveLiveMandate, ctx, deliverDueApprovedItem, encryptedInstagramToken,
  makeTestDeps, openTestAccount, seedInstagramConnection, setup, type ItemIds,
} from "./testing/publication";
import { testActors as unboundActors } from "./testing/deps";

function scopeOf(ids: ItemIds) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

describe("complete_instagram_connect", () => {
  it("stores the Equipe connection as active with the custodian owner", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    const encryptedToken = encryptedInstagramToken();
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
      type: "complete_instagram_connect",
      payload: { encryptedToken, igUsername: "brand" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconnected: false });
    const connections = await t.deps.uow.repos.connections.list(scope);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      provider: "instagram",
      encryptedToken,
      status: "active",
    });
    expect(connections[0]?.custodianPersonId).toBe(
      ids.actors.custodian.kind === "client_person" ? ids.actors.custodian.personId : "",
    );
    expect(outcome.value.events.map((e) => e.eventType)).toContain("connection.connected");
  });

  it("a reconnect overwrites the token without recreating the row", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    const actor = ctx(ids, ids.actors.custodian);
    await executeCommand(t.deps, actor, {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken("ig_test_brand", "brand", "first") },
    });
    const secondToken = encryptedInstagramToken("ig_test_brand", "brand", "second");
    const second = await executeCommand(t.deps, actor, {
      type: "complete_instagram_connect",
      payload: { encryptedToken: secondToken },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ reconnected: true });
    const connections = await t.deps.uow.repos.connections.list(scope);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.encryptedToken).toBe(secondToken);
  });

  it("only the custodian connects", async () => {
    const { t, ids } = await setup();
    for (const actor of [ids.actors.approver, ids.actors.member, ids.actors.operations]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "complete_instagram_connect",
        payload: { encryptedToken: encryptedInstagramToken() },
      });
      expect(outcome.ok).toBe(false);
    }
    const unbound = await executeCommand(t.deps, ctx(ids, unboundActors.custodian!), {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken() },
    });
    expect(unbound.ok).toBe(false);
    if (unbound.ok) return;
    expect(unbound.error.code).toBe("forbidden_actor");
  });

  it.each([false, true])("preserves approval only for the same profile (different profile: %s)", async (different) => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const { itemId, intentId, versionHash } = await deliverDueApprovedItem(t, ids);
    const reconnected = await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken(different ? "ig_other" : "ig_test_brand", "brand", "renewed") },
    });
    expect(reconnected.ok).toBe(true);
    expect(await t.deps.uow.repos.items.get(scope, itemId)).toMatchObject({
      currentVersionHash: versionHash, status: different ? "held" : "scheduled",
    });
    expect(await t.deps.uow.repos.intents.get(scope, intentId)).toMatchObject({
      destinationIgUserId: "ig_test_brand", status: different ? "held" : "pending",
      lastError: different ? "instagram_destination_changed" : null,
    });
    expect(await t.deps.uow.repos.itemVersions.list(scope, { itemId })).toHaveLength(1);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.objectVersion).toBe(versionHash);
    if (different) {
      // Returning to the old identity cannot silently restore an invalidated approval.
      await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
        type: "complete_instagram_connect", payload: { encryptedToken: encryptedInstagramToken() },
      });
    }
    const dispatch = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication", payload: { intentId },
    });
    expect(dispatch.ok && dispatch.value.data).toMatchObject({ action: different ? "held" : "published" });
    expect(t.publisher.publishes).toHaveLength(different ? 0 : 1);
  });
});

describe("fail_instagram_connect", () => {
  it("records the failure in plain language on the row", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken() },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
      type: "fail_instagram_connect",
      payload: { code: "oauth_failed" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ failures: 1, exceptionId: null });
    const connections = await t.deps.uow.repos.connections.list(scope);
    expect(connections[0]?.status).toBe("error");
    expect(connections[0]?.lastError).toContain("Não conseguimos concluir a conexão");
    expect(outcome.value.events.map((e) => e.eventType)).toContain("connection.failed");
  });

  it("two failures open one 'conexão travada' support exception", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    const actor = ctx(ids, ids.actors.custodian);
    const first = await executeCommand(t.deps, actor, {
      type: "fail_instagram_connect",
      payload: { code: "oauth_failed" },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, actor, {
      type: "fail_instagram_connect",
      payload: { code: "no_instagram_account" },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ failures: 2 });
    expect(second.value.data.exceptionId).not.toBeNull();
    const exceptions = await t.deps.uow.repos.exceptions.list(scope);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ trigger: "stuck_connection", status: "open" });
    // A third failure does not open a second exception while one is open.
    const third = await executeCommand(t.deps, actor, {
      type: "fail_instagram_connect",
      payload: { code: "oauth_failed" },
    });
    expect(third.ok).toBe(true);
    expect(await t.deps.uow.repos.exceptions.list(scope)).toHaveLength(1);
  });

  it("a success resets the failure count", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    const actor = ctx(ids, ids.actors.custodian);
    await executeCommand(t.deps, actor, {
      type: "fail_instagram_connect",
      payload: { code: "oauth_failed" },
    });
    await executeCommand(t.deps, actor, {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken() },
    });
    const after = await executeCommand(t.deps, actor, {
      type: "fail_instagram_connect",
      payload: { code: "oauth_failed" },
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.data).toMatchObject({ failures: 1, exceptionId: null });
    expect(await t.deps.uow.repos.exceptions.list(scope)).toHaveLength(0);
  });
});

describe("findCustodianPersonForUser", () => {
  it("binds the session user to the active custodian row", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t, {
      people: [
        { name: "Ana", role: "approver", userId: "user-ana" },
        { name: "Cid", role: "custodian", userId: "user-cid" },
      ],
    });
    const scope = scopeOf(ids);
    const found = await findCustodianPersonForUser(t.deps.uow.repos, scope, "user-cid");
    expect(found?.role).toBe("custodian");
    expect(await findCustodianPersonForUser(t.deps.uow.repos, scope, "user-ana")).toBeNull();
    expect(await findCustodianPersonForUser(t.deps.uow.repos, scope, "user-unknown")).toBeNull();
  });
});
