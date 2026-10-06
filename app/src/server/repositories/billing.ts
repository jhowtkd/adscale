import { and, asc, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../db";
import {
  billingCustomers,
  creditGrants,
  processedStripeEvents,
  subscriptions,
} from "../db/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getBillingCustomerByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.workspaceId, workspaceId))
    .limit(1);

  return rows[0] ?? null;
}

/** 23505 (unique violation) and 40P01 (deadlock): what two saves of the same new customer at once can raise. */
const CONCURRENT_SAVE_SQLSTATES: ReadonlySet<unknown> = new Set(["23505", "40P01"]);

/** The installed Drizzle carries the SQLSTATE on the driver error (`cause`), some drivers on the error itself. */
function isConcurrentSaveConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; cause?: unknown };
  if (CONCURRENT_SAVE_SQLSTATES.has(record.code)) return true;
  return typeof record.cause === "object" && record.cause !== null && CONCURRENT_SAVE_SQLSTATES.has((record.cause as { code?: unknown }).code);
}

/** At most this many runs of the save after the first one fails on a concurrent save. */
export const SAVE_BILLING_CUSTOMER_RETRIES = 2;

/**
 * The workspace's Stripe customer. Stripe sends a new subscription's events together (the checkout, the subscription's
 * own event, an invoice), and each saves the same new customer. The statement arbitrates on the workspace, so a loser
 * can fail on the OTHER unique key, the customer id (23505), or be picked as a deadlock victim (40P01), while another
 * commits. The whole statement is idempotent and, once the row is committed, an update of it: it runs again, at most
 * `SAVE_BILLING_CUSTOMER_RETRIES` more times. A customer bound to another workspace still fails (23505).
 */
export async function saveBillingCustomer(data: {
  workspaceId: string;
  stripeCustomerId: string;
}) {
  for (let retry = 0; ; retry += 1) {
    try {
      return await upsertBillingCustomer(data);
    } catch (error) {
      if (retry >= SAVE_BILLING_CUSTOMER_RETRIES || !isConcurrentSaveConflict(error)) throw error;
    }
  }
}

async function upsertBillingCustomer(data: {
  workspaceId: string;
  stripeCustomerId: string;
}) {
  const rows = await db
    .insert(billingCustomers)
    .values({
      workspaceId: data.workspaceId,
      stripeCustomerId: data.stripeCustomerId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: billingCustomers.workspaceId,
      set: {
        stripeCustomerId: data.stripeCustomerId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0];
}

export async function getSubscriptionByStripeSubscriptionId(
  stripeSubscriptionId: string
) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertSubscription(data: {
  workspaceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  planKey: string;
  priceId: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const rows = await db
    .insert(subscriptions)
    .values({
      workspaceId: data.workspaceId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripeCustomerId: data.stripeCustomerId,
      status: data.status,
      planKey: data.planKey,
      priceId: data.priceId,
      currentPeriodStart: data.currentPeriodStart ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        workspaceId: data.workspaceId,
        stripeCustomerId: data.stripeCustomerId,
        status: data.status,
        planKey: data.planKey,
        priceId: data.priceId,
        currentPeriodStart: data.currentPeriodStart ?? null,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0];
}

/** The states a completed checkout may move up from: its own re-delivery, and a first payment still pending. */
const CHECKOUT_REPLACEABLE_STATUS = ["checkout_completed", "incomplete"];

/**
 * The subscription a completed checkout names. Stripe does not order its events, so the checkout may arrive after the
 * subscription's own events: it creates the row, or moves it up from `CHECKOUT_REPLACEABLE_STATUS`, and never takes a
 * state those events set (active, past_due, trialing, canceled…) back to `checkout_completed`. It never writes the
 * period, which only the subscription events know. One statement, so a subscription event committed meanwhile is kept.
 * Null when the row was kept.
 */
export async function recordCheckoutSubscription(data: {
  workspaceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  planKey: string;
  priceId: string;
}) {
  const fields = {
    workspaceId: data.workspaceId,
    stripeCustomerId: data.stripeCustomerId,
    status: "checkout_completed",
    planKey: data.planKey,
    priceId: data.priceId,
    updatedAt: new Date(),
  };
  const rows = await db
    .insert(subscriptions)
    .values({ ...fields, stripeSubscriptionId: data.stripeSubscriptionId })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: fields,
      setWhere: inArray(subscriptions.status, CHECKOUT_REPLACEABLE_STATUS),
    })
    .returning();

  return rows[0] ?? null;
}

export async function hasProcessedStripeEvent(stripeEventId: string) {
  const rows = await db
    .select({ id: processedStripeEvents.id })
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.stripeEventId, stripeEventId))
    .limit(1);

  return rows.length > 0;
}

