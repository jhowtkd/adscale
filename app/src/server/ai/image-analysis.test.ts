import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const chatCreate = vi.hoisted(() => vi.fn());

vi.mock("./utils", () => ({
  getOpenAI: () => ({ responses: { create }, chat: { completions: { create: chatCreate } } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "gpt-5.6-sol" } }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => false,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { analyzeImageContent } from "./image-analysis";
import { analyzeSmartResize } from "./smart-resize";

describe("analyzeImageContent", () => {
  it("uses the Responses vision input and parses its JSON output", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify({
      product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" },
      brandElements: ["CENBRAP"], keyVisual: "professor", textContent: { headline: "Ao vivo", bullets: [] }, format: "4:5",
    }) });

    await expect(analyzeImageContent(Buffer.from("image"), "image/png")).resolves.toMatchObject({ product: "Curso" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-sol",
      input: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.arrayContaining([
        expect.objectContaining({ type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" }),
      ]) })]),
      text: { format: { type: "json_object" } },
    }));
  });
});

function gptChatReply(payload: unknown) {
  chatCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe("analyzeSmartResize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the model for a 3:4 crop alongside the old ratios", async () => {
    gptChatReply({ crops: {}, safeZones: [], criticalElements: [], platformRecommendations: [] });
    await analyzeSmartResize("aGVsbG8=");
    const prompt = String(chatCreate.mock.calls[0]?.[0].messages[1].content[0].text);
    expect(prompt).toContain('"3:4"');
    expect(prompt).toContain('"4:5"');
    expect(prompt).toContain('"9:16"');
  });

  it("defaults a missing 3:4 crop to full canvas with a recorded issue", async () => {
    gptChatReply({
      crops: { "1:1": { x: 0, y: 0, width: 1, height: 1 } },
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [],
    });
    const analysis = await analyzeSmartResize("aGVsbG8=");
    expect(analysis.crops["3:4"]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(analysis.validationIssues).toContain("Missing crop for 3:4; defaulted to full canvas");
  });

  it("keeps a valid 3:4 crop untouched", async () => {
    const crop = { x: 0.1, y: 0.05, width: 0.8, height: 0.9 };
    gptChatReply({
      crops: {
        "1:1": { x: 0, y: 0, width: 1, height: 1 },
        "4:5": { x: 0, y: 0, width: 1, height: 1 },
        "9:16": { x: 0, y: 0, width: 1, height: 1 },
        "3:4": crop,
      },
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [],
    });
    const analysis = await analyzeSmartResize("aGVsbG8=");
    expect(analysis.crops["3:4"]).toEqual(crop);
    expect(analysis.validationIssues ?? []).not.toContain(expect.stringContaining("3:4"));
  });
});
