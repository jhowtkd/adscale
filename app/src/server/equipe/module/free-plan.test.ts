// The free plan's single rule (ticket 11, part 2), over the in-memory Equipe store and a fake classic-access reader. It is
// decided per workspace and fails closed:
//   pilot off -> null (no read); any paid Equipe account -> null; an active paid access -> null (even with a free account:
//   a payer that got one before the home stopped opening it stays paid); a free account -> its id; only closed accounts ->
//   { accountId: null, closedAccountId }; no account -> { accountId: null }.
// The SQL has its own suite (free-plan.pg.test.ts); what "active paid access" is has its own (billing/access).
import { describe, expect, it, vi } from "vitest";
import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork, type EquipeAccount } from "../data";
import { accountOnFreePlan, accountsFromRepository, findFreePlanAccount, freePlanLimitsApply, usesEquipeProduct, type FreePlanReaders } from "./free-plan";

vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../billing/access", () => ({ workspaceHasActivePaidAccess: vi.fn() }));

const PILOT_ON = { enabledRaw: "true", allowlistRaw: "*" } as const;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";

function fixture(paidAccess = false) {
  const store = createMemoryEquipeStore();
  const { repos } = createMemoryEquipeUnitOfWork(store);
  const hasActivePaidAccess = vi.fn(async () => paidAccess);
  const readAccounts = vi.fn(accountsFromRepository(repos.accounts));
  const readers: FreePlanReaders = { readAccounts, hasActivePaidAccess };
  const open = (workspaceId: string, status: string) =>
    repos.accounts.create(workspaceId, { clientProfileId: crypto.randomUUID(), status: status as never });
  return { readers, readAccounts, hasActivePaidAccess, open };
}

