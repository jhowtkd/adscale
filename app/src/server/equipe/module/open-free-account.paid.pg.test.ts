/**
 * A workspace that pays opens the home against REAL Postgres (spec 2026-10-07 §3, caminho único etapa 3): there is no
 * classic product for it to keep, so the home opens its account like any other workspace's, and the free plan's rule
 * (`findFreePlanAccount`) still says it is not the free plan. The chain is the real one: the rule over the real readers, the
 * real `home.first_open -> open_free_account` command with the same `hasClassicPaidAccess` the request deps wire
 * (`workspaceHasActivePaidAccess`), and the billing rows (a Stripe subscription, a paid invoice event, the trial).
 * The database is shared: every assertion is about the workspaces created here, deleted at the end.
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/open-free-account.paid.pg.test.ts
 */
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import type { EquipeModuleDeps } from "./ports";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;
const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;
const HOME = { kind: "system", job: "home.first_open" } as const;

async function load() {
  const [free, commands, plan, access, schema, equipeSchema, fakes] = await Promise.all([
    import("./testing/free-pg"), import("./commands"), import("./free-plan"), import("../../billing/access"),
    import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("./testing/fakes"),
  ]);
  return { free, commands, plan, access, schema, equipeSchema, fakes };
}
type Mods = Awaited<ReturnType<typeof load>>;

