import { describe, expect, it } from "vitest";
import { executeCommand, FREE_ACCOUNT_COMMANDS } from "./commands";
import { commandSchema } from "./envelope";
import { authorize } from "../domain";
import { makeTestDeps, seedStaff, testActors, uuid } from "./testing/deps";
import { requestTask } from "./task-outbox";
import { transact } from "./shared";

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
