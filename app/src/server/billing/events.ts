import type Stripe from "stripe";

import {
  createCreditGrant,
  getCreditGrantBySourceId,
  getSubscriptionByStripeSubscriptionId,
  hasProcessedStripeEvent,
  recordProcessedStripeEvent,
  saveBillingCustomer,
  upsertSubscription,
} from "@/server/repositories/billing";
import {
  getPlanKeyForStripePriceId,
  getStripePriceId,
  planCreditGrants,
} from "./plans";
import { stripe } from "./stripe";

export type StripeEventProcessResult =
  | { status: "processed"; type: string }
  | { status: "skipped"; reason: "already_processed" | "unsupported_event" };

function stringId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function dateFromStripeSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function firstSubscriptionPriceId(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const legacyInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const currentInvoice = invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
    lines?: {
      data?: Array<{
        parent?: {
          subscription_item_details?: {
            subscription?: string | Stripe.Subscription | null;
          } | null;
        } | null;
      }>;
    };
  };

  return (
    stringId(legacyInvoice.subscription) ??
    stringId(currentInvoice.parent?.subscription_details?.subscription) ??
    stringId(currentInvoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription)
  );
}

async function processCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const workspaceId = session.metadata?.workspaceId;
  const planKey = session.metadata?.planKey;
  const stripeCustomerId = stringId(session.customer);
  const stripeSubscriptionId = stringId(session.subscription);

  if (!workspaceId || !planKey || !stripeCustomerId || !stripeSubscriptionId) {
    throw new Error("Missing checkout session billing metadata");
  }

  await saveBillingCustomer({ workspaceId, stripeCustomerId });
  await upsertSubscription({
    workspaceId,
    stripeCustomerId,
    stripeSubscriptionId,
    status: "checkout_completed",
    planKey,
    priceId: getStripePriceId(planKey as Parameters<typeof getStripePriceId>[0]),
  });
}

async function processSubscriptionChanged(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  await syncSubscription(subscription);
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const subscriptionPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = stringId(subscription.customer);
  const priceId = firstSubscriptionPriceId(subscription);
  const existing = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  const workspaceId = subscription.metadata.workspaceId ?? existing?.workspaceId;
  const planKey =
    subscription.metadata.planKey ??
    (priceId ? getPlanKeyForStripePriceId(priceId) : null) ??
    existing?.planKey;

  if (!workspaceId || !stripeCustomerId || !priceId || !planKey) {
    throw new Error("Missing subscription billing metadata");
  }

  await saveBillingCustomer({ workspaceId, stripeCustomerId });
  return upsertSubscription({
    workspaceId,
    stripeCustomerId,
    stripeSubscriptionId,
    status: subscription.status,
    planKey,
    priceId,
    currentPeriodStart: dateFromStripeSeconds(subscriptionPeriod.current_period_start),
    currentPeriodEnd: dateFromStripeSeconds(subscriptionPeriod.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function processInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.id) {
    throw new Error("Missing invoice id");
  }

  const existingGrant = await getCreditGrantBySourceId("stripe_invoice", invoice.id);
  if (existingGrant) {
    return;
  }

  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    throw new Error("Missing invoice subscription");
  }

  let subscription = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  if (!subscription) {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    subscription = await syncSubscription(stripeSubscription);
  }
  if (!subscription) {
    throw new Error("Missing local subscription for paid invoice");
  }

  // Suspend new monthly grants while subscription is not in good standing (DUEN-01).
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return;
  }

  const amount = planCreditGrants[subscription.planKey as keyof typeof planCreditGrants];
  if (!amount) {
    throw new Error("Missing credit grant amount for plan");
  }

  await createCreditGrant({
    workspaceId: subscription.workspaceId,
    source: "stripe_invoice",
    sourceId: invoice.id,
    amount,
    expiresAt: subscription.currentPeriodEnd,
  });
}

async function processInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    throw new Error("Missing invoice subscription");
  }

  let subscription = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  if (!subscription) {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    subscription = await syncSubscription(stripeSubscription);
  }
  if (!subscription) {
    throw new Error("Missing local subscription for failed invoice");
  }

  // Mark subscription as past_due if it's the first failed payment
  if (subscription.status === "active" || subscription.status === "trialing") {
    await upsertSubscription({
      workspaceId: subscription.workspaceId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: "past_due",
      planKey: subscription.planKey,
      priceId: subscription.priceId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  }
}

export async function processStripeEvent(event: Stripe.Event): Promise<StripeEventProcessResult> {
  if (await hasProcessedStripeEvent(event.id)) {
    return { status: "skipped", reason: "already_processed" };
  }

  switch (event.type) {
    case "checkout.session.completed":
      await processCheckoutCompleted(event);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await processSubscriptionChanged(event);
      break;
    case "invoice.paid":
      await processInvoicePaid(event);
      break;
    case "invoice.payment_failed":
      await processInvoicePaymentFailed(event);
      break;
    default:
      return { status: "skipped", reason: "unsupported_event" };
  }

  await recordProcessedStripeEvent({
    stripeEventId: event.id,
    type: event.type,
    payload: event,
  });

  return { status: "processed", type: event.type };
}
