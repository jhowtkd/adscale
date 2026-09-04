import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const isE2EControlledProviderEnabledMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({
    chat: { completions: { create: createMock } },
  }),
}));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => isE2EControlledProviderEnabledMock(),
}));
vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "gpt-test" },
}));

import { synthesizeStudioEntryRequest } from "@/server/application/synthesize-studio-entry-request";

describe("synthesizeStudioEntryRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isE2EControlledProviderEnabledMock.mockReturnValue(false);
  });

  it("returns the template without calling OpenAI when the controlled provider is on", async () => {
    isE2EControlledProviderEnabledMock.mockReturnValue(true);
    const result = await synthesizeStudioEntryRequest({
      workspaceId: "ws-1",
      facts: { protocol: "single", offer: "imersão NR-1", audience: null, tone: "institucional" },
      chips: {},
      locale: "pt-BR",
    });
    expect(result.requestSource).toBe("template");
    expect(result.sentence).toBe("Peça única de imersão NR-1, tom institucional.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("falls back to the template when the model invents a price with no offer", async () => {
    isE2EControlledProviderEnabledMock.mockReturnValue(false);
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ sentence: "Campanha a R$ 10" }) } }],
    });
    const result = await synthesizeStudioEntryRequest({
      workspaceId: "ws-1",
      facts: { protocol: "single", offer: null, audience: null, tone: null },
      chips: {},
      locale: "pt-BR",
    });
    expect(result.requestSource).toBe("template");
    expect(result.sentence).not.toMatch(/R\$/);
  });

  it("uses the model sentence when it only restates provided slots", async () => {
    isE2EControlledProviderEnabledMock.mockReturnValue(false);
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ sentence: "Peça única de imersão NR-1." }) } }],
    });
    const result = await synthesizeStudioEntryRequest({
      workspaceId: "ws-1",
      facts: { protocol: "single", offer: "imersão NR-1", audience: null, tone: null },
      chips: {},
      locale: "pt-BR",
    });
    expect(result).toEqual({
      sentence: "Peça única de imersão NR-1.",
      requestSource: "model",
    });
  });

  it("merges chips over facts before synthesizing", async () => {
    isE2EControlledProviderEnabledMock.mockReturnValue(true);
    const result = await synthesizeStudioEntryRequest({
      workspaceId: "ws-1",
      facts: { protocol: "single", offer: "old offer", audience: null, tone: null },
      chips: { offer: "imersão NR-1" },
      locale: "pt-BR",
    });
    expect(result.sentence).toBe("Peça única de imersão NR-1.");
  });

  it("truncates the sentence to 240 characters", async () => {
    isE2EControlledProviderEnabledMock.mockReturnValue(false);
    const longSentence = "A".repeat(300);
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ sentence: longSentence }) } }],
    });
    const result = await synthesizeStudioEntryRequest({
      workspaceId: "ws-1",
      facts: { protocol: "single", offer: "test", audience: null, tone: null },
      chips: {},
      locale: "pt-BR",
    });
    expect(result.sentence).toHaveLength(240);
    expect(result.requestSource).toBe("model");
  });
});
