import Stripe from "stripe";
import "server-only";

import { env } from "@/server/validation/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  timeout: 20_000,
  maxNetworkRetries: 2,
});