export async function recordProcessedStripeEvent(data: {
  stripeEventId: string;
  type: string;
  payload?: unknown;
}) {
  const rows = await db
    .insert(processedStripeEvents)
    .values({
      stripeEventId: data.stripeEventId,
      type: data.type,
      payload: data.payload,
    })
    .returning();

  return rows[0];
}

export async function getActiveSubscriptionByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        inArray(subscriptions.status, ["active", "trialing", "checkout_completed"])
      )
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Whether the Stripe customer ever paid an invoice with money (ticket 11, part 2): an `invoice.paid` event, as the
 * webhook received and recorded it, with `amount_paid > 0`. The event payload is the record, not the credit grant: a
 * grant is also made for a paid invoice of zero (a trial start, a 100% promotion code).
 */
export async function hasPaidStripeInvoiceForCustomer(stripeCustomerId: string): Promise<boolean> {
  const rows = await db
    .select({ id: processedStripeEvents.id })
    .from(processedStripeEvents)
    .where(
      and(
        eq(processedStripeEvents.type, "invoice.paid"),
        sql`${processedStripeEvents.payload} #>> '{data,object,customer}' = ${stripeCustomerId}`,
        sql`coalesce((${processedStripeEvents.payload} #>> '{data,object,amount_paid}')::bigint, 0) > 0`
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function getLatestSubscriptionByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getCreditGrantBySourceId(
  source: string,
  sourceId: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .select()
    .from(creditGrants)
    .where(and(eq(creditGrants.source, source), eq(creditGrants.sourceId, sourceId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getCreditGrantHistoryForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(creditGrants)
    .where(eq(creditGrants.workspaceId, workspaceId))
    .orderBy(desc(creditGrants.createdAt));
}

export async function getAvailableCreditGrants(workspaceId: string, tx?: DbOrTx, lock = false) {
  const client = tx ?? db;
  const query = client
    .select()
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.workspaceId, workspaceId),
        gt(creditGrants.remaining, 0),
        or(isNull(creditGrants.expiresAt), gt(creditGrants.expiresAt, new Date()))
      )
    )
    .orderBy(asc(creditGrants.expiresAt), asc(creditGrants.createdAt));

  if (lock) {
    return query.for('update');
  }
  return query;
}

/**
 * Grants eligible to receive a refund, including fully depleted (remaining = 0)
 * non-expired rows. Spend drains FIFO; refund prefers a positive grant, else the
 * last drained grant in that same order so a zeroed wallet can still be restored.
 */
export async function getRefundableCreditGrants(workspaceId: string, tx?: DbOrTx, lock = false) {
  const client = tx ?? db;
  const query = client
    .select()
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.workspaceId, workspaceId),
        gte(creditGrants.remaining, 0),
        or(isNull(creditGrants.expiresAt), gt(creditGrants.expiresAt, new Date()))
      )
    )
    .orderBy(asc(creditGrants.expiresAt), asc(creditGrants.createdAt));

  if (lock) {
    return query.for("update");
  }
  return query;
}

export function pickRefundTargetGrant<T extends { remaining: number }>(
  grants: T[]
): T | null {
  if (grants.length === 0) return null;
  const withBalance = grants.find((grant) => grant.remaining > 0);
  return withBalance ?? grants[grants.length - 1] ?? null;
}

export async function updateCreditGrantRemaining(id: string, remaining: number, tx?: DbOrTx) {
  const client = tx ?? db;
  const rows = await client
    .update(creditGrants)
    .set({ remaining })
    .where(eq(creditGrants.id, id))
    .returning();

  return rows[0];
}

export async function createCreditGrant(
  data: {
    workspaceId: string;
    source: string;
    sourceId?: string | null;
    amount: number;
    expiresAt?: Date | null;
  },
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const insert = client
    .insert(creditGrants)
    .values({
      workspaceId: data.workspaceId,
      source: data.source,
      sourceId: data.sourceId ?? null,
      amount: data.amount,
      remaining: data.amount,
      expiresAt: data.expiresAt ?? null,
    });
  const rows = data.sourceId
    ? await insert.onConflictDoNothing().returning()
    : await insert.returning();

  if (rows[0]) return rows[0];

  if (data.sourceId) {
    const existing = await getCreditGrantBySourceId(data.source, data.sourceId, client);
    if (existing) return existing;
  }

  throw new Error("credit_grant_insert_failed");
}
