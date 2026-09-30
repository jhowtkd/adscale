import { describe, expect, it } from "vitest";
import { executeCommand, FREE_ACCOUNT_COMMANDS } from "./commands";
import { commandSchema } from "./envelope";
import { makeTestDeps, seedStaff, testActors, uuid } from "./testing/deps";
import { requestTask } from "./task-outbox";
import { transact } from "./shared";

const SYSTEM = { kind: "system", job: "free-open" } as const;

function seedMember(t: ReturnType<typeof makeTestDeps>, workspaceId: string, over: Partial<{ userId: string; verified: boolean; name: string; email: string }> = {}) {
  const userId = over.userId ?? `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: over.name ?? "Ana Souza",
    email: over.email ?? "ana@example.com", emailVerified: over.verified ?? true,
  });
  return userId;
}

const open = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, userId: string) =>
  executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId } });

describe("open_free_account", () => {
  it("creates brand, free account, approver, primary thread and source handoff", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const outcome = await open(t, workspaceId, userId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ created: true, accountId: outcome.value.accountId });

    const scope = { workspaceId, accountId: outcome.value.accountId! };
    const account = await t.deps.uow.repos.accounts.get(workspaceId, scope.accountId);
    expect(account?.status).toBe("free");
    const profile = [...t.store.adscaleProfiles.rows.values()].find((row) => row.id === account?.clientProfileId);
    expect(profile).toMatchObject({ workspaceId, name: "Minha marca" });
    expect(await t.deps.uow.repos.people.list(scope)).toEqual([
      expect.objectContaining({ userId, role: "approver", name: "Ana Souza", email: "ana@example.com" }),
    ]);
    expect(await t.deps.uow.repos.threads.list(scope)).toEqual([expect.objectContaining({ kind: "primary" })]);
    expect(t.store.assistantThreads.rows.size).toBe(1);
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([
      expect.objectContaining({ step: "source", clientProfileId: account?.clientProfileId }),
    ]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "account.free_opened" })).toHaveLength(1);
  });

  it("is idempotent: reopening returns the same account with no duplicates", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const first = await open(t, workspaceId, userId);
    const second = await open(t, workspaceId, userId);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.accountId).toBe(first.value.accountId);
    expect(second.value.data).toMatchObject({ created: false });
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
    expect(t.store.adscaleProfiles.rows.size).toBe(1);
    expect(t.store.assistantThreads.rows.size).toBe(1);
    expect(await t.deps.uow.repos.people.list({ workspaceId, accountId: first.value.accountId! })).toHaveLength(1);
    expect(await t.deps.uow.repos.handoffs.list({ workspaceId, accountId: first.value.accountId! })).toHaveLength(1);
  });

  it("returns ANY existing account, even a paid one, without touching it", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, "Marca paga");
    const paid = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id });
    const userId = seedMember(t, workspaceId);
    const outcome = await open(t, workspaceId, userId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.accountId).toBe(paid.id);
    expect(outcome.value.data).toMatchObject({ created: false });
    expect((await t.deps.uow.repos.accounts.get(workspaceId, paid.id))?.status).toBe("deploying");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
    expect(await t.deps.uow.repos.people.list({ workspaceId, accountId: paid.id })).toHaveLength(0);
  });

  it("refuses unverified, non-member and other-workspace users and creates nothing", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const unverified = seedMember(t, workspaceId, { verified: false });
    const elsewhere = seedMember(t, uuid());
    for (const userId of [unverified, elsewhere, "ghost"]) {
      const outcome = await open(t, workspaceId, userId);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
    expect(t.store.adscaleProfiles.rows.size).toBe(0);
  });

  it("is system-only: client, staff and agent actors are forbidden", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const operations = await seedStaff(t, "operations");
    for (const actor of [operations, testActors.agent!, testActors.approver!]) {
      const outcome = await executeCommand(t.deps, { actor, workspaceId }, { type: "open_free_account", payload: { userId } });
      expect(outcome.ok).toBe(false);
    }
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });

  it("respects the workspace gate and rejects extra payload fields", async () => {
    const t = makeTestDeps({ isEnabledForWorkspace: () => false });
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const gated = await open(t, workspaceId, userId);
    expect(gated.ok).toBe(false);
    if (!gated.ok) expect(gated.error.code).toBe("equipe_not_enabled");
    expect(commandSchema.safeParse({ type: "open_free_account", payload: { userId, extra: 1 } }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "open_free_account", payload: { userId: "" } }).success).toBe(false);
  });
});

describe("free account command allowlist", () => {
  async function freeSetup() {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const opened = await open(t, workspaceId, seedMember(t, workspaceId));
    if (!opened.ok) throw new Error("open failed");
    const accountId = opened.value.accountId!;
    const person = (await t.deps.uow.repos.people.list({ workspaceId, accountId }))[0]!;
    return { t, workspaceId, accountId, approver: { kind: "client_person", role: "approver", personId: person.id } as const };
  }

  it("refuses schema-valid paid-only commands with requires_plan", async () => {
    const { t, workspaceId, accountId, approver } = await freeSetup();
    const refused = await executeCommand(t.deps, { actor: approver, workspaceId, accountId }, {
      type: "register_material", payload: { assetId: uuid(), kind: "site" },
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("requires_plan");
  });

  it("allows listed commands and keeps open commands out of the list", async () => {
    const { t, workspaceId, accountId, approver } = await freeSetup();
    const allowed = await executeCommand(t.deps, { actor: approver, workspaceId, accountId }, { type: "ensure_primary_thread", payload: {} });
    if (!allowed.ok) expect(allowed.error.code).not.toBe("requires_plan");
    expect(FREE_ACCOUNT_COMMANDS.has("open_account")).toBe(false);
    expect(FREE_ACCOUNT_COMMANDS.has("open_free_account")).toBe(false);
    expect(FREE_ACCOUNT_COMMANDS.has("approve_item")).toBe(false);
    for (const type of FREE_ACCOUNT_COMMANDS) {
      expect(commandSchema.options.map((o) => o.shape.type.value)).toContain(type);
    }
  });

  it("does not restrict a paid account", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, "Paga");
    const paid = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id });
    const outcome = await executeCommand(t.deps, { actor: { kind: "system", job: "x" }, workspaceId, accountId: paid.id }, {
      type: "register_material", payload: { assetId: uuid(), kind: "site" },
    });
    if (!outcome.ok) expect(outcome.error.code).not.toBe("requires_plan");
  });
});

describe("requestTask outbox", () => {
  async function freeAccount(sendTaskEvent?: (e: { id: string; name: string; data: Record<string, unknown> }) => Promise<unknown>) {
    const t = makeTestDeps();
    t.deps.sendTaskEvent = sendTaskEvent;
    const workspaceId = uuid();
    const opened = await open(t, workspaceId, seedMember(t, workspaceId));
    if (!opened.ok) throw new Error("open failed");
    return { t, workspaceId, accountId: opened.value.accountId! };
  }
  const run = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, accountId: string, fail = false) =>
    transact(t.deps, { actor: SYSTEM, workspaceId, accountId, type: "ensure_primary_thread" } as never, async (ctx) => {
      await requestTask(ctx, { eventName: "equipe.diag", data: { n: 1 } });
      return fail ? { ok: false, error: { code: "boom", message: "x" } } as never : { ok: true, value: null } as never;
    });

  it("persists event + intent, sends after commit with the intent id, and marks dispatched", async () => {
    const sent: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
    const { t, workspaceId, accountId } = await freeAccount(async (e) => { sent.push(e); });
    const outcome = await run(t, workspaceId, accountId);
    expect(outcome.ok).toBe(true);
    const scope = { workspaceId, accountId };
    const [intent] = await t.deps.uow.repos.taskOutbox.list(scope);
    const [event] = await t.deps.uow.repos.events.list(scope, { eventType: "task.requested" });
    expect(intent!.id).toBe(event!.id);
    expect(intent!.dispatchedAt).toBeInstanceOf(Date);
    expect(sent).toEqual([{ id: intent!.id, name: "equipe.diag",
      data: { n: 1, workspaceId, accountId, taskIntentId: intent!.id } }]);
  });

  it("rolls back event and intent when the command fails, and sends nothing", async () => {
    const sent: unknown[] = [];
    const { t, workspaceId, accountId } = await freeAccount(async (e) => { sent.push(e); });
    const outcome = await run(t, workspaceId, accountId, true);
    expect(outcome.ok).toBe(false);
    expect(await t.deps.uow.repos.taskOutbox.list({ workspaceId, accountId })).toEqual([]);
    expect(await t.deps.uow.repos.events.list({ workspaceId, accountId }, { eventType: "task.requested" })).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("keeps the committed command and a pending intent when send fails", async () => {
    const { t, workspaceId, accountId } = await freeAccount(async () => { throw new Error("inngest down"); });
    const outcome = await run(t, workspaceId, accountId);
    expect(outcome.ok).toBe(true);
    const [intent] = await t.deps.uow.repos.taskOutbox.list({ workspaceId, accountId });
    expect(intent!.dispatchedAt).toBeNull();
    expect(await t.deps.uow.internal.listPendingTaskIntents()).toHaveLength(1);
  });
});
