import { describe, expect, it } from "vitest";
import { executeCommand, FREE_ACCOUNT_COMMANDS } from "./commands";
import { commandSchema } from "./envelope";
import { authorize } from "../domain";
import { makeTestDeps, seedStaff, testActors, uuid } from "./testing/deps";
import { requestTask } from "./task-outbox";
import { FREE_INTRO_EVENT } from "../handoff/contract";
import { transact } from "./shared";
import { BRAND_IMPORTED_EVENT } from "./open-free-account";

const SYSTEM = { kind: "system", job: "free-open" } as const;

let memberSeq = 0;
function seedMember(t: ReturnType<typeof makeTestDeps>, workspaceId: string,
  over: Partial<{ userId: string; verified: boolean; name: string; email: string; role: string; createdAt: Date; id: string }> = {}) {
  const userId = over.userId ?? `user-${uuid()}`;
  memberSeq += 1;
  const id = over.id ?? uuid();
  t.store.workspaceMembers.rows.set(id, {
    id, workspaceId, userId, name: over.name ?? "Ana Souza",
    email: over.email ?? "ana@example.com", emailVerified: over.verified ?? true,
    role: over.role ?? "owner", createdAt: over.createdAt ?? new Date(Date.UTC(2026, 0, 1) + memberSeq * 1000),
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

  it("records the Strategist's opening line once, before account.free_opened, and posts it before the first card", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const outcome = await open(t, workspaceId, userId);
    if (!outcome.ok) throw new Error(outcome.error.code);
    const scope = { workspaceId, accountId: outcome.value.accountId! };

    const events = await t.deps.uow.repos.events.list(scope, {});
    const types = events.map((event) => event.eventType);
    expect(types.filter((type) => type === FREE_INTRO_EVENT)).toHaveLength(1);
    expect(types.indexOf(FREE_INTRO_EVENT)).toBeLessThan(types.indexOf("account.free_opened"));

    const messages = [...t.store.assistantMessages.rows.values()];
    expect(messages.map((m) => [m.type, m.payload])).toEqual([
      ["assistant", { handoffStep: "intro" }],
      ["equipe_card", expect.objectContaining({ kind: "handoff", step: "source" })],
    ]);
    expect(messages[0]!.content).toBe("Oi! Sou o Estrategista do ADScale. Antes de criar qualquer coisa, vou conhecer a sua marca. Leva de 3 a 5 minutos.");
    expect(messages[0]!.content).not.toMatch(/\bEquipe\b/);
  });

  it("does not repeat the opening line or its message when the account is reopened", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const first = await open(t, workspaceId, userId);
    if (!first.ok) throw new Error(first.error.code);
    await open(t, workspaceId, userId);
    await open(t, workspaceId, userId);
    const scope = { workspaceId, accountId: first.value.accountId! };
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(1);
    expect([...t.store.assistantMessages.rows.values()].filter((m) => m.payload?.handoffStep === "intro")).toHaveLength(1);
    expect(t.store.assistantMessages.rows.size).toBe(2);
  });

  it("does not post the opening line for an existing paid account that was never opened as free", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, "Marca paga");
    const paid = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id });
    const userId = seedMember(t, workspaceId);
    await open(t, workspaceId, userId);
    expect(await t.deps.uow.repos.events.list({ workspaceId, accountId: paid.id }, { eventType: FREE_INTRO_EVENT })).toHaveLength(0);
    expect([...t.store.assistantMessages.rows.values()].some((m) => m.payload?.handoffStep === "intro")).toBe(false);
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

  it("rejects extra payload fields", () => {
    const userId = uuid();
    expect(commandSchema.safeParse({ type: "open_free_account", payload: { userId, extra: 1 } }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "open_free_account", payload: { userId: "" } }).success).toBe(false);
  });
});

