import Stripe from "stripe";

import { env } from "@/server/validation/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

