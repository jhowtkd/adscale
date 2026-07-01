import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildRateLimitExceededResponse,
  checkMutationRateLimit,
  checkRateLimit,
  getMutationRateLimitCategory,
  isRateLimitDisabled,
  rateLimit,
} from "./rate-limit";

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

describe("getMutationRateLimitCategory", () => {
  it("uses auth bucket for auth mutations", () => {
    expect(getMutationRateLimitCategory("/api/auth/sign-in/email")).toBe("auth");
  });

  it("uses general bucket for campaign CRUD and pilot save", () => {
    expect(getMutationRateLimitCategory("/api/campaigns")).toBe("general");
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1")).toBe("general");
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/pilot")).toBe("general");
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/assets/presign")).toBe(
      "general"
    );
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/assets/complete")).toBe(
      "general"
    );
  });

  it("uses ai bucket for generation and analysis mutations", () => {
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/derivations")).toBe("ai");
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/analyze")).toBe("ai");
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/auto-briefing")).toBe(
      "ai"
    );
    expect(
      getMutationRateLimitCategory("/api/campaigns/camp-1/assets/asset-1/preflight")
    ).toBe("ai");
    expect(getMutationRateLimitCategory("/api/derivations/der-1/regenerate")).toBe("ai");
  });
});

describe("buildRateLimitExceededResponse", () => {
  it("returns the canonical 429 payload and headers", async () => {
    const now = Date.now();
    const response = buildRateLimitExceededResponse({
      success: false,
      limit: 5,
      remaining: 0,
      reset: now + 30_000,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await response.json();
    expect(body).toMatchObject({
      error: "rateLimitExceeded",
      message: "Too many requests. Please try again later.",
    });
    expect(typeof body.retryAfter).toBe("number");
  });
});

describe("checkRateLimit", () => {
  const original = process.env.E2E_DISABLE_RATE_LIMIT;

  beforeEach(() => {
    process.env.E2E_DISABLE_RATE_LIMIT = "true";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.E2E_DISABLE_RATE_LIMIT;
    } else {
      process.env.E2E_DISABLE_RATE_LIMIT = original;
    }
  });

  it("returns null when the request is allowed", async () => {
    const request = new Request("http://localhost:3000/api/campaigns/camp-1/plan", {
      method: "POST",
    });

    await expect(
      checkRateLimit(request, { category: "ai", workspaceId: "workspace-1" })
    ).resolves.toBeNull();
  });
});

describe("checkMutationRateLimit", () => {
  const original = process.env.E2E_DISABLE_RATE_LIMIT;

  beforeEach(() => {
    process.env.E2E_DISABLE_RATE_LIMIT = "true";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.E2E_DISABLE_RATE_LIMIT;
    } else {
      process.env.E2E_DISABLE_RATE_LIMIT = original;
    }
  });

  it("classifies pathname and allows requests when not exceeded", async () => {
    const request = new Request("http://localhost:3000/api/campaigns/camp-1/derivations", {
      method: "POST",
    });

    await expect(
      checkMutationRateLimit(request, "/api/campaigns/camp-1/derivations")
    ).resolves.toBeNull();
    expect(getMutationRateLimitCategory("/api/campaigns/camp-1/derivations")).toBe("ai");
  });
});
