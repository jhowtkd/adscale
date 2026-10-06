/**
 * The free plan's rule (ticket 11, part 2) against REAL Postgres: the accounts read of one workspace (ordering, filter by
 * workspace), and `workspaceHasActivePaidAccess` (what keeps a workspace WITHOUT an Equipe account on the classic
 * product): the latest Stripe subscription active or past_due, a tester entitlement in force, a platform owner among
 * the members; and NOT the sign-up trial, a beta allowance, or a Stripe subscription trialing/canceled.
 * The module reads through the global `db`, so DATABASE_URL is routed to the test database before it is imported. The
 * database is shared: every assertion is about the workspaces created here, and they are deleted at the end (accounts,
 * profiles, subscriptions and entitlements go by cascade).
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/free-plan.pg.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
// The pilot on for every workspace, as the production switch `*`: the real call sites (`shouldAnalyzeWorkspaceAssets`) pass no overrides.
if (TEST_DATABASE_URL) {
  process.env.EQUIPE_ENABLED = "true";
  process.env.EQUIPE_PILOT_WORKSPACES = "*";
}
const ENABLED = TEST_DATABASE_URL !== null;
const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, plan, access, schema, equipeSchema, assets] = await Promise.all([
    import("./testing/free-pg"), import("./free-plan"), import("../../billing/access"),
    import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("../handoff/assets"),
  ]);
  return { free, plan, access, schema, equipeSchema, assets };
}

describe.skipIf(!ENABLED)("the free plan's rule (pg)", () => {
  let m: Mods;
  let h: ReturnType<Mods["free"]["openPool"]>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const emails = new Map<string, string>();
  const savedOwners = process.env.PLATFORM_OWNER_EMAILS;
  let seq = 0;

  async function workspace() {
    const seeded = await m.free.seedWorkspace(h);
    workspaceIds.push(seeded.workspaceId);
    userIds.push(seeded.userId);
    emails.set(seeded.workspaceId, `${seeded.tag}@example.com`);
    return seeded.workspaceId;
  }

  async function account(workspaceId: string, status: string, createdAt: string, id?: string) {
    const [profile] = await h.db.insert(m.schema.clientProfiles).values({ workspaceId, name: `Marca ${status}` }).returning();
    const [row] = await h.db.insert(m.equipeSchema.equipeAccounts)
      .values({ ...(id ? { id } : {}), workspaceId, clientProfileId: profile!.id, status, createdAt: new Date(createdAt) })
      .returning();
    return row!;
  }

  async function subscription(workspaceId: string, status: string, updatedAt = new Date(), extra: { customer?: string; periodEnd?: Date | null } = {}) {
    seq += 1;
    await h.db.insert(m.schema.subscriptions).values({
      workspaceId, stripeSubscriptionId: `sub_t11_${Date.now()}_${seq}`, stripeCustomerId: extra.customer ?? `cus_t11_${seq}`,
      status, planKey: "starter", priceId: "price_t11", updatedAt, currentPeriodEnd: extra.periodEnd ?? null,
    });
  }

  /** An `invoice.paid` (or another type) event as the webhook recorded it. */
  async function stripeEvent(customer: string, amountPaid: number | null, type = "invoice.paid") {
    seq += 1;
    await h.db.insert(m.schema.processedStripeEvents).values({
      stripeEventId: `evt_t11_${Date.now()}_${seq}`, type,
      payload: { data: { object: { customer, ...(amountPaid === null ? {} : { amount_paid: amountPaid }) } } },
    });
  }

  async function entitlement(workspaceId: string, kind: string, status = "active", expiresAt: Date | null = null) {
    await h.db.insert(m.schema.workspaceEntitlements).values({ workspaceId, kind, status, expiresAt });
  }

  const rule = (workspaceId: string) => m.plan.findFreePlanAccount(workspaceId, undefined, GATE);

  beforeAll(async () => {
    m = await load();
    (m.free.assertTestDatabase as (url: string | null) => void)(TEST_DATABASE_URL);
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
  }, 60_000);
  afterEach(() => {
    if (savedOwners === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = savedOwners;
  });
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.pool.end();
  }, 60_000);

  describe("readWorkspaceAccountsFromDb", () => {
    it("a workspace without accounts reads none", async () => {
      expect(await m.plan.readWorkspaceAccountsFromDb(await workspace())).toEqual([]);
    });

    it("reads the workspace's accounts oldest first by created_at, whatever the insertion order", async () => {
      const ws = await workspace();
      const newest = await account(ws, "active", "2026-03-01T00:00:00Z");
      const oldest = await account(ws, "free", "2026-01-01T00:00:00Z");
      const middle = await account(ws, "closed", "2026-02-01T00:00:00Z");

      const rows = await m.plan.readWorkspaceAccountsFromDb(ws);

      expect(rows.map((r) => [r.id, r.status])).toEqual([[oldest.id, "free"], [middle.id, "closed"], [newest.id, "active"]]);
    });

    it("breaks a created_at tie by id (two random ids, ordered here)", async () => {
      const ws = await workspace();
      const [low, high] = [crypto.randomUUID(), crypto.randomUUID()].sort();
      const same = "2026-01-01T00:00:00.000Z";
      await account(ws, "active", same, high);
      await account(ws, "free", same, low);

      expect((await m.plan.readWorkspaceAccountsFromDb(ws)).map((r) => r.id)).toEqual([low, high]);
    });

    it("only reads the workspace's own accounts", async () => {
      const mine = await workspace();
      const other = await workspace();
      await account(other, "free", "2025-01-01T00:00:00Z");
      const own = await account(mine, "active", "2026-01-01T00:00:00Z");

      expect((await m.plan.readWorkspaceAccountsFromDb(mine)).map((r) => r.id)).toEqual([own.id]);
    });
  });

  describe("workspaceHasActivePaidAccess", () => {
    it.each([["active", true], ["trialing", false], ["canceled", false], ["checkout_completed", false], ["incomplete", false]])(
      "the latest Stripe subscription %s -> %s",
      async (status, expected) => {
        const ws = await workspace();
        await subscription(ws, status);

        expect(await m.access.workspaceHasActivePaidAccess(ws)).toBe(expected);
      },
    );

    // Review (past_due): a late renewal is a payer only while the customer already paid real money and the period ended at most 7 days ago.
    describe("a past_due subscription", () => {
      const DAY = 24 * 60 * 60 * 1000;
      const NOW = new Date("2026-10-06T12:00:00.000Z");
      const endedDaysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
      const past = async (customer: string, periodEnd: Date | null) => {
        const ws = await workspace();
        await subscription(ws, "past_due", new Date(), { customer, periodEnd });
        return ws;
      };

      it("counts with a paid invoice (amount_paid > 0) and a period that ended 6 days ago", async () => {
        const ws = await past("cus_pd_ok", endedDaysAgo(6));
        await stripeEvent("cus_pd_ok", 4700);

        expect(await m.access.workspaceHasActivePaidAccess(ws, NOW)).toBe(true);
      });

      it("counts exactly at the edge of the grace (7 days) and not a day later", async () => {
        const edge = await past("cus_pd_edge", endedDaysAgo(7));
        const over = await past("cus_pd_over", endedDaysAgo(8));
        await stripeEvent("cus_pd_edge", 4700);
        await stripeEvent("cus_pd_over", 4700);

        expect(await m.access.workspaceHasActivePaidAccess(edge, NOW)).toBe(true);
        expect(await m.access.workspaceHasActivePaidAccess(over, NOW)).toBe(false);
      });

      it("a period that has not ended yet (renewal failed early) counts with a paid invoice", async () => {
        const ws = await past("cus_pd_future", new Date(NOW.getTime() + 2 * DAY));
        await stripeEvent("cus_pd_future", 4700);

        expect(await m.access.workspaceHasActivePaidAccess(ws, NOW)).toBe(true);
      });

      it("does not count without any paid invoice (a trialing subscription whose first invoice failed)", async () => {
        const ws = await past("cus_pd_none", endedDaysAgo(1));

        expect(await m.access.workspaceHasActivePaidAccess(ws, NOW)).toBe(false);
      });

      it("does not count with a null currentPeriodEnd, even with a paid invoice", async () => {
        const ws = await past("cus_pd_null", null);
        await stripeEvent("cus_pd_null", 4700);

        expect(await m.access.workspaceHasActivePaidAccess(ws, NOW)).toBe(false);
      });

      it("does not count with an invoice of zero (a trial start or a 100% promotion), of another customer, or of another event type", async () => {
        const zero = await past("cus_pd_zero", endedDaysAgo(1));
        await stripeEvent("cus_pd_zero", 0);
        const other = await past("cus_pd_mine", endedDaysAgo(1));
        await stripeEvent("cus_pd_someone_else", 4700);
        const wrongType = await past("cus_pd_type", endedDaysAgo(1));
        await stripeEvent("cus_pd_type", 4700, "invoice.payment_failed");
        const missing = await past("cus_pd_missing", endedDaysAgo(1));
        await stripeEvent("cus_pd_missing", null);

        for (const ws of [zero, other, wrongType, missing]) {
          expect(await m.access.workspaceHasActivePaidAccess(ws, NOW), ws).toBe(false);
        }
      });

      it("hasPaidStripeInvoiceForCustomer: only an invoice.paid with money for exactly that customer", async () => {
        const repo = await import("@/server/repositories/billing");
        await stripeEvent("cus_hp_paid", 100);
        await stripeEvent("cus_hp_zero", 0);
        await stripeEvent("cus_hp_failed", 100, "invoice.payment_failed");

        expect(await repo.hasPaidStripeInvoiceForCustomer("cus_hp_paid")).toBe(true);
        expect(await repo.hasPaidStripeInvoiceForCustomer("cus_hp_zero")).toBe(false);
        expect(await repo.hasPaidStripeInvoiceForCustomer("cus_hp_failed")).toBe(false);
        expect(await repo.hasPaidStripeInvoiceForCustomer("cus_hp_nobody")).toBe(false);
        expect(await repo.hasPaidStripeInvoiceForCustomer("cus_hp")).toBe(false);
      });

      it("an active subscription needs neither an invoice event nor a period (unchanged)", async () => {
        const ws = await workspace();
        await subscription(ws, "active");

        expect(await m.access.workspaceHasActivePaidAccess(ws, NOW)).toBe(true);
      });
    });

    it("only the LATEST subscription counts: an old active one under a newer canceled one is not paid, and the reverse is", async () => {
      const lapsed = await workspace();
      await subscription(lapsed, "active", new Date("2026-01-01T00:00:00Z"));
      await subscription(lapsed, "canceled", new Date("2026-02-01T00:00:00Z"));
      const renewed = await workspace();
      await subscription(renewed, "canceled", new Date("2026-01-01T00:00:00Z"));
      await subscription(renewed, "active", new Date("2026-02-01T00:00:00Z"));

      expect(await m.access.workspaceHasActivePaidAccess(lapsed)).toBe(false);
      expect(await m.access.workspaceHasActivePaidAccess(renewed)).toBe(true);
    });

    it("a tester entitlement in force is paid access; revoked or expired is not", async () => {
      const inForce = await workspace();
      await entitlement(inForce, "tester");
      const revoked = await workspace();
      await entitlement(revoked, "tester", "revoked");
      const expired = await workspace();
      await entitlement(expired, "tester", "active", new Date("2020-01-01T00:00:00Z"));
      const future = await workspace();
      await entitlement(future, "tester", "active", new Date("2999-01-01T00:00:00Z"));

      expect(await m.access.workspaceHasActivePaidAccess(inForce)).toBe(true);
      expect(await m.access.workspaceHasActivePaidAccess(revoked)).toBe(false);
      expect(await m.access.workspaceHasActivePaidAccess(expired)).toBe(false);
      expect(await m.access.workspaceHasActivePaidAccess(future)).toBe(true);
    });

    it("the sign-up trial and a beta allowance are NOT paid access", async () => {
      const trial = await workspace();
      await entitlement(trial, "trial");
      const beta = await workspace();
      await entitlement(beta, "beta_tester");

      expect(await m.access.workspaceHasActivePaidAccess(trial)).toBe(false);
      expect(await m.access.workspaceHasActivePaidAccess(beta)).toBe(false);
    });

    it("a platform owner among the members is paid access; nobody listed is not", async () => {
      const ws = await workspace();
      expect(await m.access.workspaceHasActivePaidAccess(ws)).toBe(false);

      process.env.PLATFORM_OWNER_EMAILS = emails.get(ws)!;
      expect(await m.access.workspaceHasActivePaidAccess(ws)).toBe(true);

      const stranger = await workspace();
      expect(await m.access.workspaceHasActivePaidAccess(stranger)).toBe(false);
    });

    it("a workspace with nothing at all is not paid", async () => {
      expect(await m.access.workspaceHasActivePaidAccess(await workspace())).toBe(false);
    });
  });

  describe("findFreePlanAccount over the real readers", () => {
    it("a sign-up with no account and only the trial is the free plan with no account id", async () => {
      const ws = await workspace();
      await entitlement(ws, "trial");

      expect(await rule(ws)).toEqual({ accountId: null });
    });

    it("no account and an active Stripe subscription: not the free plan", async () => {
      const ws = await workspace();
      await subscription(ws, "active");

      expect(await rule(ws)).toBeNull();
    });

    it("no account and a past_due subscription: not the free plan only with a paid invoice inside the grace; a trial that never paid is the free plan", async () => {
      const paying = await workspace();
      await subscription(paying, "past_due", new Date(), { customer: "cus_rule_pd", periodEnd: new Date() });
      await stripeEvent("cus_rule_pd", 4700);
      const neverPaid = await workspace();
      await subscription(neverPaid, "past_due", new Date(), { customer: "cus_rule_np", periodEnd: new Date() });

      expect(await rule(paying)).toBeNull();
      expect(await rule(neverPaid)).toEqual({ accountId: null });
    });

    it.each([["trialing"], ["canceled"]])("no account and a %s Stripe subscription: the free plan", async (status) => {
      const ws = await workspace();
      await subscription(ws, status);

      expect(await rule(ws)).toEqual({ accountId: null });
    });

    it("no account and a tester entitlement: not the free plan; with a beta allowance: the free plan", async () => {
      const tester = await workspace();
      await entitlement(tester, "tester");
      const beta = await workspace();
      await entitlement(beta, "beta_tester");

      expect(await rule(tester)).toBeNull();
      expect(await rule(beta)).toEqual({ accountId: null });
    });

    it("no account and a platform owner member: not the free plan", async () => {
      const ws = await workspace();
      process.env.PLATFORM_OWNER_EMAILS = emails.get(ws)!;

      expect(await rule(ws)).toBeNull();
    });

    it("a free account is the free plan with its id, unless the workspace has an active paid access (a payer that got one stays paid)", async () => {
      const ws = await workspace();
      const entry = await account(ws, "free", "2026-01-01T00:00:00Z");
      await subscription(ws, "trialing");
      expect(await rule(ws)).toEqual({ accountId: entry.id });

      const payer = await workspace();
      await account(payer, "free", "2026-01-01T00:00:00Z");
      await subscription(payer, "active");
      expect(await rule(payer)).toBeNull();
    });

    it("mixed workspaces: free + paid in either order is not the free plan", async () => {
      const freeFirst = await workspace();
      await account(freeFirst, "free", "2026-01-01T00:00:00Z");
      await account(freeFirst, "active", "2026-02-01T00:00:00Z");
      const paidFirst = await workspace();
      await account(paidFirst, "active", "2026-01-01T00:00:00Z");
      await account(paidFirst, "free", "2026-02-01T00:00:00Z");

      expect(await rule(freeFirst)).toBeNull();
      expect(await rule(paidFirst)).toBeNull();
    });

    it("converting the free account to paid lifts the free plan", async () => {
      const ws = await workspace();
      const entry = await account(ws, "free", "2026-01-01T00:00:00Z");
      expect(await rule(ws)).toEqual({ accountId: entry.id });

      await h.db.update(m.equipeSchema.equipeAccounts).set({ status: "deploying" })
        .where((await import("drizzle-orm")).eq(m.equipeSchema.equipeAccounts.id, entry.id));

      expect(await rule(ws)).toBeNull();
    });

    it("only closed accounts: the free plan with the most recent closed account as closedAccountId; a payer is not the free plan", async () => {
      const ws = await workspace();
      await account(ws, "closed", "2026-01-01T00:00:00Z");
      const latest = await account(ws, "closed", "2026-02-01T00:00:00Z");
      expect(await rule(ws)).toEqual({ accountId: null, closedAccountId: latest.id });

      const payer = await workspace();
      await account(payer, "closed", "2026-01-01T00:00:00Z");
      await subscription(payer, "active");
      expect(await rule(payer)).toBeNull();
    });

    it("the pilot off reads nothing and answers null for any of them", async () => {
      const ws = await workspace();
      await account(ws, "free", "2026-01-01T00:00:00Z");

      expect(await m.plan.findFreePlanAccount(ws, undefined, { enabledRaw: "false", allowlistRaw: "*" })).toBeNull();
    });
  });

  // Review F5: a free account next to a paid one in the same workspace (two brands) must not touch the paid brand.
  describe("a workspace with a free brand and a paid brand", () => {
    const ENV = { enabledRaw: "true", allowlistRaw: "*" } as const;

    it("is not the free plan (either order), so the paid brand's operations are never refused", async () => {
      const freeThenPaid = await workspace();
      await account(freeThenPaid, "free", "2026-01-01T00:00:00Z");
      await account(freeThenPaid, "active", "2026-02-01T00:00:00Z");
      const paidThenFree = await workspace();
      await account(paidThenFree, "active", "2026-01-01T00:00:00Z");
      await account(paidThenFree, "free", "2026-02-01T00:00:00Z");

      expect(await m.plan.findFreePlanAccount(freeThenPaid, undefined, ENV)).toBeNull();
      expect(await m.plan.findFreePlanAccount(paidThenFree, undefined, ENV)).toBeNull();
    });

    it("the classic asset analysis goes back to its per-brand rule: the paid brand is analyzed, the free brand is not", async () => {
      const ws = await workspace();
      const free = await account(ws, "free", "2026-01-01T00:00:00Z");
      const paid = await account(ws, "active", "2026-02-01T00:00:00Z");
      // Pilot on through the environment, as in production: the rule says "not free" (a paid brand exists).
      expect(await m.plan.findFreePlanAccount(ws)).toBeNull();

      expect(await m.assets.shouldAnalyzeWorkspaceAssets(ws, paid.clientProfileId)).toBe(true);
      expect(await m.assets.shouldAnalyzeWorkspaceAssets(ws, free.clientProfileId)).toBe(false);
    });

    it("converting the free brand's own account to paid lifts the refusal; opening a new paid brand while the first stays free is not a conversion of it", async () => {
      const ws = await workspace();
      const entry = await account(ws, "free", "2026-01-01T00:00:00Z");
      expect(await m.plan.findFreePlanAccount(ws, undefined, ENV)).toEqual({ accountId: entry.id });

      await account(ws, "deploying", "2026-02-01T00:00:00Z");

      // A paid brand now exists: the workspace is a customer. The free brand's own account is still `free`.
      expect(await m.plan.findFreePlanAccount(ws, undefined, ENV)).toBeNull();
      const [still] = await m.plan.readWorkspaceAccountsFromDb(ws);
      expect(still).toMatchObject({ id: entry.id, status: "free" });
    });
  });
});
