/**
 * The Stripe chain of the free plan's paid access against REAL Postgres (PR 626 review, R4, R5 and R6):
 * a signed webhook (the real route, with the SDK's own signature check) -> `processStripeEvent` -> the subscription row,
 * the recorded event and the credit grants -> `workspaceHasActivePaidAccess` -> the free plan's rule and the pilot's
 * product. The payloads are the Stripe API's own shapes (Basil: the period on the subscription's items; one-off invoices
 * with no subscription), never rows inserted by hand. The only network call is `subscriptions.retrieve`, a spy that
 * answers Basil; any other call to Stripe throws.
 *
 * The database is shared: every id carries a run suffix, the workspaces go by cascade, and the events (no foreign key)
 * are deleted by their prefix at the end, with a query that proves none is left.
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/billing/events.pg.test.ts
 */
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // Fake Stripe configuration, set BEFORE the dynamic imports (the plan price ids are read at import).
  process.env.STRIPE_SECRET_KEY = "sk_test_ticket11_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_ticket11_fake";
  process.env.STRIPE_STARTER_PRICE_ID = "price_t11_starter";
  process.env.STRIPE_GROWTH_PRICE_ID = "price_t11_growth";
  process.env.STRIPE_SCALE_PRICE_ID = "price_t11_scale";
}
const ENABLED = TEST_DATABASE_URL !== null;
// Only the error texts of the route (the signature refusal) need translations.
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;
const HOME = { kind: "system", job: "home.first_open" } as const;
const DAY = 24 * 60 * 60 * 1000;
const RUN = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
const EVENT_PREFIX = `evt_t11_${RUN}_`;
const STARTER = "price_t11_starter";

async function load() {
  const [free, route, stripeModule, access, plan, commands, repo, schema, equipeSchema, dbModule, credits] = await Promise.all([
    import("../equipe/module/testing/free-pg"), import("@/app/api/billing/webhook/route"), import("./stripe"),
    import("./access"), import("../equipe/module/free-plan"), import("../equipe/module/commands"),
    import("@/server/repositories/billing"), import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("@/server/db"),
    import("./credits"),
  ]);
  return { free, route, stripe: stripeModule.stripe, access, plan, commands, repo, schema, equipeSchema, db: dbModule.db, credits };
}
type Mods = Awaited<ReturnType<typeof load>>;