describe("findFreePlanAccount", () => {
  it("answers null WITHOUT reading anything while the pilot is off (no query for a classic workspace)", async () => {
    const { readers, readAccounts, hasActivePaidAccess } = fixture();

    expect(await findFreePlanAccount(WORKSPACE, readers, { enabledRaw: "false", allowlistRaw: "*" })).toBeNull();
    expect(await findFreePlanAccount(WORKSPACE, readers, { enabledRaw: undefined, allowlistRaw: "*" })).toBeNull();
    // Pilot on, but not for this workspace.
    expect(await findFreePlanAccount(WORKSPACE, readers, { enabledRaw: "true", allowlistRaw: OTHER_WORKSPACE })).toBeNull();
    expect(await findFreePlanAccount(WORKSPACE, readers, { enabledRaw: "true", allowlistRaw: "" })).toBeNull();
    expect(readAccounts).not.toHaveBeenCalled();
    expect(hasActivePaidAccess).not.toHaveBeenCalled();
  });

  describe("a free account", () => {
    it("is the free plan, with its id, when the workspace has no active paid access (asked after the paid Equipe accounts)", async () => {
      const { readers, open, hasActivePaidAccess } = fixture(false);
      const account = await open(WORKSPACE, "free");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: account.id });
      expect(hasActivePaidAccess).toHaveBeenCalledWith(WORKSPACE);
    });

    it("is NOT the free plan for a classic payer that got a free account before the fix (an active paid access wins over it)", async () => {
      const { readers, open } = fixture(true);
      await open(WORKSPACE, "free");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
    });

    it("stays the free plan next to a closed account, and a free account never carries a closedAccountId", async () => {
      const { readers, open } = fixture();
      await open(WORKSPACE, "closed");
      const free = await open(WORKSPACE, "free");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: free.id });
    });

    it("with several free accounts is the oldest one", async () => {
      const { readers, open } = fixture();
      const first = await open(WORKSPACE, "free");
      await open(WORKSPACE, "free");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: first.id });
    });
  });

  describe("a paid account anywhere in the workspace (per workspace, not per entry)", () => {
    it.each(["deploying", "paused", "calibrating", "active", "suspended"])("%s is not the free plan", async (status) => {
      const { readers, open, hasActivePaidAccess } = fixture();
      await open(WORKSPACE, status);

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
      expect(hasActivePaidAccess).not.toHaveBeenCalled();
    });

    it("A free and then B paid: not free (a free account does not block the paid one)", async () => {
      const { readers, open } = fixture();
      await open(WORKSPACE, "free");
      await open(WORKSPACE, "active");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
    });

    it("A paid and then B free: not free either (a paid entry does not open the product to a free one)", async () => {
      const { readers, open } = fixture();
      await open(WORKSPACE, "active");
      await open(WORKSPACE, "free");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
    });

    it("converting the free entry to paid lifts the free plan; opening a new paid account lifts it too", async () => {
      const store = createMemoryEquipeStore();
      const { repos } = createMemoryEquipeUnitOfWork(store);
      const readers: FreePlanReaders = { readAccounts: accountsFromRepository(repos.accounts), hasActivePaidAccess: async () => false };
      const entry = await repos.accounts.create(WORKSPACE, { clientProfileId: crypto.randomUUID(), status: "free" as never });
      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: entry.id });

      await repos.accounts.update(WORKSPACE, entry.id, { status: "deploying" as never });
      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
    });
  });

  describe("no free account: no Equipe account yet (a sign-up that never opened the home), or only closed ones", () => {
    it("no account at all is the free plan with no account id and no closedAccountId when the workspace has no active paid access", async () => {
      const { readers, hasActivePaidAccess } = fixture(false);

      const plan = await findFreePlanAccount(WORKSPACE, readers, PILOT_ON);

      expect(plan).toEqual({ accountId: null });
      expect(plan).not.toHaveProperty("closedAccountId");
      expect(hasActivePaidAccess).toHaveBeenCalledTimes(1);
      expect(hasActivePaidAccess).toHaveBeenCalledWith(WORKSPACE);
    });

    it("only closed accounts: the free plan with the MOST RECENT closed account as closedAccountId (the way to a person: the conversation does not reopen for it)", async () => {
      const { readers, open } = fixture(false);
      await open(WORKSPACE, "closed");
      const latest = await open(WORKSPACE, "closed");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: null, closedAccountId: latest.id });
    });

    it("with an active paid access it is not the free plan, with no account, with only closed ones, or with a free one", async () => {
      const { readers, open } = fixture(true);

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
      await open(WORKSPACE, "closed");
      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toBeNull();
    });

    it("only reads the accounts of its own workspace", async () => {
      const { readers, open } = fixture(false);
      await open(OTHER_WORKSPACE, "active");

      expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: null });
      expect(await findFreePlanAccount(OTHER_WORKSPACE, readers, PILOT_ON)).toBeNull();
    });
  });

  it("fails closed: a reader that throws propagates (the caller gets an error, never a 'not free')", async () => {
    const readers: FreePlanReaders = { readAccounts: async () => { throw new Error("db down"); }, hasActivePaidAccess: async () => true };

    await expect(findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).rejects.toThrow("db down");
    const noAccounts: FreePlanReaders = { readAccounts: async () => [], hasActivePaidAccess: async () => { throw new Error("db down"); } };
    await expect(findFreePlanAccount(WORKSPACE, noAccounts, PILOT_ON)).rejects.toThrow("db down");
  });
});

// Review R1: the pilot's product (the conversation home, its shell and its chat rules) is not for a classic payer with no
// live Equipe account, so opening the home never turns a paid workspace into the free plan.
describe("usesEquipeProduct", () => {
  it("pilot off: false, and nothing is read", async () => {
    const { readers, readAccounts, hasActivePaidAccess } = fixture();

    expect(await usesEquipeProduct(WORKSPACE, readers, { enabledRaw: "false", allowlistRaw: "*" })).toBe(false);
    expect(readAccounts).not.toHaveBeenCalled();
    expect(hasActivePaidAccess).not.toHaveBeenCalled();
  });

  it.each(["free", "deploying", "paused", "calibrating", "active", "suspended"])("any live account (%s): true, even for a payer, and the paid access is not asked", async (status) => {
    const { readers, open, hasActivePaidAccess } = fixture(true);
    await open(WORKSPACE, status);

    expect(await usesEquipeProduct(WORKSPACE, readers, PILOT_ON)).toBe(true);
    expect(hasActivePaidAccess).not.toHaveBeenCalled();
  });

  it("no account: true for a sign-up (no active paid access) and false for a classic payer", async () => {
    expect(await usesEquipeProduct(WORKSPACE, fixture(false).readers, PILOT_ON)).toBe(true);
    expect(await usesEquipeProduct(WORKSPACE, fixture(true).readers, PILOT_ON)).toBe(false);
  });

  it("only closed accounts: true for a sign-up and false for a payer (a closed account is not a live one)", async () => {
    const signUp = fixture(false);
    await signUp.open(WORKSPACE, "closed");
    const payer = fixture(true);
    await payer.open(WORKSPACE, "closed");

    expect(await usesEquipeProduct(WORKSPACE, signUp.readers, PILOT_ON)).toBe(true);
    expect(await usesEquipeProduct(WORKSPACE, payer.readers, PILOT_ON)).toBe(false);
  });

  it("fails closed: a reader that throws propagates", async () => {
    const readers: FreePlanReaders = { readAccounts: async () => { throw new Error("db down"); }, hasActivePaidAccess: async () => true };

    await expect(usesEquipeProduct(WORKSPACE, readers, PILOT_ON)).rejects.toThrow("db down");
  });
});

