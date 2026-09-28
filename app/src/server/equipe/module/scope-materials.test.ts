import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { makeTestDeps, openTestAccount, testActors, uuid } from "./testing/deps";

describe("confirm_scope", () => {
  it("records the scope confirmation with a notification intent", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const outcome = await executeCommand(t.deps, testActors.substitute, {
      type: "confirm_scope",
      workspaceId,
      accountId,
      payload: { scopeDigest: "anexo-a:v3", note: "2 frentes" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "account.scope_confirmed",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]?.payload).toMatchObject({ scopeDigest: "anexo-a:v3" });
    expect(outcome.value.events[1]?.payload).toMatchObject({
      recipientRole: "strategist",
      templateKey: "scope.confirmed",
    });
    expect(t.notifier.sends).toHaveLength(0);
  });

  it("refuses actors outside approver/substitute", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const envelope = {
      type: "confirm_scope",
      workspaceId,
      accountId,
      payload: { scopeDigest: "anexo-a:v3" },
    } as const;
    for (const actor of [testActors.member, testActors.custodian, testActors.agent, testActors.system, testActors.support]) {
      const outcome = await executeCommand(t.deps, actor, envelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("rejects a second confirmation and unknown accounts", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const first = await executeCommand(t.deps, testActors.approver, {
      type: "confirm_scope",
      workspaceId,
      accountId,
      payload: { scopeDigest: "anexo-a:v3" },
    });
    expect(first.ok).toBe(true);
    const again = await executeCommand(t.deps, testActors.approver, {
      type: "confirm_scope",
      workspaceId,
      accountId,
      payload: { scopeDigest: "anexo-a:v3" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");

    const missing = await executeCommand(t.deps, testActors.approver, {
      type: "confirm_scope",
      workspaceId,
      accountId: uuid(),
      payload: { scopeDigest: "anexo-a:v3" },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("unknown_account");
  });
});

describe("register_material", () => {
  it("records a reference to a workspace asset", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId, kind: "deck" });
    const outcome = await executeCommand(t.deps, testActors.member, {
      type: "register_material",
      workspaceId,
      accountId,
      payload: { assetId, kind: "deck", origin: "conversa" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "material.registered",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]?.objectId).toBe(assetId);
    expect(outcome.value.events[0]?.payload).toMatchObject({ assetId, kind: "deck" });
  });

  it("lets support upload on behalf of the client, but never agents", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId, kind: "pdf" });
    const envelope = {
      type: "register_material",
      workspaceId,
      accountId,
      payload: { assetId, kind: "pdf", origin: "recebido via WhatsApp" },
    } as const;
    expect((await executeCommand(t.deps, testActors.support, envelope)).ok).toBe(true);
    for (const actor of [testActors.agent, testActors.system, testActors.quality]) {
      const outcome = await executeCommand(t.deps, actor, envelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("rejects assets outside the workspace", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const missing = await executeCommand(t.deps, testActors.approver, {
      type: "register_material",
      workspaceId,
      accountId,
      payload: { assetId: uuid(), kind: "deck" },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("unknown_asset");

    const foreignId = uuid();
    t.gateway.addAsset({ id: foreignId, workspaceId: uuid(), kind: "deck" });
    const foreign = await executeCommand(t.deps, testActors.approver, {
      type: "register_material",
      workspaceId,
      accountId,
      payload: { assetId: foreignId, kind: "deck" },
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("unknown_asset");
  });
});
