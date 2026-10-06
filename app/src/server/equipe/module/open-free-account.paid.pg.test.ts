/**
 * Review R1 of the PR 626 against REAL Postgres: opening the home turned a classic paying customer into the free plan.
 * The chain is the real one: the rule (`findFreePlanAccount`) and the pilot's product (`usesEquipeProduct`) over the real
 * readers, the real `home.first_open -> open_free_account` command with the same `hasClassicPaidAccess` the request deps
 * wire (`workspaceHasActivePaidAccess`), and the billing rows (a Stripe subscription, a paid invoice event, the trial).
 * The database is shared: every assertion is about the workspaces created here, deleted at the end.
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/open-free-account.paid.pg.test.ts
 */
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;
const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;
const HOME = { kind: "system", job: "home.first_open" } as const;

async function load() {
  const [free, commands, plan, access, schema, equipeSchema] = await Promise.all([
    import("./testing/free-pg"), import("./commands"), import("./free-plan"), import("../../billing/access"),
    import("@/server/db/schema"), import("@/server/db/equipe-schema"),
  ]);
  return { free, commands, plan, access, schema, equipeSchema };
}
type Mods = Awaited<ReturnType<typeof load>>;

describe.skipIf(!ENABLED)("a classic payer opens the home (pg, real commands)", () => {
  let m: Mods;
  let h: ReturnType<Mods["free"]["openPool"]>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let seq = 0;
  // Customers and events of this run only: an event left by another run must not prove a payment here.
  const RUN = `r1_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const cus = (name: string) => `cus_${RUN}_${name}`;
  const eventIds: string[] = [];

  beforeAll(async () => {
    m = await load();
    (m.free.assertTestDatabase as (url: string | null) => void)(TEST_DATABASE_URL);
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
  }, 60_000);
  afterAll(async () => {
    if (!ENABLED) return;
    if (eventIds.length) await h.db.delete(m.schema.processedStripeEvents).where(inArray(m.schema.processedStripeEvents.stripeEventId, eventIds));
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.pool.end();
  }, 60_000);

  async function workspace() {
    const seeded = await m.free.seedWorkspace(h);
    workspaceIds.push(seeded.workspaceId);
    userIds.push(seeded.userId);
    return seeded;
  }
  async function subscription(workspaceId: string, status: string, customer: string, periodEnd: Date | null = null) {
    seq += 1;
    await h.db.insert(m.schema.subscriptions).values({
      workspaceId, stripeSubscriptionId: `sub_r1_${Date.now()}_${seq}`, stripeCustomerId: customer,
      status, planKey: "starter", priceId: "price_r1", currentPeriodEnd: periodEnd,
    });
  }
  /** An `invoice.paid` as the webhook recorded it; deleted at the end (the table has no foreign key). */
  async function paidInvoice(customer: string, amountPaid: number) {
    seq += 1;
    const stripeEventId = `evt_${RUN}_${seq}`;
    eventIds.push(stripeEventId);
    await h.db.insert(m.schema.processedStripeEvents).values({
      stripeEventId, type: "invoice.paid",
      payload: { data: { object: { customer, amount_paid: amountPaid } } },
    });
  }
  async function trial(workspaceId: string) {
    await h.db.insert(m.schema.workspaceEntitlements).values({ workspaceId, kind: "trial", status: "active" });
  }
  async function accountsOf(workspaceId: string) {
    return h.db.select().from(m.equipeSchema.equipeAccounts).where(eq(m.equipeSchema.equipeAccounts.workspaceId, workspaceId));
  }

  /** The command the home runs, with the deps of the real route: the pilot on and the classic-paid reader wired as in `createEquipeRouteDeps`. */
  const openHome = (workspaceId: string, userId: string) => {
    const deps = m.free.depsFor(h, undefined, { hasClassicPaidAccess: (id: string) => m.access.workspaceHasActivePaidAccess(id) });
    return m.commands.executeCommand(deps, { actor: HOME, workspaceId }, { type: "open_free_account", payload: { userId } });
  };
  const rule = (workspaceId: string) => m.plan.findFreePlanAccount(workspaceId, undefined, GATE);
  const product = (workspaceId: string) => m.plan.usesEquipeProduct(workspaceId, undefined, GATE);

  it("an active Stripe subscription with no Equipe account: the rule is null BEFORE, the home opens NO account, the rule stays null AFTER, and the product is classic", async () => {
    const { workspaceId, userId } = await workspace();
    await subscription(workspaceId, "active", cus("r1_active"));
    expect(await rule(workspaceId)).toBeNull();
    expect(await product(workspaceId)).toBe(false);

    const opened = await openHome(workspaceId, userId);

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe("classic_paid_access");
    expect(await accountsOf(workspaceId)).toEqual([]);
    expect(await rule(workspaceId)).toBeNull();
    expect(await product(workspaceId)).toBe(false);
  });

  it("the control: a sign-up with the trial and no subscription is the free plan before, the home opens its free account, and it stays the free plan after", async () => {
    const { workspaceId, userId } = await workspace();
    await trial(workspaceId);
    expect(await rule(workspaceId)).toEqual({ accountId: null });
    expect(await product(workspaceId)).toBe(true);

    const opened = await openHome(workspaceId, userId);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data.created).toBe(true);
    const accounts = await accountsOf(workspaceId);
    expect(accounts.map((a) => a.status)).toEqual(["free"]);
    expect(await rule(workspaceId)).toEqual({ accountId: accounts[0]!.id });
    expect(await product(workspaceId)).toBe(true);
  });

  it("a payer that already has a free account (opened before the fix) stays paid by the rule; the product is the pilot's (a live account exists)", async () => {
    const { workspaceId, userId } = await workspace();
    // The account was opened while the workspace was a sign-up, before it paid: no payer reader on this open.
    const early = await m.commands.executeCommand(m.free.depsFor(h), { actor: HOME, workspaceId }, { type: "open_free_account", payload: { userId } });
    expect(early.ok).toBe(true);
    expect(await rule(workspaceId)).toMatchObject({ accountId: expect.any(String) });

    await subscription(workspaceId, "active", cus("r1_late"));

    expect(await rule(workspaceId)).toBeNull();
    expect(await product(workspaceId)).toBe(true);
    // Opening again returns the same account and never creates another.
    const again = await openHome(workspaceId, userId);
    expect(again.ok && again.value.data.created).toBe(false);
    expect(await accountsOf(workspaceId)).toHaveLength(1);
  });

  it("a payer with only a CLOSED account keeps the classic product too (a closed account is not a live one)", async () => {
    const { workspaceId } = await workspace();
    await subscription(workspaceId, "active", cus("r1_closed"));
    const [profile] = await h.db.insert(m.schema.clientProfiles).values({ workspaceId, name: "Marca" }).returning();
    await h.db.insert(m.equipeSchema.equipeAccounts).values({ workspaceId, clientProfileId: profile!.id, status: "closed" });

    expect(await rule(workspaceId)).toBeNull();
    expect(await product(workspaceId)).toBe(false);
  });

  it("a past_due payer inside the grace with a paid invoice keeps the classic product; without a paid invoice, or past the grace, the home opens the free account", async () => {
    const day = 24 * 60 * 60 * 1000;
    const paid = await workspace();
    await subscription(paid.workspaceId, "past_due", cus("r1_pd_paid"), new Date(Date.now() - 2 * day));
    await paidInvoice(cus("r1_pd_paid"), 4700);
    const noInvoice = await workspace();
    await subscription(noInvoice.workspaceId, "past_due", cus("r1_pd_none"), new Date(Date.now() - 2 * day));
    const late = await workspace();
    await subscription(late.workspaceId, "past_due", cus("r1_pd_late"), new Date(Date.now() - 30 * day));
    await paidInvoice(cus("r1_pd_late"), 4700);

    expect(await rule(paid.workspaceId)).toBeNull();
    expect((await openHome(paid.workspaceId, paid.userId)).ok).toBe(false);
    expect(await accountsOf(paid.workspaceId)).toEqual([]);

    for (const free of [noInvoice, late]) {
      expect(await rule(free.workspaceId)).toEqual({ accountId: null });
      const opened = await openHome(free.workspaceId, free.userId);
      expect(opened.ok).toBe(true);
      expect((await accountsOf(free.workspaceId)).map((a) => a.status)).toEqual(["free"]);
    }
  });
});