describe.skipIf(!ENABLED)("a payer opens the home (pg, real commands)", () => {
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
  const openHome = (workspaceId: string, userId: string, extra: Partial<EquipeModuleDeps> = {}, clientProfileId?: string) => {
    const deps = m.free.depsFor(h, undefined, { hasClassicPaidAccess: (id: string) => m.access.workspaceHasActivePaidAccess(id), ...extra });
    return m.commands.executeCommand(deps, { actor: HOME, workspaceId }, { type: "open_free_account", payload: { userId, ...(clientProfileId ? { clientProfileId } : {}) } });
  };
  const rule = (workspaceId: string) => m.plan.findFreePlanAccount(workspaceId, undefined, GATE);

  it("an active Stripe subscription with no Equipe account: the rule is null BEFORE, the home opens the account, and the rule stays null AFTER (it still pays)", async () => {
    const { workspaceId, userId } = await workspace();
    await subscription(workspaceId, "active", cus("r1_active"));
    expect(await rule(workspaceId)).toBeNull();

    const opened = await openHome(workspaceId, userId);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data.created).toBe(true);
    const accounts = await accountsOf(workspaceId);
    expect(accounts.map((a) => a.status)).toEqual(["free"]);
    expect(accounts[0]!.id).toBe(opened.value.accountId);
    expect(await rule(workspaceId)).toBeNull();
  });

  it("an active Stripe subscription with no Equipe account, and a brand with a Brand Kit: the brand enters by import and its handoff is done", async () => {
    const { workspaceId, userId } = await workspace();
    await subscription(workspaceId, "active", cus("r1_import"));
    const [profile] = await h.db.insert(m.schema.clientProfiles).values({ workspaceId, name: "Azul", brandColors: ["#2B4C7E"] }).returning();
    const gateway = new m.fakes.FakeAdscaleGateway();
    gateway.addProfile({ id: profile!.id, workspaceId, name: "Azul", brandColors: ["#2B4C7E"] });

    const opened = await openHome(workspaceId, userId, { gateway }, profile!.id);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data).toMatchObject({ created: true, imported: true });
    const accounts = await accountsOf(workspaceId);
    expect(accounts).toEqual([expect.objectContaining({ id: opened.value.accountId, clientProfileId: profile!.id, status: "free" })]);
    const handoffs = await m.free.depsFor(h).uow.repos.handoffs.list({ workspaceId, accountId: opened.value.accountId! });
    expect(handoffs).toEqual([expect.objectContaining({ step: "done", clientProfileId: profile!.id })]);
    expect(await rule(workspaceId)).toBeNull();

    // Task 16: the conversation opens with the Strategist's greeting, written in the import's transaction, keyed by its event.
    const lines = () => h.db.select().from(m.schema.assistantMessages).where(eq(m.schema.assistantMessages.workspaceId, workspaceId));
    const [imported] = await m.free.depsFor(h).uow.repos.events.list({ workspaceId, accountId: opened.value.accountId! }, { eventType: "account.brand_imported" });
    expect(await lines()).toEqual([expect.objectContaining({
      id: imported!.id, threadId: opened.value.data.assistantThreadId, type: "assistant",
      content: "Oi! Li o Brand Kit da marca Azul e já estou com a identidade dela. Me conte o que você quer criar ou resolver agora.",
      payload: { handoffStep: "imported", brandName: "Azul" },
    })]);
    // Opening the brand again (reopening /) returns the account and writes nothing.
    const again = await openHome(workspaceId, userId, { gateway }, profile!.id);
    expect(again.ok && again.value.data).toMatchObject({ accountId: opened.value.accountId, created: false });
    expect(await lines()).toHaveLength(1);
  });

  it("the control: a sign-up with the trial and no subscription is the free plan before, the home opens its free account, and it stays the free plan after", async () => {
    const { workspaceId, userId } = await workspace();
    await trial(workspaceId);
    expect(await rule(workspaceId)).toEqual({ accountId: null });

    const opened = await openHome(workspaceId, userId);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data.created).toBe(true);
    const accounts = await accountsOf(workspaceId);
    expect(accounts.map((a) => a.status)).toEqual(["free"]);
    expect(await rule(workspaceId)).toEqual({ accountId: accounts[0]!.id });
  });

  it("a payer that already has a free account (opened before it paid) stays paid by the rule, and opening again returns that account", async () => {
    const { workspaceId, userId } = await workspace();
    // The account was opened while the workspace was a sign-up, before it paid: no payer reader on this open.
    const early = await m.commands.executeCommand(m.free.depsFor(h), { actor: HOME, workspaceId }, { type: "open_free_account", payload: { userId } });
    expect(early.ok).toBe(true);
    expect(await rule(workspaceId)).toMatchObject({ accountId: expect.any(String) });

    await subscription(workspaceId, "active", cus("r1_late"));

    expect(await rule(workspaceId)).toBeNull();
    // Opening again returns the same account and never creates another.
    const again = await openHome(workspaceId, userId);
    expect(again.ok && again.value.data.created).toBe(false);
    expect(await accountsOf(workspaceId)).toHaveLength(1);
  });

  it("a payer with only a CLOSED account gets the closed account back from the home, and nothing new is created", async () => {
    const { workspaceId, userId } = await workspace();
    await subscription(workspaceId, "active", cus("r1_closed"));
    const [profile] = await h.db.insert(m.schema.clientProfiles).values({ workspaceId, name: "Marca" }).returning();
    const [closed] = await h.db.insert(m.equipeSchema.equipeAccounts).values({ workspaceId, clientProfileId: profile!.id, status: "closed" }).returning();

    expect(await rule(workspaceId)).toBeNull();

    const opened = await openHome(workspaceId, userId);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.data).toMatchObject({ accountId: closed!.id, created: false });
    expect((await accountsOf(workspaceId)).map((a) => [a.id, a.status])).toEqual([[closed!.id, "closed"]]);
    expect(await rule(workspaceId)).toBeNull();
  });

  it("a past_due payer inside the grace with a paid invoice still pays by the rule; without a paid invoice, or past the grace, the rule is the free plan; the home opens an account for all three", async () => {
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
    const openedPaid = await openHome(paid.workspaceId, paid.userId);
    expect(openedPaid.ok && openedPaid.value.data.created).toBe(true);
    expect((await accountsOf(paid.workspaceId)).map((a) => a.status)).toEqual(["free"]);
    expect(await rule(paid.workspaceId)).toBeNull();

    for (const free of [noInvoice, late]) {
      expect(await rule(free.workspaceId)).toEqual({ accountId: null });
      const opened = await openHome(free.workspaceId, free.userId);
      expect(opened.ok).toBe(true);
      expect((await accountsOf(free.workspaceId)).map((a) => a.status)).toEqual(["free"]);
    }
  });
});
