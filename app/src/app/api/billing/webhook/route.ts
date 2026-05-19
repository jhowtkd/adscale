import { NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api-response";
import { processStripeEvent } from "@/server/billing/events";
import { stripe } from "@/server/billing/stripe";
import { env } from "@/server/validation/env";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return apiError("stripeSignatureMissing", 400);
    }

    const body = await request.text();
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return apiError("stripeSignatureInvalid", 400);
    }

    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    return handleApiError(error, "billing.webhook.POST");
  }
}

