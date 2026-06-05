/**
 * Replace the offline dev-billing customer (cus_dev_*) with a REAL Stripe test
 * customer so the billing checkout (TC011) and customer portal (TC013) work
 * against real test-mode keys.
 *
 * Requires real STRIPE_* test values in .env.local (sk_test_..., price_...).
 *
 * Usage:
 *   npx tsx scripts/seed-stripe-real.ts [--email=dev-admin@adscale.local]
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { user, workspaceMembers } from "../src/server/db/schema";
import { env } from "../src/server/validation/env";
import { stripe } from "../src/server/billing/stripe";
import { getStripePriceId } from "../src/server/billing/plans";
import {
  getBillingCustomerByWorkspace,
  saveBillingCustomer,
  upsertSubscription,
} from "../src/server/repositories/billing";

function arg(name: string, fallback: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

async function resolveWorkspace(email: string) {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  if (!account[0]) throw new Error(`No user ${email}. Run seed-dev-admin first.`);

  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account[0].id))
    .limit(1);
  if (!membership[0]) throw new Error(`User ${email} has no workspace.`);

  return {
    userId: account[0].id,
    email: account[0].email,
    name: account[0].name,
    workspaceId: membership[0].workspaceId,
  };
}

async function ensurePortalConfiguration() {
  const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (configs.data.length > 0) return configs.data[0].id;

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "ADScale (test) — manage your subscription",
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  return created.id;
}

async function main() {
  if (env.STRIPE_SECRET_KEY.includes("replace")) {
    throw new Error("STRIPE_SECRET_KEY is still a placeholder. Add real test keys first.");
  }

  const ws = await resolveWorkspace(arg("email", "dev-admin@adscale.local"));
  const existing = await getBillingCustomerByWorkspace(ws.workspaceId);

  // If a real customer already exists in Stripe, reuse it; otherwise create one.
  let customerId = existing?.stripeCustomerId ?? "";
  let needsCreate = true;
  if (customerId && !customerId.startsWith("cus_dev_")) {
    try {
      const c = await stripe.customers.retrieve(customerId);
      needsCreate = (c as { deleted?: boolean }).deleted === true;
    } catch {
      needsCreate = true;
    }
  }

  if (needsCreate) {
    const customer = await stripe.customers.create({
      email: ws.email ?? undefined,
      name: ws.name ?? "ADScale Dev Admin",
      metadata: { workspaceId: ws.workspaceId, userId: ws.userId, seeded: "e2e" },
    });
    customerId = customer.id;
    await saveBillingCustomer({ workspaceId: ws.workspaceId, stripeCustomerId: customerId });
  }

  // Attach a test payment method + create a real subscription (scale plan).
  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const priceId = getStripePriceId("scale");
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata: { workspaceId: ws.workspaceId, planKey: "scale" },
  });

  await upsertSubscription({
    workspaceId: ws.workspaceId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status: subscription.status,
    planKey: "scale",
    priceId,
    currentPeriodStart: subscription.items.data[0]?.current_period_start
      ? new Date(subscription.items.data[0].current_period_start * 1000)
      : new Date(),
    currentPeriodEnd: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  const portalConfigId = await ensurePortalConfiguration();

  // Smoke-test: portal + checkout sessions can be created.
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
  });

  console.log("\nReal Stripe test billing wired up:");
  console.log("  workspace:        ", ws.workspaceId);
  console.log("  customer:         ", customerId);
  console.log("  subscription:     ", subscription.id, `(${subscription.status})`);
  console.log("  portal config:    ", portalConfigId);
  console.log("  portal session:   ", portal.url ? "OK" : "FAILED");
  console.log("  checkout session: ", checkout.url ? "OK" : "FAILED");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
