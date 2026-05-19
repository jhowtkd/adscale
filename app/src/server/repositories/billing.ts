import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "../db";
import {
  billingCustomers,
  creditGrants,
  processedStripeEvents,
  subscriptions,
} from "../db/schema";

export async function getBillingCustomerByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.workspaceId, workspaceId))
    .limit(1);

  return rows[0] ?? null;
}

export async function saveBillingCustomer(data: {
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
        inArray(subscriptions.status, ["active", "trialing"])
      )
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getAvailableCreditGrants(workspaceId: string) {
  return db
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
}

export async function updateCreditGrantRemaining(id: string, remaining: number) {
  const rows = await db
    .update(creditGrants)
    .set({ remaining })
    .where(eq(creditGrants.id, id))
    .returning();

  return rows[0];
}
