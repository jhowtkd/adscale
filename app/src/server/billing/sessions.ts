import { env } from "@/server/validation/env";
import {
  getBillingCustomerByWorkspace,
  saveBillingCustomer,
} from "@/server/repositories/billing";
import type { BillingPlanKey } from "./plans";
import { getStripePriceId } from "./plans";
import { stripe } from "./stripe";

type BillingWorkspace = {
  id: string;
  name?: string | null;
};

type BillingUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

async function getOrCreateStripeCustomer(workspace: BillingWorkspace, user: BillingUser) {
  const existing = await getBillingCustomerByWorkspace(workspace.id);
  if (existing) {
    return existing.stripeCustomerId;
  }

  const customer = await stripe.customers.create(
    {
      email: user.email ?? undefined,
      name: workspace.name ?? user.name ?? undefined,
      metadata: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    { idempotencyKey: `billing-customer:${workspace.id}` }
  );

  await saveBillingCustomer({
    workspaceId: workspace.id,
    stripeCustomerId: customer.id,
  });

  const persisted = await getBillingCustomerByWorkspace(workspace.id);
  return persisted?.stripeCustomerId ?? customer.id;
}

function urlWithReturnPath(baseUrl: string, returnPath?: string) {
  if (!returnPath || !returnPath.startsWith("/")) {
    return baseUrl;
  }
  const url = new URL(baseUrl);
  url.searchParams.set("returnPath", returnPath);
  return url.toString();
}

export async function createCheckoutSession(input: {
  workspace: BillingWorkspace;
  user: BillingUser;
  planKey: BillingPlanKey;
  returnPath?: string;
}) {
  const customerId = await getOrCreateStripeCustomer(input.workspace, input.user);
  const priceId = getStripePriceId(input.planKey);
  const successUrl = urlWithReturnPath(env.STRIPE_SUCCESS_URL, input.returnPath);
  const cancelUrl = urlWithReturnPath(env.STRIPE_CANCEL_URL, input.returnPath);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.workspace.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      workspaceId: input.workspace.id,
      userId: input.user.id,
      planKey: input.planKey,
    },
    subscription_data: {
      metadata: {
        workspaceId: input.workspace.id,
        planKey: input.planKey,
      },
    },
  });
}

export async function createPortalSession(input: {
  workspace: BillingWorkspace;
}) {
  const existing = await getBillingCustomerByWorkspace(input.workspace.id);
  if (!existing) {
    return null;
  }

  return stripe.billingPortal.sessions.create({
    customer: existing.stripeCustomerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });
}

