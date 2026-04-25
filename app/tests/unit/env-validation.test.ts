import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("env validation", () => {
  it("accepts valid env vars", () => {
    const schema = z.object({
      DATABASE_URL: z.string().url(),
      BETTER_AUTH_SECRET: z.string().min(32),
    });
    expect(() =>
      schema.parse({
        DATABASE_URL: "postgresql://localhost/db",
        BETTER_AUTH_SECRET: "a".repeat(32),
      })
    ).not.toThrow();
  });

  it("rejects invalid DATABASE_URL", () => {
    const schema = z.object({ DATABASE_URL: z.string().url() });
    expect(() => schema.parse({ DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("rejects short BETTER_AUTH_SECRET", () => {
    const schema = z.object({ BETTER_AUTH_SECRET: z.string().min(32) });
    expect(() => schema.parse({ BETTER_AUTH_SECRET: "short" })).toThrow();
  });
});
