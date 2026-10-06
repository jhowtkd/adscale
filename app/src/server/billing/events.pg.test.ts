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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  const [free, route, stripeModule, access, plan, commands, repo, schema, equipeSchema, dbModule] = await Promise.all([
    import("../equipe/module/testing/free-pg"), import("@/app/api/billing/webhook/route"), import("./stripe"),
    import("./access"), import("../equipe/module/free-plan"), import("../equipe/module/commands"),
    import("@/server/repositories/billing"), import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("@/server/db"),
  ]);
  return { free, route, stripe: stripeModule.stripe, access, plan, commands, repo, schema, equipeSchema, db: dbModule.db };
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
    retrieve = vi.spyOn(m.stripe.subscriptions, "retrieve").mockImplementation((() => {
      throw new Error("unexpected stripe.subscriptions.retrieve");
    }) as never);
  }, 60_000);

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
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: secondsAgo(8) }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

      expect(await paid(s.workspaceId)).toBe(false);
      expect(await rule(s.workspaceId)).toEqual({ accountId: null });
      expect(await product(s.workspaceId)).toBe(true);
    });

    it("control: no period anywhere -> currentPeriodEnd null, and the free plan (a period it does not know is refused)", async () => {
      const s = await scenario();
      await send("customer.subscription.updated", subscriptionObject({ id: s.sub, customer: s.customer, workspaceId: s.workspaceId, status: "past_due", periodEnd: null }));
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

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
      await send("invoice.paid", subscriptionInvoice({ customer: s.customer, subscription: s.sub, amountPaid: 4700 }));

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
