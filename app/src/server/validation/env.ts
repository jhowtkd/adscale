import { z } from "zod";

const stripeServerKeySchema = z.string().refine((value) => value.startsWith("sk_") || value.startsWith("rk_"), {
  message: "Stripe server key must start with sk_ or rk_",
});

/**
 * Inngest signing key must be a real secret in production. The dev default
 * "local" disables signature verification and lets anyone POST fake jobs.
 */
const inngestSigningKeySchema = z.string().refine((value) => {
  if (process.env.NODE_ENV === "production" && value === "local") return false;
  return true;
}, {
  message: 'INNGEST_SIGNING_KEY must be a real secret in production (got "local")',
});

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5.6-sol"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2-2026-04-21"),
  FAL_KEY: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),
  R2_PUBLIC_BASE_URL: z.string().url(),
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: inngestSigningKeySchema,
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),
  APP_URL: z.string().url(),
  MARKETING_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: stripeServerKeySchema,
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_STARTER_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_GROWTH_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SCALE_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
  MEM0_API_KEY: z.string().optional(),
  MEM0_ENABLED: z.string().optional(),
  MEM0_USER_PREFIX: z.string().optional(),
  MEM0_ORGANIZATION_ID: z.string().optional(),
  MEM0_PROJECT_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  BETA_ACCESS_CODES: z.string().optional(),
  NOTIFICATION_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Temporary rollout switch (R-011): steers NEW creative work preparations
   * to the quality-recovery policy. Jobs follow the version frozen in each
   * work's input snapshot, never this live value. Removed after Gate 8.
   */
  CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  /** New Peça única snapshots consume the active published Brand Cortex version. */
  BRAND_CORTEX_SINGLE_PIECE_ENABLED: z.enum(["true", "false"]).default("false"),
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