describe.skipIf(!ENABLED)("Stripe webhook -> paid access -> free plan (pg, signed events)", () => {
  let m: Mods;
  let h: ReturnType<Mods["free"]["openPool"]>;
  let retrieve: ReturnType<typeof vi.spyOn>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    m = await load();
    (m.free.assertTestDatabase as (url: string | null) => void)(TEST_DATABASE_URL);
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
    // The only network call of the chain; anything else on the Stripe client throws.
    retrieve = vi.spyOn(m.stripe.subscriptions, "retrieve");
  }, 60_000);

  // Each test starts with no queued Stripe answer, so one that is never consumed cannot leak into the next.
  beforeEach(() => {
    retrieve.mockReset();
    retrieve.mockImplementation((() => {
      throw new Error("unexpected stripe.subscriptions.retrieve");
    }) as never);
  });

  afterAll(async () => {
    if (!ENABLED) return;
    retrieve?.mockRestore();
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.db.delete(m.schema.processedStripeEvents).where(like(m.schema.processedStripeEvents.stripeEventId, `${EVENT_PREFIX}%`));
    const [left] = (await h.db.execute(sql`select count(*)::int as n from adscale_app.processed_stripe_events where stripe_event_id like ${`${EVENT_PREFIX}%`}`)).rows as { n: number }[];
    await h.pool.end();
    expect(left.n, "events left behind").toBe(0);
  }, 60_000);

  // ---- builders: Stripe's own shapes ----
  const uid = (prefix: string) => { seq += 1; return `${prefix}_t11_${RUN}_${seq}`; };
  const secondsAgo = (days: number) => Math.floor((Date.now() - days * DAY) / 1000);

  /** A Basil subscription: the period only on the items, nothing on top. */
  function subscriptionObject(o: { id: string; customer: string; workspaceId: string; status: string; periodEnd?: number | null; periodStart?: number | null; price?: string; extraItems?: unknown[] }) {
    const period = o.periodEnd === null ? {} : { current_period_start: o.periodStart ?? (o.periodEnd ?? secondsAgo(2)) - 30 * 86400, current_period_end: o.periodEnd ?? secondsAgo(2) };
    return {
      id: o.id, object: "subscription", customer: o.customer, status: o.status, cancel_at_period_end: false,
      metadata: { workspaceId: o.workspaceId, planKey: "starter" },
      items: { object: "list", data: [...(o.extraItems ?? []), { id: uid("si"), object: "subscription_item", price: { id: o.price ?? STARTER }, ...period }] },
    };
  }
  /** A Basil invoice of a subscription (the subscription under `parent`, not on top). */
  const subscriptionInvoice = (o: { id?: string; customer: string; subscription: string; amountPaid: number }) => ({
    id: o.id ?? uid("in"), object: "invoice", customer: o.customer, amount_paid: o.amountPaid,
    parent: { type: "subscription_details", subscription_details: { subscription: o.subscription } },
  });
  /** A one-off invoice: no subscription anywhere. */
  const oneOffInvoice = (o: { id?: string; customer: string; amountPaid: number }) => ({
    id: o.id ?? uid("in"), object: "invoice", customer: o.customer, amount_paid: o.amountPaid, parent: null,
    lines: { object: "list", data: [{ id: uid("il"), object: "line_item", parent: null }] },
  });
  const checkoutSession = (o: { customer: string; subscription: string; workspaceId: string }) => ({
    id: uid("cs"), object: "checkout.session", mode: "subscription", customer: o.customer, subscription: o.subscription,
    metadata: { workspaceId: o.workspaceId, planKey: "starter" },
  });

  /** POSTs a signed event to the real webhook route. */
  async function send(type: string, object: unknown, eventId = `${EVENT_PREFIX}${uid("e")}`) {
    const payload = JSON.stringify({
      id: eventId, object: "event", api_version: "2026-04-22.dahlia", type, created: Math.floor(Date.now() / 1000), livemode: false,
      data: { object },
    });
    const signature = m.stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const res = await m.route.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: payload,
    }));
    return { eventId, status: res.status, body: (await res.json()) as { received?: boolean; result?: { status: string; reason?: string; type?: string } } };
  }

  async function workspace() {
    const seeded = await m.free.seedWorkspace(h);
    workspaceIds.push(seeded.workspaceId);
    userIds.push(seeded.userId);
    return seeded;
  }
  /** A workspace, with the customer and the subscription ids its events will carry. */
  async function scenario() {
    const ws = await workspace();
    return { ...ws, customer: uid("cus"), sub: uid("sub") };
  }
  const subRow = async (stripeSubscriptionId: string) =>
    (await h.db.select().from(m.schema.subscriptions).where(eq(m.schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId)))[0];
  const grants = (workspaceId: string) => h.db.select().from(m.schema.creditGrants).where(eq(m.schema.creditGrants.workspaceId, workspaceId));
  const eventRow = async (eventId: string) =>
    (await h.db.select().from(m.schema.processedStripeEvents).where(eq(m.schema.processedStripeEvents.stripeEventId, eventId)))[0];
  const accountsOf = (workspaceId: string) =>
    h.db.select().from(m.equipeSchema.equipeAccounts).where(eq(m.equipeSchema.equipeAccounts.workspaceId, workspaceId));

  const paid = (workspaceId: string) => m.access.workspaceHasActivePaidAccess(workspaceId);
  const rule = (workspaceId: string) => m.plan.findFreePlanAccount(workspaceId, undefined, GATE);
  const product = (workspaceId: string) => m.plan.usesEquipeProduct(workspaceId, undefined, GATE);
  const openHome = (workspaceId: string, userId: string) =>
    m.commands.executeCommand(
      m.free.depsFor(h, undefined, { hasClassicPaidAccess: (id: string) => m.access.workspaceHasActivePaidAccess(id) }),
      { actor: HOME, workspaceId }, { type: "open_free_account", payload: { userId } });
  /** The subscription Stripe would return from `subscriptions.retrieve`, in Basil. */
  const stripeReturns = (object: ReturnType<typeof subscriptionObject>) => retrieve.mockResolvedValueOnce(object as never);

  // ---------------------------------------------------------------------------------------------------------------
  describe("R4: the period lives on the subscription's item (Basil)", () => {
    it("past_due with the period only on the item, ended 2 days ago, plus a paid invoice: stored, paid access, classic", async () => {
      const s = await scenario();
      const periodEnd = secondsAgo(2);
      const updated = await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      // The local row is past_due, so the invoice is re-read from Stripe, which still says past_due with the same period.
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      const invoice = await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(updated.body.result).toEqual({ status: "processed", type: "customer.subscription.updated" });
      expect(invoice.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "past_due", workspaceId: s.workspaceId });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect((await eventRow(invoice.eventId))?.type).toBe("invoice.paid");
      expect(await grants(s.workspaceId)).toEqual([]); // past_due: no new monthly grant
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await rule(s.workspaceId)).toBeNull();
      expect(await product(s.workspaceId)).toBe(false);
    });

    it("control: the period ended 8 days ago -> the free plan, with no account id", async () => {
      const s = await scenario();
      const periodEnd = secondsAgo(8);
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      expect((await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }))).status).toBe(200);

      expect(await paid(s.workspaceId)).toBe(false);
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });
      expect(await product(s.workspaceId)).toBe(true);
    });

    it("control: no period anywhere -> currentPeriodEnd null, and the free plan (a period it does not know is refused)", async () => {
      const s = await scenario();
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: null }));
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: null }));
      expect((await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }))).status).toBe(200);

      expect((await subRow(s.sub))!.currentPeriodEnd).toBeNull();
      expect(await paid(s.workspaceId)).toBe(false);
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });
    });

    it("the recovery: invoice.paid arrives before any subscription event -> retrieve (Basil), active row with the item's period, 1 grant expiring at the period end; then payment_failed -> past_due keeping the period -> paid access", async () => {
      const s = await scenario();
      const periodEnd = Math.floor(Date.now() / 1000) + 20 * 86400;
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));

      const invoice = await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(invoice.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(retrieve).toHaveBeenLastCalledWith(s.sub);
      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "active" });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      const granted = await grants(s.workspaceId);
      expect(granted).toHaveLength(1);
      expect(granted[0]).toMatchObject({ source: "stripe_invoice" });
      expect(granted[0]!.expiresAt).toEqual(new Date(periodEnd * 1000));

      const failed = await send("invoice.payment_failed", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 0 }));

      expect(failed.body.result).toEqual({ status: "processed", type: "invoice.payment_failed" });
      const after = await subRow(s.sub);
      expect(after).toMatchObject({ status: "past_due" });
      expect(after!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await rule(s.workspaceId)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("R5: a late checkout never takes a confirmed subscription back", () => {
    it("a. created(active) -> invoice.paid -> a late checkout: still active, period intact, 1 grant, paid access; the home opens NO account", async () => {
      const s = await scenario();
      const periodEnd = Math.floor(Date.now() / 1000) + 25 * 86400;
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      const checkout = await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));

      expect(checkout.body.result).toEqual({ status: "processed", type: "checkout.session.completed" });
      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "active" });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect(await grants(s.workspaceId)).toHaveLength(1);
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await rule(s.workspaceId)).toBeNull();
      expect(await product(s.workspaceId)).toBe(false);
      const opened = await openHome(s.workspaceId, s.userId);
      expect(opened.ok).toBe(false);
      if (!opened.ok) expect(opened.error.code).toBe("classic_paid_access");
      expect(await accountsOf(s.workspaceId)).toEqual([]);
    });

    it("b. created(active) -> checkout -> invoice.paid: active, 1 grant", async () => {
      const s = await scenario();
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: Math.floor(Date.now() / 1000) + 25 * 86400 }));
      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
      expect(await paid(s.workspaceId)).toBe(true);
    });

    it("c. the normal order, checkout -> created(active) -> invoice.paid: active, 1 grant", async () => {
      const s = await scenario();
      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));
      expect(await subRow(s.sub)).toMatchObject({ status: "checkout_completed", currentPeriodEnd: null });
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: Math.floor(Date.now() / 1000) + 25 * 86400 }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
      expect(await paid(s.workspaceId)).toBe(true);
    });

    it("d. created(past_due, period ended 2 days ago) + invoice.paid -> a late checkout: still past_due with the period, paid access", async () => {
      const s = await scenario();
      const periodEnd = secondsAgo(2);
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));
      expect((await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }))).status).toBe(200);

      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));

      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "past_due" });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect(await paid(s.workspaceId)).toBe(true);
    });

    it("e. invoice.paid first (retrieve -> active) -> a late checkout: still active", async () => {
      const s = await scenario();
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: Math.floor(Date.now() / 1000) + 25 * 86400 }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));

      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
    });

    it("f. created(incomplete) -> checkout: moves up to checkout_completed keeping the period; then invoice.paid retrieves, goes active and grants once", async () => {
      const s = await scenario();
      const incompleteEnd = Math.floor(Date.now() / 1000) + 2 * 86400;
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "incomplete", periodEnd: incompleteEnd }));
      expect(await subRow(s.sub)).toMatchObject({ status: "incomplete" });

      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));

      const afterCheckout = await subRow(s.sub);
      expect(afterCheckout).toMatchObject({ status: "checkout_completed" });
      expect(afterCheckout!.currentPeriodEnd).toEqual(new Date(incompleteEnd * 1000));

      const activeEnd = Math.floor(Date.now() / 1000) + 28 * 86400;
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: activeEnd }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "active" });
      expect(row!.currentPeriodEnd).toEqual(new Date(activeEnd * 1000));
      expect(await grants(s.workspaceId)).toHaveLength(1);
    });

    it("g. repeated deliveries: the same checkout event is skipped; another checkout event over an active subscription keeps it active; the same invoice.paid is skipped with 1 grant", async () => {
      const s = await scenario();
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: Math.floor(Date.now() / 1000) + 25 * 86400 }));
      const session = checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId });
      const first = await send("checkout.session.completed", session);
      const replay = await send("checkout.session.completed", session, first.eventId);
      const other = await send("checkout.session.completed", session);
      const invoice = subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 });
      const paidOnce = await send("invoice.paid", invoice);
      const paidAgain = await send("invoice.paid", invoice, paidOnce.eventId);
      const paidWithAnotherEvent = await send("invoice.paid", invoice);

      expect(first.body.result).toEqual({ status: "processed", type: "checkout.session.completed" });
      expect(replay.body.result).toEqual({ status: "skipped", reason: "already_processed" });
      expect(other.body.result).toEqual({ status: "processed", type: "checkout.session.completed" });
      expect(paidAgain.body.result).toEqual({ status: "skipped", reason: "already_processed" });
      expect(paidWithAnotherEvent.body.result?.status).toBe("processed");
      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1); // the same invoice id never grants twice
    });

    it("h. a checkout and the subscription's own active event at the same time: always active at the end", async () => {
      // Warm the pool first: the interleaving must come from the two statements, not from connection setup.
      await Promise.all(Array.from({ length: 8 }, () => m.db.execute(sql`select pg_sleep(0.05)`)));
      for (let round = 0; round < 6; round += 1) {
        const s = await scenario();
        const active = subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: Math.floor(Date.now() / 1000) + 25 * 86400 });
        const results = await Promise.all([
          send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId })),
          send("customer.subscription.updated", active),
        ]);

        expect(results.map((r) => r.status), `round ${round}`).toEqual([200, 200]);
        expect(await subRow(s.sub), `round ${round}`).toMatchObject({ status: "active" });
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Review R7/O1: Stripe does not order its events, so a local row that is not active may be behind the subscription.
  // The invoice that recovered it must grant the month's credits (Stripe's own state decides, once per invoice).
  describe("R7/O1: the paid invoice of a subscription the local row has not caught up with", () => {
    const starterGrant = 300; // PLAN_CREDIT_GRANTS.starter
    const future = () => Math.floor(Date.now() / 1000) + 25 * 86400;
    const retrieveCalls = () => retrieve.mock.calls.length;

    it("R7: created(active) -> payment_failed -> a late checkout (keeps past_due) -> invoice.paid of the recovered invoice -> updated(active): the credits arrive once and the payer can spend", async () => {
      const s = await scenario();
      const periodEnd = future();
      const active = subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd });
      await send("customer.subscription.created", active);
      await send("invoice.payment_failed", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 0 }));
      expect(await subRow(s.sub)).toMatchObject({ status: "past_due" });
      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));
      expect(await subRow(s.sub)).toMatchObject({ status: "past_due" }); // R5: the late checkout does not take it back
      expect(await grants(s.workspaceId)).toEqual([]);

      // At Stripe it is already active again: the payment recovered it.
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));
      const invoice = subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 });
      const before = retrieveCalls();
      const paidEvent = await send("invoice.paid", invoice);

      expect(paidEvent.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(retrieveCalls()).toBe(before + 1);
      expect(retrieve).toHaveBeenLastCalledWith(s.sub);
      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "active" });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      const granted = await grants(s.workspaceId);
      expect(granted).toHaveLength(1);
      expect(granted[0]).toMatchObject({ source: "stripe_invoice", sourceId: invoice.id, amount: starterGrant });
      expect(granted[0]!.expiresAt).toEqual(new Date(periodEnd * 1000));

      await send("customer.subscription.updated", active);

      expect(await grants(s.workspaceId)).toHaveLength(1);
      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await rule(s.workspaceId)).toBeNull();
      expect(await product(s.workspaceId)).toBe(false);
      expect(await m.credits.canSpend(s.workspaceId, "copy_generation")).toMatchObject({ allowed: true, balance: starterGrant });

      // The same event delivered again is skipped; another event for the same invoice is processed and grants nothing more.
      const replay = await send("invoice.paid", invoice, paidEvent.eventId);
      expect(replay.body.result).toEqual({ status: "skipped", reason: "already_processed" });
      const other = await send("invoice.paid", invoice);
      expect(other.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
    });

    it("O1: created(incomplete) -> invoice.paid (Stripe says active) -> checkout -> updated(active): active, 1 grant, can spend, idempotent", async () => {
      const s = await scenario();
      const periodEnd = future();
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "incomplete", periodEnd }));
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));
      const invoice = subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 });

      const paidEvent = await send("invoice.paid", invoice);

      expect(paidEvent.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1);

      await send("checkout.session.completed", checkoutSession({ customer: s.customer, subscription: s.sub, workspaceId: s.workspaceId }));
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));

      expect(await subRow(s.sub)).toMatchObject({ status: "active" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await m.credits.canSpend(s.workspaceId, "copy_generation")).toMatchObject({ allowed: true, balance: starterGrant });
      const replay = await send("invoice.paid", invoice, paidEvent.eventId);
      expect(replay.body.result).toEqual({ status: "skipped", reason: "already_processed" });
      expect(await grants(s.workspaceId)).toHaveLength(1);
    });

    it("control: local past_due and Stripe still past_due (the invoice paid late, before Stripe moved it): no credits, the row keeps the period Stripe reports, paid access inside the grace", async () => {
      const s = await scenario();
      const periodEnd = secondsAgo(2);
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd: future() }));
      await send("invoice.payment_failed", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 0 }));
      stripeReturns(subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd }));

      const paidEvent = await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(paidEvent.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(await grants(s.workspaceId)).toEqual([]);
      const row = await subRow(s.sub);
      expect(row).toMatchObject({ status: "past_due" });
      expect(row!.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect((await eventRow(paidEvent.eventId))?.type).toBe("invoice.paid");
      expect(await paid(s.workspaceId)).toBe(true);
    });

    it("control: local active -> Stripe is NOT asked, and the invoice grants once", async () => {
      const s = await scenario();
      const periodEnd = future();
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "active", periodEnd }));
      const before = retrieveCalls();

      const paidEvent = await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(paidEvent.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(retrieveCalls()).toBe(before);
      expect(await grants(s.workspaceId)).toHaveLength(1);
    });

    it("a failed Stripe read leaves the event unrecorded (the delivery is retried) and grants nothing yet", async () => {
      const s = await scenario();
      await send("customer.subscription.created", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "incomplete", periodEnd: future() }));
      retrieve.mockRejectedValueOnce(new Error("stripe down"));

      const failed = await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(failed.status).toBeGreaterThanOrEqual(500);
      expect(await eventRow(failed.eventId)).toBeUndefined();
      expect(await grants(s.workspaceId)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("R6: a one-off invoice is a payment, not an error", () => {
    it("past_due with no paid subscription invoice + a one-off paid invoice of the customer: 200, recorded, paid access, ZERO grants; the replay is skipped", async () => {
      const s = await scenario();
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: secondsAgo(2) }));
      expect(await paid(s.workspaceId)).toBe(false); // no proof of payment yet
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });

      const invoice = oneOffInvoice({ customer: s.customer, amountPaid: 4700 });
      const first = await send("invoice.paid", invoice);

      expect(first.status).toBe(200);
      expect(first.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      const recorded = await eventRow(first.eventId);
      expect(recorded?.type).toBe("invoice.paid");
      expect(await m.repo.hasPaidStripeInvoiceForCustomer(s.customer)).toBe(true);
      expect(await paid(s.workspaceId)).toBe(true);
      expect(await rule(s.workspaceId)).toBeNull();
      expect(await grants(s.workspaceId)).toEqual([]);

      const replay = await send("invoice.paid", invoice, first.eventId);
      expect(replay.body.result).toEqual({ status: "skipped", reason: "already_processed" });
      expect(await grants(s.workspaceId)).toEqual([]);
    });

    it("control: a one-off invoice of 0 does not prove payment", async () => {
      const s = await scenario();
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: secondsAgo(2) }));
      const zero = await send("invoice.paid", oneOffInvoice({ customer: s.customer, amountPaid: 0 }));

      expect(zero.body.result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(await m.repo.hasPaidStripeInvoiceForCustomer(s.customer)).toBe(false);
      expect(await paid(s.workspaceId)).toBe(false);
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });
    });

    it("control: only a one-off invoice and no subscription at all stays the free plan", async () => {
      const s = await scenario();
      await send("invoice.paid", oneOffInvoice({ customer: s.customer, amountPaid: 4700 }));

      expect(await subRow(s.sub)).toBeUndefined();
      expect(await paid(s.workspaceId)).toBe(false);
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });
    });

    it("the proof is per customer: another customer's one-off invoice does not count for this one", async () => {
      const s = await scenario();
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: secondsAgo(2) }));
      await send("invoice.paid", oneOffInvoice({ customer: uid("cus"), amountPaid: 4700 }));

      expect(await paid(s.workspaceId)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CI flake of the R5-h test: Stripe sends a new subscription's checkout and subscription event together and both save
  // the same NEW customer. `billing_customers` has two unique keys (workspace, customer) and the upsert arbitrates on the
  // workspace only, so the statement that loses could fail on the customer key while the first one commits (500).
  describe("saveBillingCustomer under concurrency", () => {
    const ROUNDS = 60;
    const warmPool = () => Promise.all(Array.from({ length: 8 }, () => m.db.execute(sql`select pg_sleep(0.05)`)));
    const rowsOf = (workspaceId: string) =>
      h.db.select().from(m.schema.billingCustomers).where(eq(m.schema.billingCustomers.workspaceId, workspaceId));

    /** `ROUNDS` workspaces in one statement (a seed per round would dominate the time of the test). */
    async function workspaces(count: number) {
      const rows = await h.db.insert(m.schema.workspaces)
        .values(Array.from({ length: count }, () => { const slug = uid("w"); return { name: slug, slug }; }))
        .returning({ id: m.schema.workspaces.id });
      workspaceIds.push(...rows.map((row) => row.id));
      return rows.map((row) => row.id);
    }

    // Two callers: the checkout and the subscription's own event. With 3 or 4 simultaneous callers Postgres can pick a
    // DEADLOCK victim instead (measured: about 1 in 1,500 rounds with 4 callers, none in 1,800 rounds with 2): a different,
    // rarer failure that the unique-violation retry does not cover, so a test with more callers would be flaky.
    it("two simultaneous saves of the same new (workspace, customer) both resolve and leave exactly one row", async () => {
      await warmPool();
      const ids = await workspaces(ROUNDS);
      for (const [round, workspaceId] of ids.entries()) {
        const customer = uid("cus");
        const callers = 2;
        const results = await Promise.allSettled(
          Array.from({ length: callers }, () => m.repo.saveBillingCustomer({ workspaceId, stripeCustomerId: customer })),
        );

        expect(results.map((r) => r.status), `round ${round}: ${results.map((r) => (r.status === "rejected" ? String(r.reason?.cause?.message ?? r.reason) : "ok")).join(" | ")}`)
          .toEqual(Array(callers).fill("fulfilled"));
        const rows = await rowsOf(workspaceId);
        expect(rows, `round ${round}`).toHaveLength(1);
        expect(rows[0]).toMatchObject({ workspaceId, stripeCustomerId: customer });
      }
    }, 60_000);

    it("a save of the same customer again later (no race) is an update of the same row", async () => {
      const [workspaceId] = await workspaces(1);
      const customer = uid("cus");
      const first = await m.repo.saveBillingCustomer({ workspaceId: workspaceId!, stripeCustomerId: customer });
      const second = await m.repo.saveBillingCustomer({ workspaceId: workspaceId!, stripeCustomerId: customer });

      expect(second!.id).toBe(first!.id);
      expect(await rowsOf(workspaceId!)).toHaveLength(1);
    });

    it("control: a customer already bound to workspace A is NOT taken by workspace B; the retry does not hide a real conflict", async () => {
      const [a, b] = await workspaces(2);
      const customer = uid("cus");
      const bound = await m.repo.saveBillingCustomer({ workspaceId: a!, stripeCustomerId: customer });

      const attempt = await m.repo.saveBillingCustomer({ workspaceId: b!, stripeCustomerId: customer }).then(() => null, (error: unknown) => error);

      expect(attempt).not.toBeNull();
      const driverError = ((attempt as { cause?: unknown }).cause ?? attempt) as { code?: string; constraint?: string };
      expect(driverError.code).toBe("23505");
      expect(driverError.constraint).toBe("billing_customers_stripe_customer_id_unique");
      const rowA = await rowsOf(a!);
      expect(rowA).toHaveLength(1);
      expect(rowA[0]).toMatchObject({ id: bound!.id, workspaceId: a, stripeCustomerId: customer });
      expect(await rowsOf(b!)).toEqual([]);
    });

    it("control: the same workspace saving a NEW customer replaces its customer id (the existing update path)", async () => {
      const [workspaceId] = await workspaces(1);
      await m.repo.saveBillingCustomer({ workspaceId: workspaceId!, stripeCustomerId: uid("cus") });
      const next = uid("cus");

      await m.repo.saveBillingCustomer({ workspaceId: workspaceId!, stripeCustomerId: next });

      const rows = await rowsOf(workspaceId!);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeCustomerId).toBe(next);
    });
  });

  it("the signature is the real one: a body signed with another secret is refused and nothing is recorded", async () => {
    const eventId = `${EVENT_PREFIX}${uid("bad")}`;
    const payload = JSON.stringify({ id: eventId, object: "event", type: "invoice.paid", data: { object: oneOffInvoice({ customer: uid("cus"), amountPaid: 100 }) } });
    const signature = m.stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });

    const res = await m.route.POST(new Request("http://localhost/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));

    expect(res.status).toBe(400);
    expect(await eventRow(eventId)).toBeUndefined();
    expect((await res.json()).code).toBe("stripeSignatureInvalid");
  });
});
