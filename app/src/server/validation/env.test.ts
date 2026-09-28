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

  it("defaults and bounds the Studio rollout percentage", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).STUDIO_PROGRESSIVE_ROLLOUT_PERCENT).toBe(0);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_PROGRESSIVE_ROLLOUT_PERCENT: "100" }).STUDIO_PROGRESSIVE_ROLLOUT_PERCENT).toBe(100);
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_PROGRESSIVE_ROLLOUT_PERCENT: "101" })).toThrow();
  });

  it("defaults the Studio entry interview rollout to zero and bounds it like the progressive one", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT).toBe(0);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT: "100" }).STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT).toBe(100);
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT: "101" })).toThrow();
  });

  it("defaults the Studio carousel rollout to zero and bounds it like the progressive one", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).STUDIO_CAROUSEL_ROLLOUT_PERCENT).toBe(0);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "25" }).STUDIO_CAROUSEL_ROLLOUT_PERCENT).toBe(25);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "100" }).STUDIO_CAROUSEL_ROLLOUT_PERCENT).toBe(100);
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "-1" })).toThrow();
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "101" })).toThrow();
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "abc" })).toThrow();
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", STUDIO_CAROUSEL_ROLLOUT_PERCENT: "2.5" })).toThrow();
  });

  it("defaults the sunburst image rollout to zero with max quality and bounds the percent", () => {
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).OPENAI_IMAGE_SUNBURST_PERCENT).toBe(0);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" }).OPENAI_IMAGE_SUNBURST_QUALITY).toBe("max");
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", OPENAI_IMAGE_SUNBURST_PERCENT: "100" }).OPENAI_IMAGE_SUNBURST_PERCENT).toBe(100);
    expect(schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", OPENAI_IMAGE_SUNBURST_QUALITY: "high" }).OPENAI_IMAGE_SUNBURST_QUALITY).toBe("high");
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", OPENAI_IMAGE_SUNBURST_PERCENT: "101" })).toThrow();
    expect(() => schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", OPENAI_IMAGE_SUNBURST_QUALITY: "ultra" })).toThrow();
  });

  it("defaults the Equipe agent models, efforts, and AI budget", () => {
    const parsed = schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy" });
    expect(parsed.EQUIPE_MODEL_STRATEGIST).toBe("claude-opus-5-5");
    expect(parsed.EQUIPE_MODEL_RESEARCH).toBe("muse-spark-1.3-contributor");
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("claude-opus-5-5");
    expect(parsed.EQUIPE_EFFORT_STRATEGIST).toBe("high");
    expect(parsed.EQUIPE_EFFORT_RESEARCH).toBe("xhigh");
    expect(parsed.EQUIPE_EFFORT_REVIEWER).toBe("high");
    expect(parsed.META_MODEL_API_KEY).toBeUndefined();
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
    expect(parsed.EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS).toBe(100000);
  });

  it("refuses a reviewer model equal to the research model while the Equipe is on", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        META_MODEL_API_KEY: "meta-test",
        ANTHROPIC_API_KEY: "anthropic-test",
        EQUIPE_MODEL_RESEARCH: "muse-x",
        EQUIPE_MODEL_REVIEWER: "muse-x",
      })
    ).toThrow(/EQUIPE_MODEL_REVIEWER must differ from the author model EQUIPE_MODEL_RESEARCH/);
  });

  it("refuses a reviewer model equal to the writer model while the Equipe is on", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        META_MODEL_API_KEY: "meta-test",
        ANTHROPIC_API_KEY: "anthropic-test",
        OPENAI_TEXT_MODEL: "gpt-x",
        EQUIPE_MODEL_REVIEWER: "gpt-x",
      })
    ).toThrow(/EQUIPE_MODEL_REVIEWER must differ from the author model OPENAI_TEXT_MODEL/);
  });

  it("allows the reviewer to share the strategist model", () => {
    // The strategist orchestrates and never writes the reviewed copy.
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_ENABLED: "true",
      META_MODEL_API_KEY: "meta-test",
      ANTHROPIC_API_KEY: "anthropic-test",
      EQUIPE_MODEL_STRATEGIST: "claude-x",
      EQUIPE_MODEL_REVIEWER: "claude-x",
    });
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("claude-x");
  });

  it("requires the Meta key while a role uses a muse-* model", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        ANTHROPIC_API_KEY: "anthropic-test",
      })
    ).toThrow(/META_MODEL_API_KEY is required/);
  });

  it("requires the Anthropic key while a role uses a claude-* model", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        META_MODEL_API_KEY: "meta-test",
      })
    ).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it("requires no provider key when every role stays on OpenAI", () => {
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_ENABLED: "true",
      EQUIPE_MODEL_STRATEGIST: "gpt-a",
      EQUIPE_MODEL_RESEARCH: "gpt-b",
      EQUIPE_MODEL_REVIEWER: "gpt-c",
    });
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("gpt-c");
  });

  it("refuses max reasoning with a -contributor model", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        META_MODEL_API_KEY: "meta-test",
        ANTHROPIC_API_KEY: "anthropic-test",
        EQUIPE_EFFORT_RESEARCH: "max",
      })
    ).toThrow(/max reasoning is only available on the Meta Standard tier/);
  });

  it("accepts max reasoning with a Standard Meta model", () => {
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_ENABLED: "true",
      META_MODEL_API_KEY: "meta-test",
      ANTHROPIC_API_KEY: "anthropic-test",
      EQUIPE_MODEL_RESEARCH: "muse-spark-1.3",
      EQUIPE_EFFORT_RESEARCH: "max",
    });
    expect(parsed.EQUIPE_EFFORT_RESEARCH).toBe("max");
  });

  it("refuses minimal reasoning for Anthropic models", () => {
    expect(() =>
      schema.parse({
        ...baseEnv,
        STRIPE_SECRET_KEY: "sk_test_dummy",
        EQUIPE_ENABLED: "true",
        META_MODEL_API_KEY: "meta-test",
        ANTHROPIC_API_KEY: "anthropic-test",
        EQUIPE_EFFORT_STRATEGIST: "minimal",
      })
    ).toThrow(/minimal reasoning is not an Anthropic effort level/);
  });

  it("accepts minimal reasoning for Meta models", () => {
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_ENABLED: "true",
      META_MODEL_API_KEY: "meta-test",
      ANTHROPIC_API_KEY: "anthropic-test",
      EQUIPE_EFFORT_RESEARCH: "minimal",
    });
    expect(parsed.EQUIPE_EFFORT_RESEARCH).toBe("minimal");
  });

  it("accepts colliding reviewer/author models while the Equipe is off", () => {
    // Env validation gates app boot: a collision in a disabled feature
    // must never take the app down (e.g. a future OPENAI_TEXT_MODEL
    // change to claude-opus-5-5, the reviewer's default).
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_MODEL_STRATEGIST: "gpt-x",
      EQUIPE_MODEL_RESEARCH: "gpt-x",
      OPENAI_TEXT_MODEL: "gpt-x",
      EQUIPE_MODEL_REVIEWER: "gpt-x",
    });
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("gpt-x");
  });

  it("enforces nothing Equipe while EQUIPE_ENABLED is false", () => {
    // Every rule below would fire while on: reviewer==author, max with
    // a Contributor model, minimal with an Anthropic model, and both
    // provider keys missing. While off, all of it parses.
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_ENABLED: "false",
      EQUIPE_MODEL_RESEARCH: "muse-spark-1.3-contributor",
      EQUIPE_MODEL_REVIEWER: "muse-spark-1.3-contributor",
      EQUIPE_EFFORT_RESEARCH: "max",
      EQUIPE_MODEL_STRATEGIST: "claude-x",
      EQUIPE_EFFORT_STRATEGIST: "minimal",
    });
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("muse-spark-1.3-contributor");
  });

  it("accepts a reviewer model different from every author model", () => {
    const parsed = schema.parse({
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      EQUIPE_MODEL_STRATEGIST: "gpt-a",
      EQUIPE_MODEL_RESEARCH: "gpt-b",
      OPENAI_TEXT_MODEL: "gpt-c",
      EQUIPE_MODEL_REVIEWER: "gpt-d",
    });
    expect(parsed.EQUIPE_MODEL_REVIEWER).toBe("gpt-d");
  });

  it("coerces the Equipe AI budget and refuses negatives", () => {
    expect(
      schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS: "2500" })
        .EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS
    ).toBe(2500);
    expect(() =>
      schema.parse({ ...baseEnv, STRIPE_SECRET_KEY: "sk_test_dummy", EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS: "-1" })
    ).toThrow();
  });
});
