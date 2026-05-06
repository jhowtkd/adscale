import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  }),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn().mockResolvedValue("pt-BR"),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
  },
}));

import { POST } from "@/app/api/briefing-doctor/analyze/route";

const validPayload = {
  briefing: {
    name: "Summer Sale",
    client: "Acme",
    objective: "Drive purchases",
    audience: "Women 25-34",
    platforms: ["Meta"],
    tone: "Energetic",
    offer: "20% off until Sunday",
    constraints: "",
    notes: "",
    generationMode: "art_variation",
    creativeLevel: "balanced",
    targetFormat: "",
    ctaVariants: ["Shop now", "", ""],
  },
};

describe("POST /api/briefing-doctor/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured analysis from AI response", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        overallScore: 82,
        readiness: "needs_attention",
        issues: [
          {
            field: "audience",
            severity: "medium",
            message: "Audience can be more specific.",
            impact: "Sharper targeting improves creative direction.",
          },
        ],
        suggestions: [
          {
            field: "audience",
            title: "Specify audience",
            suggestedValue: "Women 25-34 shopping fitness apparel online",
            rationale: "Specific audience improves hooks.",
          },
        ],
        improvedBrief: {
          audience: "Women 25-34 shopping fitness apparel online",
        },
        fieldPatches: [
          {
            field: "audience",
            value: "Women 25-34 shopping fitness apparel online",
          },
        ],
      }),
    });

    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analysis.overallScore).toBe(82);
    expect(body.analysis.fieldPatches[0].field).toBe("audience");
  });

  it("rejects invalid payload", async () => {
    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify({ briefing: { name: "" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns controlled error for malformed AI JSON", async () => {
    mockCreate.mockResolvedValue({ output_text: "not json" });
    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("filters invalid target format patches", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        overallScore: 70,
        readiness: "needs_attention",
        issues: [],
        suggestions: [],
        improvedBrief: {},
        fieldPatches: [{ field: "targetFormat", value: "16:9" }],
      }),
    });

    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(body.analysis.fieldPatches).toEqual([]);
  });
});
