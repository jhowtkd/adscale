import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResponsesCreate = vi.hoisted(() => vi.fn());

vi.mock("./utils", () => ({
  getOpenAI: () => ({ responses: { create: mockResponsesCreate } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "gpt-5.6" },
}));

import {
  buildCreativeRoutePlannerPrompt,
  normalizeCreativeRoutes,
  planCreativeRoutes,
} from "./creative-route-planner";

const ROUTES = [
  {
    id: "route-1",
    thesis: "Make the product monumental",
    visualMechanism: "product_monument",
    scene: "The product dominates a restrained architectural set",
    composition: "Low angle, asymmetric negative space on the right",
    preserve: ["product geometry", "brand palette"],
    avoid: ["neon glow", "floating UI cards"],
    renderPrompt: "Low-angle editorial product photograph in a restrained architectural set.",
  },
  {
    id: "route-2",
    thesis: "Show the benefit in a real moment",
    visualMechanism: "documentary_moment",
    scene: "A candid customer moment with natural imperfections",
    composition: "Tight crop, subject on the left, natural depth",
    preserve: ["product geometry", "brand palette"],
    avoid: ["stock-photo smile", "perfect studio skin"],
    renderPrompt: "Candid documentary photograph with natural light and an imperfect lived-in setting.",
  },
  {
    id: "route-3",
    thesis: "Turn the proof into the visual idea",
    visualMechanism: "proof_as_visual",
    scene: "The proof becomes a physical material surrounding the product",
    composition: "Central proof shape with product interrupting the grid",
    preserve: ["product geometry", "brand palette"],
    avoid: ["generic infographic", "oversized CTA"],
    renderPrompt: "Editorial still life where the proof becomes a physical material around the product.",
  },
];

describe("normalizeCreativeRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts exactly three structurally distinct routes", () => {
    expect(normalizeCreativeRoutes({ routes: ROUTES })).toHaveLength(3);
  });

  it("rejects routes that repeat the same visual mechanism", () => {
    const repeated = ROUTES.map((route) => ({
      ...route,
      visualMechanism: "product_monument",
    }));

    expect(() => normalizeCreativeRoutes({ routes: repeated })).toThrow(
      /distinct visual mechanisms/
    );
  });

  it("replaces model-provided IDs with stable storage-safe route IDs", () => {
    const unsafe = ROUTES.map((route, index) => ({
      ...route,
      id: index === 0 ? "../../escape" : `creative route ${index}`,
    }));

    expect(normalizeCreativeRoutes({ routes: unsafe }).map((route) => route.id)).toEqual([
      "route-1",
      "route-2",
      "route-3",
    ]);
  });
});

describe("planCreativeRoutes", () => {
  it("requests three structured routes from the configured GPT model", async () => {
    mockResponsesCreate.mockResolvedValue({ output_text: JSON.stringify({ routes: ROUTES }) });

    const routes = await planCreativeRoutes({
      sourcePrompt: "Create a branded social post.",
      objective: "Increase qualified trial signups",
      mode: "social_post",
      referenceNames: ["exact-product.png"],
    });

    expect(routes).toHaveLength(3);
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.6" }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 })
    );
  });

  it("uses deterministic routes without a model call in controlled preview mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://adscale-app-pr-122.onrender.com");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER_PREVIEW", "true");
    mockResponsesCreate.mockClear();

    const routes = await planCreativeRoutes({
      sourcePrompt: "Create a branded social post.",
      objective: "Increase qualified trial signups",
      mode: "social_post",
      referenceNames: [],
    });

    expect(routes).toHaveLength(3);
    expect(new Set(routes.map((route) => route.visualMechanism)).size).toBe(3);
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });
});

describe("buildCreativeRoutePlannerPrompt", () => {
  it("includes the objective and numbered reference roles", () => {
    const prompt = buildCreativeRoutePlannerPrompt({
      sourcePrompt: "Create a branded social post.",
      objective: "Increase qualified trial signups",
      mode: "social_post",
      referenceNames: ["exact-product.png", "style-reference.png"],
    });

    expect(prompt).toContain("Increase qualified trial signups");
    expect(prompt).toContain("Image 1: exact-product.png");
    expect(prompt).toContain("Image 2: style-reference.png");
  });
});
