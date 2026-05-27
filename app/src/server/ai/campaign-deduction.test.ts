import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeCampaignCreative } from "./campaign-deduction";

// Mock OpenAI
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

import { getOpenAI } from "@/server/ai/utils";

const mockCreate = vi.fn();
const mockOpenAI = vi.mocked(getOpenAI);

// Set up the mock to return our mockCreate function
mockOpenAI.mockReturnValue({
  chat: {
    completions: {
      create: mockCreate,
    },
  },
} as unknown);

describe("analyzeCampaignCreative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed AI fields on success", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              product: { value: "Running Shoes", confidence: "high" },
              objective: { value: "Awareness", confidence: "medium" },
              targetAudience: { value: "Athletes 18-35", confidence: "medium" },
              tone: { value: "Energetic", confidence: "high" },
              offer: { value: "20% off", confidence: "high" },
              platforms: { value: ["Instagram", "Facebook"], confidence: "high" },
            }),
          },
        },
      ],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");

    expect(result.product?.value).toBe("Running Shoes");
    expect(result.product?.confidence).toBe("high");
    expect(result.platforms?.value).toEqual(["Instagram", "Facebook"]);
    expect(result.analyzedAt).toBeDefined();
  });

  it("returns creativity profile suggestion when provided by AI", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              product: { value: "Running Shoes", confidence: "high" },
              suggestedCreativeLevel: { value: "bold", confidence: "high", reasoning: "High energy design with vibrant colors" },
            }),
          },
        },
      ],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");

    expect(result.suggestedCreativeLevel?.value).toBe("bold");
    expect(result.suggestedCreativeLevel?.confidence).toBe("high");
    expect(result.suggestedCreativeLevel?.reasoning).toBe("High energy design with vibrant colors");
  });

  it("returns CTA suggestions when provided by AI", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              product: { value: "Running Shoes", confidence: "high" },
              suggestedCtas: [
                { value: "Compre Agora", confidence: "high" },
                { value: "Aproveite 50% OFF", confidence: "medium" },
                { value: "Saiba Mais", confidence: "medium" },
              ],
            }),
          },
        },
      ],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");

    expect(result.suggestedCtas).toHaveLength(3);
    expect(result.suggestedCtas?.[0].value).toBe("Compre Agora");
    expect(result.suggestedCtas?.[0].confidence).toBe("high");
  });

  it("filters out null suggestion values", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              product: { value: "Running Shoes", confidence: "high" },
              suggestedCreativeLevel: null,
              suggestedCtas: null,
            }),
          },
        },
      ],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");

    expect(result.suggestedCreativeLevel).toBeUndefined();
    expect(result.suggestedCtas).toBeUndefined();
    expect(result.product?.value).toBe("Running Shoes");
  });

  it("returns empty object when AI returns no content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });

  it("returns empty object on invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not valid json" } }],
    } as unknown);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });

  it("returns empty object on AI API error", async () => {
    mockCreate.mockImplementation(() => Promise.reject(new Error("API Error")));

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });
});
