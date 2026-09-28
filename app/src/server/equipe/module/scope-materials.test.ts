import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import {
  makeTestDeps,
  openTestAccount,
  type TestAccountActors,
  uuid,
} from "./testing/deps";

type Ids = { workspaceId: string; accountId: string; actors: TestAccountActors };

function ctx(ids: Ids, actor: Actor) {
  return { actor, workspaceId: ids.workspaceId, accountId: ids.accountId };
}

describe("confirm_scope", () => {
  it("records the scope confirmation with a notification intent", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "confirm_scope",
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
    const ids = await openTestAccount(t);
    const rawCommand = {
      type: "confirm_scope",
      payload: { scopeDigest: "anexo-a:v3" },
    } as const;
    for (const actor of [ids.actors.member, ids.actors.custodian, ids.actors.agent, ids.actors.system, ids.actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("rejects a second confirmation and unknown accounts", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_scope",
      payload: { scopeDigest: "anexo-a:v3" },
    });
    expect(first.ok).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_scope",
      payload: { scopeDigest: "anexo-a:v3" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");

    // Binding runs before the handler: no such person on that account.
    const missingPerson = await executeCommand(
      t.deps,
      { actor: ids.actors.approver, workspaceId: ids.workspaceId, accountId: uuid() },
      {
        type: "confirm_scope",
        payload: { scopeDigest: "anexo-a:v3" },
      },
    );
    expect(missingPerson.ok).toBe(false);
    if (!missingPerson.ok) expect(missingPerson.error.code).toBe("forbidden_actor");

    // Agents have no binding, so they reach the handler's account lookup.
    const missingAccount = await executeCommand(
      t.deps,
      { actor: ids.actors.agent, workspaceId: ids.workspaceId, accountId: uuid() },
      { type: "propose_plan", payload: { content: {} } },
    );
    expect(missingAccount.ok).toBe(false);
    if (!missingAccount.ok) expect(missingAccount.error.code).toBe("unknown_account");
  });
});

describe("register_material", () => {
  it("records a reference to a workspace asset", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId: ids.workspaceId, kind: "deck" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "register_material",
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
    const ids = await openTestAccount(t);
    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId: ids.workspaceId, kind: "pdf" });
    const rawCommand = {
      type: "register_material",
      payload: { assetId, kind: "pdf", origin: "recebido via WhatsApp" },
    } as const;
    expect((await executeCommand(t.deps, ctx(ids, ids.actors.support), rawCommand)).ok).toBe(true);
    for (const actor of [ids.actors.agent, ids.actors.system, ids.actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("rejects assets outside the workspace", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const missing = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "register_material",
      payload: { assetId: uuid(), kind: "deck" },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("unknown_asset");

    const foreignId = uuid();
    t.gateway.addAsset({ id: foreignId, workspaceId: uuid(), kind: "deck" });
    const foreign = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "register_material",
      payload: { assetId: foreignId, kind: "deck" },
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("unknown_asset");
  });
});
