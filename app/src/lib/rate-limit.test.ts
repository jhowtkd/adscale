import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isRateLimitDisabled, rateLimit } from "./rate-limit";

describe("rateLimit E2E bypass", () => {
  const original = process.env.E2E_DISABLE_RATE_LIMIT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.E2E_DISABLE_RATE_LIMIT;
    } else {
      process.env.E2E_DISABLE_RATE_LIMIT = original;
    }
  });

  it("isRateLimitDisabled respects env flag", () => {
    delete process.env.E2E_DISABLE_RATE_LIMIT;
    expect(isRateLimitDisabled()).toBe(false);

    process.env.E2E_DISABLE_RATE_LIMIT = "true";
    expect(isRateLimitDisabled()).toBe(true);
  });

  it("rateLimit always succeeds when E2E bypass is enabled", async () => {
    process.env.E2E_DISABLE_RATE_LIMIT = "true";
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
    });

    for (let i = 0; i < 20; i++) {
      const result = await rateLimit(request, "auth");
      expect(result.success).toBe(true);
    }
  });
});
