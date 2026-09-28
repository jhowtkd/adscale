import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { makeTestDeps, openTestAccount, seedStaff, testActors, uuid } from "./testing/deps";

describe("command trust boundary", () => {
  it("rejects a rawCommand smuggling actor, workspaceId or accountId keys", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const context = {
      actor: ids.actors.approver,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
    };
    const payload = { scopeDigest: "a:v1" };
    for (const rawCommand of [
      { type: "confirm_scope", actor: testActors.operations, payload },
      { type: "confirm_scope", workspaceId: ids.workspaceId, payload },
      { type: "confirm_scope", accountId: ids.accountId, payload },
    ]) {
      const outcome = await executeCommand(t.deps, context, rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
    }
    expect(
      await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }),
    ).toHaveLength(2); // open_account only
  });

  it("requires accountId in context for every command except open_account", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const missing = await executeCommand(
      t.deps,
      { actor: ids.actors.agent, workspaceId: ids.workspaceId },
      { type: "advance_onboarding", payload: { step: "scope_confirm" } },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("invalid_context");

    // open_account takes no accountId: there is no account yet.
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    const opened = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(opened.ok).toBe(true);
  });

  it("rejects malformed scope and missing actors in context", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const rawCommand = { type: "confirm_scope", payload: { scopeDigest: "a:v1" } };
    for (const context of [
      { actor: ids.actors.approver, workspaceId: "not-a-uuid", accountId: ids.accountId },
      { actor: ids.actors.approver, workspaceId: ids.workspaceId, accountId: "not-a-uuid" },
      null,
    ]) {
      const outcome = await executeCommand(t.deps, context, rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid_context");
    }
    const noActor = await executeCommand(
      t.deps,
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      rawCommand,
    );
    expect(noActor.ok).toBe(false);
    if (!noActor.ok) expect(noActor.error.code).toBe("invalid_actor");
  });
});
