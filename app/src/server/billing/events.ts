import type Stripe from "stripe";

import {
  createCreditGrant,
  getCreditGrantBySourceId,
  getSubscriptionByStripeSubscriptionId,
  hasProcessedStripeEvent,
  recordCheckoutSubscription,
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

/** The subscription's plan item: the one whose price is a plan's, else the first. */
function planSubscriptionItem(subscription: Stripe.Subscription) {
  const items = subscription.items?.data ?? [];
  return items.find((item) => getPlanKeyForStripePriceId(item.price.id) !== null) ?? items[0] ?? null;
}

/**
 * The current period. Since the Basil API (2025-03-31; the SDK's default is later) Stripe sends it on the subscription's
 * items, no longer on the subscription; a payload of an older API version still carries it on top. Unknown stays null:
 * the `past_due` grace of the paid access refuses a period it does not know (ticket 11, part 2).
 */
function subscriptionPeriod(subscription: Stripe.Subscription, item: Stripe.SubscriptionItem | null) {
  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const itemPeriod = item as Partial<Pick<Stripe.SubscriptionItem, "current_period_start" | "current_period_end">> | null;
  return {
    currentPeriodStart: dateFromStripeSeconds(itemPeriod?.current_period_start ?? legacy.current_period_start),
    currentPeriodEnd: dateFromStripeSeconds(itemPeriod?.current_period_end ?? legacy.current_period_end),
  };
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
  // Stripe does not order its events: a checkout delivered after the subscription's own events must not take a
  // confirmed subscription (active, past_due…) back to `checkout_completed`.
  await recordCheckoutSubscription({
    workspaceId,
    stripeCustomerId,
    stripeSubscriptionId,
    planKey,
    priceId: getStripePriceId(planKey as Parameters<typeof getStripePriceId>[0]),
  });
}

async function processSubscriptionChanged(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  await syncSubscription(subscription);
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = stringId(subscription.customer);
  const planItem = planSubscriptionItem(subscription);
  const priceId = planItem?.price.id ?? null;
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
    ...subscriptionPeriod(subscription, planItem),
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
    // A one-off invoice grants no monthly credit, but it is a payment of the customer: the event is recorded as any
    // other, and the paid-invoice proof of the `past_due` grace counts it (`hasPaidStripeInvoiceForCustomer`).
    return;
  }

  let subscription = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  // Stripe does not order its events: a local row that is not active (none yet, checkout_completed, incomplete, or a
  // past_due this payment just recovered) may be behind the subscription. Stripe's own state decides the grant, once.
  if (!subscription || subscription.status !== "active") {
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
  if (!subscription || subscription.status === "checkout_completed") {
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
