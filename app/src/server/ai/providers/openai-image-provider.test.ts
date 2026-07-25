import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "sk-test", OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21" },
}));

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
  clientOptions: undefined as unknown,
}));
vi.mock("openai", () => {
  return {
    default: class {
      constructor(options: unknown) {
        mockOpenAIImages.clientOptions = options;
      }
      images = { edit: mockOpenAIImages.edit, generate: mockOpenAIImages.generate };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { OpenAIImageProvider } from "./openai-image-provider";

const { edit: mockEdit, generate: mockGenerate } = mockOpenAIImages;

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate when no references provided", async () => {
    expect(mockOpenAIImages.clientOptions).toMatchObject({
      timeout: 5 * 60 * 1000,
      maxRetries: 0,
    });
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "a hero image",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
      quality: "medium",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "medium" })
    );
    expect(mockEdit).not.toHaveBeenCalled();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.providerMeta.provider).toBe("openai");
  });

  it("calls images.edit when at least one reference is provided", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("edited").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "with ref",
      dimensions: { width: 1024, height: 1280 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.model).toBe("gpt-image-2-2026-04-21");
  });

  it("throws a clear error when the response has no image data", async () => {
    mockGenerate.mockResolvedValue({ data: [] });
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1024, height: 1024 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
      })
    ).rejects.toThrow(/No image data/);
  });

  it("delegates timeout enforcement to the SDK client as the single authority", async () => {
    // R-007: the SDK timeout (which aborts the underlying HTTP request) is
    // the only timeout authority — no local Promise.race wraps the call, so
    // a hung SDK promise stays pending even after the budget elapses.
    expect(mockOpenAIImages.clientOptions).toMatchObject({
      timeout: 5 * 60 * 1000,
      maxRetries: 0,
    });
    vi.useFakeTimers();
    let settled = false;
    mockGenerate.mockReturnValue(new Promise(() => undefined));
    const provider = new OpenAIImageProvider();
    void provider.generate({
      prompt: "x", dimensions: { width: 1024, height: 1024 }, referenceImages: [],
      generationMode: "art_variation", outputPrefix: "p",
    }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(settled).toBe(false);
    vi.useRealTimers();
  });
});