describe("accountsFromRepository", () => {
  const row = (id: string, createdAt: string, status = "free") =>
    ({ id, status, createdAt: new Date(createdAt) }) as unknown as EquipeAccount;
  const over = (rows: EquipeAccount[]) => accountsFromRepository({ list: async () => rows });

  it("lists oldest first by created_at, whatever the repository's order", async () => {
    const accounts = await over([row("b", "2026-01-03T00:00:00Z"), row("c", "2026-01-01T00:00:00Z"), row("a", "2026-01-02T00:00:00Z")])(WORKSPACE);

    expect(accounts.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("breaks a created_at tie by id and does not reorder the repository's own array", async () => {
    const same = "2026-01-01T00:00:00.000Z";
    const rows = [row("b-1", same, "active"), row("a-1", same)];

    expect((await over(rows)(WORKSPACE)).map((a) => a.id)).toEqual(["a-1", "b-1"]);
    expect(rows.map((r) => r.id)).toEqual(["b-1", "a-1"]);
  });

  it("the oldest free account is the one the plan names, even with a tie", async () => {
    const same = "2026-01-01T00:00:00.000Z";
    const readers: FreePlanReaders = { readAccounts: over([row("b-1", same), row("a-1", same)]), hasActivePaidAccess: async () => false };

    expect(await findFreePlanAccount(WORKSPACE, readers, PILOT_ON)).toEqual({ accountId: "a-1" });
  });
});

describe("freePlanLimitsApply (spec 2026-10-07 §3)", () => {
  it("binds a free account while its workspace does not pay, with no pilot gate", async () => {
    const f = fixture();
    const free = await f.open(WORKSPACE, "free");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(true);
  });

  it("is lifted by a classic paid access", async () => {
    const f = fixture(true);
    const free = await f.open(WORKSPACE, "free");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(false);
  });

  it("is lifted by a paid account of another brand of the same workspace, never of another workspace", async () => {
    const f = fixture();
    const free = await f.open(WORKSPACE, "free");
    await f.open(OTHER_WORKSPACE, "active");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(true);
    await f.open(WORKSPACE, "active");
    expect(await freePlanLimitsApply(free, WORKSPACE, f.readers)).toBe(false);
  });

  it("never binds an account that is not free, and reads nothing for it", async () => {
    const f = fixture();
    const paid = await f.open(WORKSPACE, "active");
    expect(await freePlanLimitsApply(paid, WORKSPACE, f.readers)).toBe(false);
    expect(await freePlanLimitsApply(null, WORKSPACE, f.readers)).toBe(false);
    expect(f.readAccounts).not.toHaveBeenCalled();
    expect(f.hasActivePaidAccess).not.toHaveBeenCalled();
  });
});

describe("accountOnFreePlan (spec 2026-10-07 §3)", () => {
  it("reads the account and its workspace through the module; without the classic port the workspace does not pay", async () => {
    const uow = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    const account = await uow.repos.accounts.create(WORKSPACE, { clientProfileId: crypto.randomUUID(), status: "free" as never });
    const scope = { workspaceId: WORKSPACE, accountId: account.id };
    expect(await accountOnFreePlan({ uow }, scope)).toBe(true);
    expect(await accountOnFreePlan({ uow, hasClassicPaidAccess: async () => true }, scope)).toBe(false);
  });
});