// Spec 2026-10-07 §3: whether the workspace pays changes what a new account is allowed (the second brand, the import), never
// whether it opens.
describe("open_free_account and a classic paid access", () => {
  const withPayer = (t: ReturnType<typeof makeTestDeps>, paid: boolean | (() => Promise<boolean>)) => {
    const calls: string[] = [];
    t.deps.hasClassicPaidAccess = async (id) => { calls.push(id); return typeof paid === "function" ? paid() : paid; };
    return calls;
  };

  it("a workspace that pays and has no account opens its account like any other, asking the reader once", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const calls = withPayer(t, true);

    const outcome = await open(t, workspaceId, userId);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.created).toBe(true);
    expect(calls).toEqual([workspaceId]);
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("a workspace that pays and has no account enters a brand with a Brand Kit by import: the handoff is done", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "Azul", brandColors: ["#2B4C7E"] });
    withPayer(t, true);

    const outcome = await executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId, clientProfileId: brand } });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ created: true, imported: true });
    const scope = { workspaceId, accountId: outcome.value.accountId! };
    expect(await t.deps.uow.repos.accounts.get(workspaceId, scope.accountId)).toMatchObject({ clientProfileId: brand, status: "free" });
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "done", clientProfileId: brand })]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT })).toHaveLength(1);
  });

  it("without a paid access (a sign-up) the account opens as before, asking the reader once", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const calls = withPayer(t, false);

    const outcome = await open(t, workspaceId, userId);

    expect(outcome.ok).toBe(true);
    expect(calls).toEqual([workspaceId]);
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("without the dep wired (tests, jobs) it opens as before", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);

    expect((await open(t, workspaceId, userId)).ok).toBe(true);
  });

  it("an existing account is returned before the payer check: a payer that already has one is never refused or asked", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    expect((await open(t, workspaceId, userId)).ok).toBe(true);
    const calls = withPayer(t, true);

    const again = await open(t, workspaceId, userId);

    expect(again.ok && again.value.data.created).toBe(false);
    expect(calls).toEqual([]);
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("a payer whose accounts are all closed gets the closed account back, like any other workspace", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const first = await open(t, workspaceId, userId);
    if (!first.ok) throw new Error("open failed");
    const accountId = first.value.data.accountId as string;
    await t.deps.uow.repos.accounts.update(workspaceId, accountId, { status: "closed" } as never);
    withPayer(t, true);

    const again = await open(t, workspaceId, userId);

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.data).toMatchObject({ accountId, created: false });
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("without a paid access, a workspace whose accounts are all closed gets its closed account back, as before", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const first = await open(t, workspaceId, userId);
    if (!first.ok) throw new Error("open failed");
    const accountId = first.value.data.accountId as string;
    await t.deps.uow.repos.accounts.update(workspaceId, accountId, { status: "closed" } as never);
    withPayer(t, false);

    const again = await open(t, workspaceId, userId);

    expect(again.ok && again.value.data).toMatchObject({ accountId, created: false });
  });

  it("a workspace that pays still needs a verified owner to open its first account: forbidden_actor, nothing is created", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId, { role: "member" });
    withPayer(t, true);

    const outcome = await open(t, workspaceId, userId);

    expect(!outcome.ok && outcome.error.code).toBe("forbidden_actor");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toEqual([]);
    expect(t.store.assistantThreads.rows.size).toBe(0);
  });

  it("a reader that throws propagates (fails closed: no account is opened on a failed read)", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    withPayer(t, async () => { throw new Error("db down"); });

    await expect(open(t, workspaceId, userId)).rejects.toThrow("db down");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toEqual([]);
  });
});

