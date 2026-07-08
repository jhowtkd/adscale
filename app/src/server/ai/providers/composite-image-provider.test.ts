import { describe, it, expect } from "vitest";
import { CompositeImageProvider } from "./composite-image-provider";
import type { ImageCandidate, ProviderGenerateInput } from "./image-provider";
import { fakeProvider } from "./__test-utils__";

const baseInput: ProviderGenerateInput = {
  prompt: "x",
  dimensions: { width: 1024, height: 1024 },
  referenceImages: [],
  generationMode: "art_variation",
  outputPrefix: "p",
};

const candidate = (provider: "openai" | "seedream"): ImageCandidate => ({
  buffer: Buffer.from(`${provider}-bytes`),
  mimeType: "image/png",
  providerMeta: { provider, model: "m", durationMs: 10 },
});

describe("CompositeImageProvider", () => {
  it("returns 2 candidates when both providers succeed", async () => {
    const c = new CompositeImageProvider(
      [fakeProvider("openai", candidate("openai")), fakeProvider("seedream", candidate("seedream"))],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(2);
  });

  it("returns 1 candidate when Seedream fails", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", candidate("openai")),
        fakeProvider("seedream", undefined, new Error("rate limit")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("openai");
  });

  it("returns 1 candidate when OpenAI fails", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", undefined, new Error("5xx")),
        fakeProvider("seedream", candidate("seedream")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("seedream");
  });

  it("throws aggregated error when both providers fail", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", undefined, new Error("openai-down")),
        fakeProvider("seedream", undefined, new Error("seedream-down")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    await expect(c.generate(baseInput)).rejects.toThrow(/All image providers failed/);
  });

  it("excludes Seedream when sample rate is 0", async () => {
    const openai = fakeProvider("openai", candidate("openai"));
    const seedream = fakeProvider("seedream", candidate("seedream"));
    const c = new CompositeImageProvider([openai, seedream], { sampleRate: 0 });
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("openai");
    expect(seedream.generate).not.toHaveBeenCalled();
  });

  it("includes Seedream when sample rate is 1", async () => {
    const seedream = fakeProvider("seedream", candidate("seedream"));
    const c = new CompositeImageProvider(
      [fakeProvider("openai", candidate("openai")), seedream],
      { sampleRate: 1.0, random: () => 0.99 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(2);
    expect(seedream.generate).toHaveBeenCalled();
  });
});
