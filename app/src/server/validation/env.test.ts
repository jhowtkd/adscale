import { beforeAll, describe, expect, it } from "vitest";

const baseEnv = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/adscale?sslmode=disable",
  BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  OPENAI_API_KEY: "sk-test",
  OPENAI_TEXT_MODEL: "gpt-5.6-sol",
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

  it("accepts optional Mem0 memory configuration", () => {
    expect(
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        MEM0_ENABLED: "true",
        MEM0_API_KEY: "m0_test_key",
        MEM0_USER_PREFIX: "adscale_test",
      })
    ).toMatchObject({
      MEM0_ENABLED: "true",
      MEM0_API_KEY: "m0_test_key",
      MEM0_USER_PREFIX: "adscale_test",
    });
  });

  it("defaults the creative work quality recovery switch to disabled", () => {
    expect(
      schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" })
        .CREATIVE_WORK_QUALITY_RECOVERY_ENABLED
    ).toBe("false");
  });

  it("accepts explicit true/false for the quality recovery switch", () => {
    expect(
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: "true",
      }).CREATIVE_WORK_QUALITY_RECOVERY_ENABLED
    ).toBe("true");
    expect(
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: "false",
      }).CREATIVE_WORK_QUALITY_RECOVERY_ENABLED
    ).toBe("false");
  });

  it("rejects non-boolean values for the quality recovery switch", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: "yes",
      })
    ).toThrow();
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: "1",
      })
    ).toThrow();
  });

  it("keeps the Brand Cortex Peça única rollout disabled unless explicitly enabled", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).BRAND_CORTEX_SINGLE_PIECE_ENABLED).toBe("false");
    expect(schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      BRAND_CORTEX_SINGLE_PIECE_ENABLED: "true",
    }).BRAND_CORTEX_SINGLE_PIECE_ENABLED).toBe("true");
    expect(() => schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      BRAND_CORTEX_SINGLE_PIECE_ENABLED: "yes",
    })).toThrow();
  });
});