describe("open_free_account entry-account selection", () => {
  // Same order as getClientAccounts: createdAt ASC, id ASC — independent of status
  // and of the repository/Map iteration order.
  async function seedAccount(t: ReturnType<typeof makeTestDeps>, workspaceId: string,
    over: { id: string; createdAt: string; status?: "free" | "deploying" | "active" }) {
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, `Marca ${over.id.slice(0, 4)}`);
    const created = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id, status: over.status ?? "deploying" });
    const row = t.store.accounts.rows.get(created.id)!;
    t.store.accounts.rows.delete(created.id);
    t.store.accounts.rows.set(over.id, { ...row, id: over.id, createdAt: new Date(over.createdAt) });
    return over.id;
  }
  const reverseAccountOrder = (t: ReturnType<typeof makeTestDeps>) => {
    t.store.accounts.rows = new Map([...t.store.accounts.rows].reverse());
  };
  const OLD = "2026-01-01T00:00:00.000Z"; const NEW = "2026-06-01T00:00:00.000Z";
  const LOW = "00000000-0000-4000-8000-000000000001"; const HIGH = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const MID = "88888888-8888-4888-8888-888888888888";

  async function snapshot(t: ReturnType<typeof makeTestDeps>, workspaceId: string) {
    const accounts = await t.deps.uow.repos.accounts.list(workspaceId);
    const people = await Promise.all(accounts.map((a) => t.deps.uow.repos.people.list({ workspaceId, accountId: a.id })));
    const handoffs = await Promise.all(accounts.map((a) => t.deps.uow.repos.handoffs.list({ workspaceId, accountId: a.id })));
    return { accounts: accounts.length, profiles: t.store.adscaleProfiles.rows.size, threads: t.store.assistantThreads.rows.size,
      people: people.flat().length, handoffs: handoffs.flat().length };
  }

  it("the OLDEST account wins even when a newer account has the smaller UUID, in either Map order", async () => {
    for (const newerFirst of [true, false]) {
      const t = makeTestDeps();
      const workspaceId = uuid(); const userId = seedMember(t, workspaceId);
      if (newerFirst) { await seedAccount(t, workspaceId, { id: LOW, createdAt: NEW }); await seedAccount(t, workspaceId, { id: HIGH, createdAt: OLD }); }
      else { await seedAccount(t, workspaceId, { id: HIGH, createdAt: OLD }); await seedAccount(t, workspaceId, { id: LOW, createdAt: NEW }); }
      const outcome = await open(t, workspaceId, userId);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.accountId).toBe(HIGH);
      expect(outcome.value.data).toMatchObject({ created: false });
    }
  });

  it("a createdAt tie is resolved by the smaller account UUID, in either Map order", async () => {
    for (const lowFirst of [true, false]) {
      const t = makeTestDeps();
      const workspaceId = uuid(); const userId = seedMember(t, workspaceId);
      await seedAccount(t, workspaceId, { id: MID, createdAt: OLD });
      const order = lowFirst ? [LOW, HIGH] : [HIGH, LOW];
      for (const id of order) await seedAccount(t, workspaceId, { id, createdAt: OLD });
      const outcome = await open(t, workspaceId, userId);
      expect(outcome.ok && outcome.value.accountId).toBe(LOW);
    }
  });

  it("reversing repository/Map order between reopenings keeps account and thread and creates nothing extra", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid(); const userId = seedMember(t, workspaceId);
    await seedAccount(t, workspaceId, { id: HIGH, createdAt: OLD });
    await seedAccount(t, workspaceId, { id: LOW, createdAt: NEW });
    await seedAccount(t, workspaceId, { id: MID, createdAt: NEW });
    const first = await open(t, workspaceId, userId);
    if (!first.ok) throw new Error(first.error.code);
    const before = await snapshot(t, workspaceId);
    const threadsBefore = await t.deps.uow.repos.threads.list({ workspaceId, accountId: first.value.accountId! });
    for (let i = 0; i < 3; i += 1) {
      reverseAccountOrder(t);
      const again = await open(t, workspaceId, userId);
      expect(again.ok && again.value.accountId).toBe(HIGH);
      expect(again.ok && again.value.data).toMatchObject({ created: false });
    }
    expect(await snapshot(t, workspaceId)).toEqual(before);
    expect(await t.deps.uow.repos.threads.list({ workspaceId, accountId: first.value.accountId! })).toEqual(threadsBefore);
    expect(before.accounts).toBe(3);
    expect(before.people).toBe(0);
    expect(before.handoffs).toBe(0);
  });

  it("converting the selected account free → paid never switches the entry account", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid(); const userId = seedMember(t, workspaceId);
    const opened = await open(t, workspaceId, userId);
    if (!opened.ok) throw new Error(opened.error.code);
    const freeId = opened.value.accountId!;
    // A later account with a smaller UUID appears (e.g. a second brand).
    await seedAccount(t, workspaceId, { id: LOW, createdAt: "2099-01-01T00:00:00.000Z", status: "free" });
    const withSecond = await open(t, workspaceId, userId);
    expect(withSecond.ok && withSecond.value.accountId).toBe(freeId);
    const before = await snapshot(t, workspaceId);
    for (const status of ["deploying", "active"] as const) {
      t.store.accounts.rows.get(freeId)!.status = status;
      reverseAccountOrder(t);
      const again = await open(t, workspaceId, userId);
      expect(again.ok && again.value.accountId).toBe(freeId);
      expect(again.ok && again.value.data).toMatchObject({ created: false });
    }
    expect(await snapshot(t, workspaceId)).toEqual(before);
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

describe("bootstrap approver is the verified workspace OWNER", () => {
  const peopleOf = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, accountId: string) =>
    t.deps.uow.repos.people.list({ workspaceId, accountId });
  const snapshot = async (t: ReturnType<typeof makeTestDeps>, workspaceId: string) => ({
    accounts: (await t.deps.uow.repos.accounts.list(workspaceId)).length,
    profiles: t.store.adscaleProfiles.rows.size,
    threads: t.store.assistantThreads.rows.size,
  });

  it("a guest or admin opening first does NOT become approver: the owner does, the opener is a member", async () => {
    for (const role of ["member", "admin"]) {
      const t = makeTestDeps();
      const workspaceId = uuid();
      const ownerId = seedMember(t, workspaceId, { name: "Dona", email: "dona@x.com", role: "owner" });
      const openerId = seedMember(t, workspaceId, { name: "Convidado", email: "guest@x.com", role });
      const out = await open(t, workspaceId, openerId);
      expect(out.ok, role).toBe(true);
      if (!out.ok) return;
      const people = await peopleOf(t, workspaceId, out.value.accountId!);
      expect(people).toHaveLength(2);
      expect(people.find((p) => p.role === "approver")).toMatchObject({ userId: ownerId, name: "Dona", email: "dona@x.com" });
      expect(people.filter((p) => p.role === "approver")).toHaveLength(1);
      expect(people.find((p) => p.userId === openerId)).toMatchObject({ role: "member" });
      // Permissions follow the stored role: the opener cannot approve or confirm a business fact.
      const actorOf = (r: "approver" | "member") => ({ kind: "client_person" as const, role: r, personId: people.find((p) => p.role === r)!.id });
      for (const action of ["approve_item", "confirm_business_fact"] as const) {
        expect(authorize(actorOf("member"), action).ok, `${role} ${action}`).toBe(false);
        expect(authorize(actorOf("approver"), action).ok, `owner ${action}`).toBe(true);
      }
    }
  });

  it("the owner opening first is the only person; a guest replay or later adoption creates no people", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const ownerId = seedMember(t, workspaceId, { role: "owner" });
    const guestId = seedMember(t, workspaceId, { role: "member" });
    const first = await open(t, workspaceId, ownerId);
    if (!first.ok) throw new Error(first.error.code);
    const accountId = first.value.accountId!;
    expect(await peopleOf(t, workspaceId, accountId)).toEqual([expect.objectContaining({ userId: ownerId, role: "approver" })]);
    const adopted = await open(t, workspaceId, guestId);
    expect(adopted.ok && adopted.value.accountId).toBe(accountId);
    expect(adopted.ok && adopted.value.data).toMatchObject({ created: false });
    expect(await peopleOf(t, workspaceId, accountId)).toHaveLength(1);
    const again = await open(t, workspaceId, ownerId);
    expect(again.ok && again.value.data).toMatchObject({ created: false });
    expect(await peopleOf(t, workspaceId, accountId)).toHaveLength(1);
  });

  it("guest-first then the opener replays: still exactly 2 people, approver unchanged", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const ownerId = seedMember(t, workspaceId, { role: "owner" });
    const guestId = seedMember(t, workspaceId, { role: "member" });
    const first = await open(t, workspaceId, guestId);
    if (!first.ok) throw new Error(first.error.code);
    for (let i = 0; i < 3; i += 1) {
      const replay = await open(t, workspaceId, guestId);
      expect(replay.ok && replay.value.data).toMatchObject({ created: false });
    }
    const people = await peopleOf(t, workspaceId, first.value.accountId!);
    expect(people).toHaveLength(2);
    expect(people.find((p) => p.role === "approver")?.userId).toBe(ownerId);
  });

  it("an owner of ANOTHER workspace does not serve: refused before any write", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    seedMember(t, uuid(), { role: "owner" });                      // other workspace
    const guestId = seedMember(t, workspaceId, { role: "member" });
    const out = await open(t, workspaceId, guestId);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("forbidden_actor");
    expect(await snapshot(t, workspaceId)).toEqual({ accounts: 0, profiles: 0, threads: 0 });
  });

  it("no owner, or only an UNVERIFIED owner, closes before any write (even for a verified opener)", async () => {
    for (const ownerRows of [[], [{ verified: false }]]) {
      const t = makeTestDeps();
      const workspaceId = uuid();
      for (const row of ownerRows) seedMember(t, workspaceId, { role: "owner", verified: row.verified });
      const openerId = seedMember(t, workspaceId, { role: "admin" });
      const out = await open(t, workspaceId, openerId);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("forbidden_actor");
      expect(await snapshot(t, workspaceId)).toEqual({ accounts: 0, profiles: 0, threads: 0 });
      expect(t.store.adscaleProfiles.rows.size).toBe(0);
    }
  });

  it("picks the OLDEST verified owner (createdAt ASC, id ASC); unverified owners are skipped before ordering", async () => {
    const OLD = new Date("2025-01-01T00:00:00.000Z"); const NEW = new Date("2026-01-01T00:00:00.000Z");
    const cases: Array<{ name: string; rows: Array<{ label: string; createdAt: Date; id: string; verified?: boolean }>; expected: string }> = [
      { name: "older wins", expected: "old", rows: [
        { label: "new", createdAt: NEW, id: "00000000-0000-4000-8000-000000000001" },
        { label: "old", createdAt: OLD, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] },
      { name: "createdAt tie → smaller member id", expected: "low", rows: [
        { label: "high", createdAt: OLD, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        { label: "low", createdAt: OLD, id: "00000000-0000-4000-8000-000000000001" }] },
      { name: "older unverified, newer verified → newer", expected: "verified", rows: [
        { label: "unverified", createdAt: OLD, id: "00000000-0000-4000-8000-000000000001", verified: false },
        { label: "verified", createdAt: NEW, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] },
    ];
    for (const c of cases) {
      for (const reversed of [false, true]) {
        const t = makeTestDeps();
        const workspaceId = uuid();
        const users: Record<string, string> = {};
        for (const row of reversed ? [...c.rows].reverse() : c.rows) {
          users[row.label] = seedMember(t, workspaceId, { role: "owner", createdAt: row.createdAt, id: row.id, verified: row.verified ?? true, name: row.label });
        }
        const guestId = seedMember(t, workspaceId, { role: "member", createdAt: new Date("2027-01-01T00:00:00.000Z") });
        const out = await open(t, workspaceId, guestId);
        expect(out.ok, c.name).toBe(true);
        if (!out.ok) return;
        const approver = (await peopleOf(t, workspaceId, out.value.accountId!)).find((p) => p.role === "approver");
        expect(approver?.userId, `${c.name} reversed=${reversed}`).toBe(users[c.expected]);
      }
    }
  });

  it("an existing PAID account stays intact (no owner required, no people, no approver change)", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, "Paga");
    const paid = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id });
    const guestId = seedMember(t, workspaceId, { role: "member" });
    const out = await open(t, workspaceId, guestId);
    expect(out.ok && out.value.accountId).toBe(paid.id);
    expect(out.ok && out.value.data).toMatchObject({ created: false });
    expect(await peopleOf(t, workspaceId, paid.id)).toEqual([]);
    expect((await t.deps.uow.repos.accounts.get(workspaceId, paid.id))?.status).toBe("deploying");
  });
});

