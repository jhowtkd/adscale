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
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),
  APP_URL: z.string().url(),
  STRIPE_SECRET_KEY: stripeServerKeySchema,
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_STARTER_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_GROWTH_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SCALE_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
  ZEP_API_KEY: z.string().optional(),
  ZEP_ENABLED: z.string().optional(),
  ZEP_GRAPH_PREFIX: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

export const env: z.infer<typeof envSchema> = parsed.success
  ? parsed.data
  : new Proxy({} as z.infer<typeof envSchema>, {
      get(_, key: string) {
        const issue = parsed.error.issues.find((i) => i.path[0] === key);
        if (issue) {
          if (process.env.NODE_ENV === "test") {
            return undefined;
          }
          throw new Error(`Env validation failed for ${key}: ${issue.message}`);
        }
        return process.env[key];
      },
    });
