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
} as any);

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
    } as any);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");

    expect(result.product?.value).toBe("Running Shoes");
    expect(result.product?.confidence).toBe("high");
    expect(result.platforms?.value).toEqual(["Instagram", "Facebook"]);
    expect(result.analyzedAt).toBeDefined();
  });

  it("returns empty object when AI returns no content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    } as any);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });

  it("returns empty object on invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not valid json" } }],
    } as any);

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });

  it("returns empty object on AI API error", async () => {
    mockCreate.mockImplementation(() => Promise.reject(new Error("API Error")));

    const result = await analyzeCampaignCreative("https://example.com/image.jpg");
    expect(result).toEqual({});
  });
});