describe("open_free_account for a brand (spec 2026-10-07 §3)", () => {
  const openBrand = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, userId: string, clientProfileId: string) =>
    executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId, clientProfileId } });

  it("in a paying workspace, enters a brand with a Brand Kit directly: identity confirmed by import, a new conversation, the greeting instead of the opening line", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [entry, brand] = [uuid(), uuid()];
    t.gateway.addProfile({ id: entry, workspaceId, name: "Minha marca" });
    t.gateway.addProfile({ id: brand, workspaceId, name: "CENBRAP", logoAssetKey: "logos/cenbrap.png", brandColors: ["#123456"], brandFonts: ["Inter"] });
    t.store.assistantThreads.rows.set("old-classic", { id: "old-classic", workspaceId, clientProfileId: brand, campaignId: null });
    // The workspace opened its entry brand on the free plan, and pays now.
    expect((await openBrand(t, workspaceId, userId, entry)).ok).toBe(true);
    t.deps.hasClassicPaidAccess = async () => true;
    const messagesBefore = t.store.assistantMessages.rows.size;

    const opened = await openBrand(t, workspaceId, userId, brand);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data).toMatchObject({ created: true, imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.accounts.get(workspaceId, scope.accountId)).toMatchObject({ clientProfileId: brand, status: "free" });
    const [handoff] = await t.deps.uow.repos.handoffs.list(scope);
    expect(handoff).toMatchObject({ step: "done", readingId: null });
    expect(handoff!.decisions).toMatchObject({
      imported: true,
      identity: { name: { value: "CENBRAP", origin: "user" }, logo: { key: "logos/cenbrap.png" }, colors: [{ value: "#123456" }], fonts: [{ value: "Inter" }] },
    });
    expect(opened.value.data).not.toMatchObject({ assistantThreadId: "old-classic" });
    expect(await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(0);
    // No opening line and no handoff card: the conversation opens with the Strategist's greeting alone (task 16).
    const added = [...t.store.assistantMessages.rows.values()].slice(messagesBefore);
    expect(added.map((message) => [message.threadId, message.type, message.payload])).toEqual([
      [opened.value.data!.assistantThreadId, "assistant", { handoffStep: "imported", brandName: "CENBRAP" }],
    ]);
  });

  it("on the free plan, sends a brand with a Brand Kit through the handoff: the reading and the diagnosis are what the plan offers", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "CENBRAP", logoAssetKey: "logos/cenbrap.png", brandColors: ["#123456"] });
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.value.data).not.toMatchObject({ imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: brand })]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(1);
  });

  it("gives a workspace whose free account was closed that account back, whatever the brand, never a new one", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [a, b] = [uuid(), uuid()];
    t.gateway.addProfile({ id: a, workspaceId, name: "A" });
    t.gateway.addProfile({ id: b, workspaceId, name: "B" });
    const first = await openBrand(t, workspaceId, userId, a);
    if (!first.ok) throw new Error(first.error.code);
    await t.deps.uow.repos.accounts.update(workspaceId, first.value.accountId!, { status: "closed" } as never);
    const other = await openBrand(t, workspaceId, userId, b);
    if (!other.ok) throw new Error(other.error.code);
    expect(other.value.accountId).toBe(first.value.accountId);
    expect(other.value.data).toMatchObject({ created: false });
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(1);
  });

  it("sends a brand without an identity (a new one) through the handoff from the start", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "Nova marca" });
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: brand })]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(1);
    expect(t.store.adscaleProfiles.rows.size).toBe(0); // no "Minha marca" was created
  });

  /** A workspace that pays: the entry brand opened on the free plan, then the classic access became paid. */
  async function payingWorkspace() {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const entry = uuid();
    t.gateway.addProfile({ id: entry, workspaceId, name: "Minha marca" });
    expect((await openBrand(t, workspaceId, userId, entry)).ok).toBe(true);
    t.deps.hasClassicPaidAccess = async () => true;
    return { t, workspaceId, userId };
  }

  it("in a paying workspace, sends a brand with no logo and no colors (fonts only) through the handoff from the start, never by import", async () => {
    const { t, workspaceId, userId } = await payingWorkspace();
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "So fontes", brandFonts: ["Inter"] });
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.value.data).toMatchObject({ created: true });
    expect(opened.value.data).not.toMatchObject({ imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: brand })]);
    expect((await t.deps.uow.repos.handoffs.list(scope))[0]!.decisions).not.toHaveProperty("imported");
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT })).toHaveLength(0);
  });

  it("in a paying workspace, a brand with only a logo (no colors) is imported too", async () => {
    const { t, workspaceId, userId } = await payingWorkspace();
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "So logo", logoAssetKey: "logos/so-logo.png" });
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.value.data).toMatchObject({ created: true, imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "done" })]);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT })).toHaveLength(1);
  });

  describe("a new account of an existing brand starts a fresh main conversation: the brand's old classic thread is not taken over", () => {
    const seedClassicThread = (t: ReturnType<typeof makeTestDeps>, workspaceId: string, clientProfileId: string) => {
      t.store.assistantThreads.rows.set("old-classic", { id: "old-classic", workspaceId, clientProfileId, campaignId: null });
      t.store.assistantMessages.rows.set("old-message", { id: "old-message", workspaceId, threadId: "old-classic", type: "user", content: "Oi", payload: {} } as never);
    };
    const expectFreshStart = (t: ReturnType<typeof makeTestDeps>, assistantThreadId: unknown) => {
      expect(assistantThreadId).toEqual(expect.any(String));
      expect(assistantThreadId).not.toBe("old-classic");
      const added = [...t.store.assistantMessages.rows.values()].filter((message) => message.id !== "old-message");
      expect(added.map((message) => [message.threadId, message.type, message.payload])).toEqual([
        [assistantThreadId, "assistant", { handoffStep: "intro" }],
        [assistantThreadId, "equipe_card", expect.objectContaining({ kind: "handoff", step: "source" })],
      ]);
    };

    it("on the free plan, an existing brand opens with the opening line and the handoff card in a new conversation", async () => {
      const t = makeTestDeps();
      const workspaceId = uuid();
      const userId = seedMember(t, workspaceId);
      const brand = uuid();
      t.gateway.addProfile({ id: brand, workspaceId, name: "Marca antiga" });
      seedClassicThread(t, workspaceId, brand);
      const opened = await openBrand(t, workspaceId, userId, brand);
      if (!opened.ok) throw new Error(opened.error.code);
      const scope = { workspaceId, accountId: opened.value.accountId! };
      expect(await t.deps.uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: brand })]);
      expectFreshStart(t, opened.value.data!.assistantThreadId);
    });

    it("in a paying workspace, a brand without an identity opens through the handoff in a new conversation", async () => {
      const { t, workspaceId, userId } = await payingWorkspace();
      const brand = uuid();
      t.gateway.addProfile({ id: brand, workspaceId, name: "Sem identidade" });
      seedClassicThread(t, workspaceId, brand);
      const messagesBefore = t.store.assistantMessages.rows.size;
      const opened = await openBrand(t, workspaceId, userId, brand);
      if (!opened.ok) throw new Error(opened.error.code);
      expect(opened.value.data!.assistantThreadId).not.toBe("old-classic");
      const added = [...t.store.assistantMessages.rows.values()].slice(messagesBefore);
      expect(added.map((message) => [message.threadId, message.type])).toEqual([
        [opened.value.data!.assistantThreadId, "assistant"], [opened.value.data!.assistantThreadId, "equipe_card"],
      ]);
    });
  });

  it("gives each brand its own account and returns it on the next visit", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [a, b] = [uuid(), uuid()];
    t.gateway.addProfile({ id: a, workspaceId, name: "A", brandColors: ["#111111"] });
    t.gateway.addProfile({ id: b, workspaceId, name: "B", brandColors: ["#222222"] });
    // The first brand opens while the workspace is on the free plan; once the workspace pays, a second brand may open.
    const first = await openBrand(t, workspaceId, userId, a);
    t.deps.hasClassicPaidAccess = async () => true;
    const second = await openBrand(t, workspaceId, userId, b);
    const again = await openBrand(t, workspaceId, userId, a);
    if (!first.ok || !second.ok || !again.ok) throw new Error("open failed");
    expect(second.value.accountId).not.toBe(first.value.accountId);
    // Brand b has only colors (no logo) and the workspace pays now: the colors alone are a Brand Kit, so it imports.
    expect(second.value.data).toMatchObject({ created: true, imported: true });
    expect(first.value.data).not.toMatchObject({ imported: true });
    expect(again.value.accountId).toBe(first.value.accountId);
    expect(again.value.data).toMatchObject({ created: false });
    expect(again.value.data).not.toMatchObject({ imported: true });
  });

  it("keeps the free plan on one brand: another one asks for the plan", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const [a, b] = [uuid(), uuid()];
    t.gateway.addProfile({ id: a, workspaceId, name: "A" });
    t.gateway.addProfile({ id: b, workspaceId, name: "B" });
    expect((await openBrand(t, workspaceId, userId, a)).ok).toBe(true);
    const refused = await openBrand(t, workspaceId, userId, b);
    expect(!refused.ok && refused.error.code).toBe("requires_plan");
  });

  it("refuses a brand of another workspace", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedMember(t, workspaceId);
    const foreign = uuid();
    t.gateway.addProfile({ id: foreign, workspaceId: uuid(), name: "Outra" });
    const refused = await openBrand(t, workspaceId, userId, foreign);
    expect(!refused.ok && refused.error.code).toBe("unknown_client_profile");
  });
});
