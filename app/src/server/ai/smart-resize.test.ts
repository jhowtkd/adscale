import { beforeEach, describe, expect, it, vi } from "vitest";

const chatCreate = vi.hoisted(() => vi.fn());
vi.mock("./utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create: chatCreate } } }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { analyzeSmartResize } from "./smart-resize";

function gptReply(payload: unknown) {
  chatCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe("analyzeSmartResize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the model for a 3:4 crop alongside the old ratios", async () => {
    gptReply({ crops: {}, safeZones: [], criticalElements: [], platformRecommendations: [] });
    await analyzeSmartResize("aGVsbG8=");
    const prompt = String(chatCreate.mock.calls[0]?.[0].messages[1].content[0].text);
    expect(prompt).toContain('"3:4"');
    expect(prompt).toContain('"4:5"');
    expect(prompt).toContain('"9:16"');
  });

  it("defaults a missing 3:4 crop to full canvas with a recorded issue", async () => {
    gptReply({
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
    gptReply({
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
