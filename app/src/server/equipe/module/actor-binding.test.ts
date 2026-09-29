import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  makeTestDeps,
  openTestAccount,
  seedStaff,
  uuid,
} from "./testing/deps";

describe("actor binding", () => {
  it("rejects an approver of another account", async () => {
    const t = makeTestDeps();
    const a = await openTestAccount(t);
    const b = await openTestAccount(t);
    // B's approver is bound to B — using them on A's scope must fail.
    const outcome = await executeCommand(
      t.deps,
      { actor: b.actors.approver, workspaceId: a.workspaceId, accountId: a.accountId },
      { type: "confirm_scope", payload: { scopeDigest: "a:v1" } },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    expect(
      await t.deps.uow.repos.events.list({ workspaceId: a.workspaceId, accountId: a.accountId }),
    ).toHaveLength(3); // open_account + primary thread: binding failure wrote nothing
  });

  it("rejects a member claiming the approver role", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const memberId =
      ids.actors.member.kind === "client_person" ? ids.actors.member.personId : "";
    const outcome = await executeCommand(
      t.deps,
      {
        actor: { kind: "client_person", role: "approver", personId: memberId },
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
      },
      { type: "confirm_scope", payload: { scopeDigest: "a:v1" } },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
  });

  it("rejects an inactive person", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const approverId =
      ids.actors.approver.kind === "client_person" ? ids.actors.approver.personId : "";
    await t.deps.uow.repos.people.update(scope, approverId, { active: false });
    const outcome = await executeCommand(
      t.deps,
      { actor: ids.actors.approver, workspaceId: ids.workspaceId, accountId: ids.accountId },
      { type: "confirm_scope", payload: { scopeDigest: "a:v1" } },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
  });

  it("rejects unknown staff, staff without the role, and inactive staff", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const recordCommand = {
      type: "record_installment_paid",
      payload: { installment: 2, reference: "pix-2" },
    } as const;

    const unknown = await executeCommand(
      t.deps,
      {
        actor: { kind: "staff", role: "support", staffId: uuid() },
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
      },
      recordCommand,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("forbidden_actor");

    // An operations row claimed as support: authorize grants support, the
    // binding sees the row holds operations.
    const operationsId =
      ids.actors.operations.kind === "staff" ? ids.actors.operations.staffId : "";
    const wrongRole = await executeCommand(
      t.deps,
      {
        actor: { kind: "staff", role: "support", staffId: operationsId },
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
      },
      recordCommand,
    );
    expect(wrongRole.ok).toBe(false);
    if (!wrongRole.ok) expect(wrongRole.error.code).toBe("forbidden_actor");

    const retired = await seedStaff(t, "support", { active: false });
    const inactive = await executeCommand(
      t.deps,
      { actor: retired, workspaceId: ids.workspaceId, accountId: ids.accountId },
      recordCommand,
    );
    expect(inactive.ok).toBe(false);
    if (!inactive.ok) expect(inactive.error.code).toBe("forbidden_actor");

    expect(await t.deps.uow.repos.events.list(scope)).toHaveLength(3); // open_account + primary thread
  });

  it("binds staff on open_account too", async () => {
    const t = makeTestDeps();
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

    // Unknown operations staff: authorize grants, binding rejects.
    const unknown = await executeCommand(
      t.deps,
      { actor: { kind: "staff", role: "operations", staffId: uuid() }, workspaceId },
      rawCommand,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("forbidden_actor");

    // A support row claimed as operations.
    const support = await seedStaff(t, "support");
    const supportId = support.kind === "staff" ? support.staffId : "";
    const wrongRole = await executeCommand(
      t.deps,
      { actor: { kind: "staff", role: "operations", staffId: supportId }, workspaceId },
      rawCommand,
    );
    expect(wrongRole.ok).toBe(false);
    if (!wrongRole.ok) expect(wrongRole.error.code).toBe("forbidden_actor");

    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });

  it("records receipts with the person and role from the stored row", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const outcome = await executeCommand(
      t.deps,
      { actor: ids.actors.approver, workspaceId: ids.workspaceId, accountId: ids.accountId },
      { type: "approve_brand_voice", payload: { voice: "direta, sem jargão" } },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const people = await t.deps.uow.repos.people.list(scope);
    const row = people.find((person) => person.role === "approver")!;
    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personId: row.id,
      personRole: row.role,
    });
    expect(outcome.value.events[0]).toMatchObject({ actorRole: row.role });
  });
});
