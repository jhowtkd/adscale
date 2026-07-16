import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "sk-test", OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21" },
}));

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("openai", () => {
  return {
    default: class {
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

  it("classifies the local image timeout without waiting in real time", async () => {
    vi.useFakeTimers();
    mockGenerate.mockReturnValue(new Promise(() => undefined));
    const provider = new OpenAIImageProvider();
    const result = provider.generate({
      prompt: "x", dimensions: { width: 1024, height: 1024 }, referenceImages: [],
      generationMode: "art_variation", outputPrefix: "p",
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    const error = await result;
    expect(error.message).toBe("OpenAI image generation timed out after 300s");
    expect(error.name).toBe("TimeoutError");
    expect(error.code).toBe("ETIMEDOUT");
    vi.useRealTimers();
  });
});
