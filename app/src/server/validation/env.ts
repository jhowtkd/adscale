import { z } from "zod";

const stripeServerKeySchema = z.string().refine((value) => value.startsWith("sk_") || value.startsWith("rk_"), {
  message: "Stripe server key must start with sk_ or rk_",
});

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2-2026-04-21"),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),
  R2_PUBLIC_BASE_URL: z.string().url(),
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: z.string(),
  APP_URL: z.string().url(),
  STRIPE_SECRET_KEY: stripeServerKeySchema,
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_STARTER_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_GROWTH_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SCALE_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
