import { beforeAll, describe, expect, it } from "vitest";

const baseEnv = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/adscale?sslmode=disable",
  BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  OPENAI_API_KEY: "sk-test",
  OPENAI_TEXT_MODEL: "gpt-5-mini",
  OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  R2_ACCOUNT_ID: "r2-account",
  R2_ACCESS_KEY_ID: "r2-key",
  R2_SECRET_ACCESS_KEY: "r2-secret",
  R2_BUCKET: "adscale",
  R2_PUBLIC_BASE_URL: "https://assets.example.com",
  INNGEST_EVENT_KEY: "event-key",
  INNGEST_SIGNING_KEY: "signing-key",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "ADScale <onboarding@example.com>",
  APP_URL: "http://localhost:3000",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_STARTER_PRICE_ID: "price_starter",
  STRIPE_GROWTH_PRICE_ID: "price_growth",
  STRIPE_SCALE_PRICE_ID: "price_scale",
  STRIPE_SUCCESS_URL: "http://localhost:3000/settings?checkout=success",
  STRIPE_CANCEL_URL: "http://localhost:3000/settings?checkout=cancelled",
};

describe("envSchema", () => {
  let schema: typeof import("./env").envSchema;

  beforeAll(async () => {
    Object.assign(process.env, { ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" });
    schema = (await import("./env")).envSchema;
  });

  it("accepts Stripe secret keys", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).STRIPE_SECRET_KEY).toBe(
      "sk_test_dummy"
    );
  });

  it("accepts Stripe restricted keys for safer local smoke testing", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "rk_test_dummy" }).STRIPE_SECRET_KEY).toBe(
      "rk_test_dummy"
    );
  });

  it("rejects publishable Stripe keys", () => {
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "pk_test_dummy" })).toThrow();
  });
});
