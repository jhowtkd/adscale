import { describe, expect, it } from "vitest";
import { getMutationRateLimitCategory } from "./api-rate-limit-category";

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
