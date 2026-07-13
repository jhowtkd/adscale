import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "ws-1" },
    })
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

describe("POST /api/strategy-recipe/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ranked surface for blocked readiness", async () => {
    const res = await POST(
      new Request("http://localhost/api/strategy-recipe/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            readiness: { status: "blocked", overallScore: 40 },
            campaign: { ctaVariants: ["Buy"] },
          },
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rankedRecipes[0].id).toBe("safe_iteration");
    expect(body.previewCredits).toBe(5);
    expect(body.campaignPatch).toBeDefined();
    expect(body.recommendedRecipe.recipeId).toBe("safe_iteration");
  });
});
