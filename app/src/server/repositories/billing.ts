import { eq } from "drizzle-orm";

import { db } from "../db";
import {
  billingCustomers,
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
