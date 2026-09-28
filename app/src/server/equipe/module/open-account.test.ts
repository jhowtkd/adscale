import { describe, expect, it } from "vitest";
import { addBusinessDays, type Actor } from "../domain";
import { executeCommand } from "./commands";
import { makeTestDeps, openTestAccount, seedStaff, testActors, uuid } from "./testing/deps";

const NOW = new Date("2026-10-05T14:00:00.000Z");

function setup() {
  return makeTestDeps({ now: NOW });
}

describe("open_account", () => {
  it("creates the account, fronts, 7 steps and people in one command", async () => {
    const t = setup();
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });

    const outcome = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram", "midia_paga"],
        people: [
          { name: "Ana", role: "approver", email: "ana@cliente.com" },
          { name: "Carla", role: "substitute" },
          { name: "Rui", role: "member" },
        ],
        notes: "contrato Anexo A",
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { accountId } = outcome.value;
    const scope = { workspaceId, accountId };
    const repos = t.deps.uow.repos;

    const account = await repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("deploying");
    expect(account?.clientProfileId).toBe(profileId);

    const fronts = await repos.fronts.list(scope);
    expect(fronts.map((f) => f.key).sort()).toEqual(["midia_paga", "social_instagram"]);
    expect(fronts.every((f) => f.status === "draft")).toBe(true);

    const steps = await repos.onboarding.list(scope);
    expect(steps).toHaveLength(7);
    const byStep = new Map(steps.map((s) => [s.step, s]));
    expect(byStep.get("scope_confirm")?.owner).toBe("approver");
    expect(byStep.get("scope_confirm")?.dueAt).toEqual(addBusinessDays(NOW, 2));
    expect(byStep.get("materials")?.dueAt).toEqual(addBusinessDays(NOW, 5));
    expect(byStep.get("context")?.dueAt).toEqual(addBusinessDays(NOW, 10));
    expect(byStep.get("connection")?.owner).toBe("custodian");
    expect(byStep.get("go_live")?.owner).toBe("strategist");
    expect(steps.every((s) => s.status === "pending")).toBe(true);

    const people = await repos.people.list(scope);
    expect(people.map((p) => p.role).sort()).toEqual(["approver", "member", "substitute"]);

    const eventTypes = outcome.value.events.map((e) => e.eventType);
    expect(eventTypes).toEqual(["account.opened", "notification.requested"]);
    const notification = outcome.value.events[1]?.payload as Record<string, unknown>;
    expect(notification).toMatchObject({ recipientRole: "approver", templateKey: "account.opened" });

    // The Notifier port is never called inside the transaction.
    expect(t.notifier.sends).toHaveLength(0);
  });

  it("refuses non-operations actors", async () => {
    const t = setup();
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    const rawCommand = {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    } as const;
    const support = await seedStaff(t, "support");
    const quality = await seedStaff(t, "quality");
    for (const actor of [testActors.agent!, testActors.system!, support, quality, testActors.approver!]) {
      const outcome = await executeCommand(t.deps, { actor, workspaceId }, rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });

  it("fails for an unknown or foreign client profile", async () => {
    const t = setup();
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const missing = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: uuid(),
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("unknown_client_profile");

    const elsewhere = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId: elsewhere });
    const foreign = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("unknown_client_profile");
  });

  it("refuses a second account for the same client profile", async () => {
    const t = setup();
    const { workspaceId, profileId, actors } = await openTestAccount(t);
    const again = await executeCommand(t.deps, { actor: actors.operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["midia_paga"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("account_already_exists");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("rejects payloads without exactly one approver", async () => {
    const t = setup();
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    for (const people of [
      [{ name: "Rui", role: "member" }],
      [
        { name: "Ana", role: "approver" },
        { name: "Bia", role: "approver" },
      ],
    ]) {
      const outcome = await executeCommand(t.deps, { actor: operations, workspaceId }, {
        type: "open_account",
        payload: { clientProfileId: profileId, fronts: ["social_instagram"], people },
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
    }
  });

  it("never takes the actor from the raw command", async () => {
    const t = setup();
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    // An "actor" smuggled in the raw command is rejected: the strict schema
    // takes { type, payload } only, and the actor lives in the context.
    const outcome = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      actor: testActors.operations,
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });

  it("rejects malformed contexts and commands", async () => {
    const t = setup();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const badActor = await executeCommand(
      t.deps,
      { actor: { kind: "agent" } as unknown as Actor, workspaceId, accountId },
      {
        type: "confirm_scope",
        payload: { scopeDigest: "x" },
      },
    );
    expect(badActor.ok).toBe(false);
    if (!badActor.ok) expect(badActor.error.code).toBe("invalid_actor");

    const badCommand = await executeCommand(
      t.deps,
      { actor: actors.approver, workspaceId, accountId },
      {
        type: "approve_everything",
        payload: {},
      },
    );
    expect(badCommand.ok).toBe(false);
    if (!badCommand.ok) expect(badCommand.error.code).toBe("invalid_command");

    const badPayload = await executeCommand(
      t.deps,
      { actor: actors.approver, workspaceId, accountId },
      {
        type: "confirm_scope",
        payload: { scopeDigest: "" },
      },
    );
    expect(badPayload.ok).toBe(false);
    if (!badPayload.ok) expect(badPayload.error.code).toBe("invalid_command");
  });
});
