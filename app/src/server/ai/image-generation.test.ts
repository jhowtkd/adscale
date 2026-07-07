import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = mockOpenAIImages;
  },
  toFile: vi.fn(async (buffer: Buffer, name: string, opts: { type: string }) => ({
    buffer,
    name,
    type: opts.type,
  })),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn((key: string) => Promise.resolve(Buffer.from(`buffer:${key}`))),
    put: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// sharp is exercised in derivation-pipeline.test.ts; stub it here so this
// file stays focused on provider orchestration behavior.
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    blur: vi.fn().mockReturnThis(),
    modulate: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(() => Promise.resolve(Buffer.from("normalized"))),
  })),
}));

import { objectStorage } from "@/server/storage";
import { generateAndStoreImage } from "./image-generation";

const BASE_INPUT = {
  prompt: "a creative post",
  targetFormat: "1:1" as const,
  referenceImages: [] as Array<{ buffer: Buffer; mimeType: string; name: string }>,
};

describe("generateAndStoreImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised prompt" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised prompt" }],
    });
  });

  it("calls openai.images.generate when there are no reference images", async () => {
    const result = await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-1",
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).not.toHaveBeenCalled();
    expect(result.imageOperation).toBe("generate");
    expect(result.outputKey).toMatch(/^creative-work\/output-1\/\d+\.png$/);
    expect(objectStorage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^creative-work\/output-1\//),
      expect.any(Buffer),
      "image/png"
    );
  });

  it("calls openai.images.edit with an array of files when reference images are provided", async () => {
    const ref1 = { buffer: Buffer.from("ref-1"), mimeType: "image/png", name: "ref1" };
    const ref2 = { buffer: Buffer.from("ref-2"), mimeType: "image/png", name: "ref2" };

    const result = await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-2",
      referenceImages: [ref1, ref2],
    });

    expect(mockOpenAIImages.edit).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.generate).not.toHaveBeenCalled();
    expect(result.imageOperation).toBe("edit");
    expect(result.outputKey).toMatch(/^creative-work\/output-2\/\d+\.png$/);
  });

  it("uses caller-supplied outputPrefix for storage", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "derivations/derivation-42",
    });

    expect(objectStorage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^derivations\/derivation-42\//),
      expect.any(Buffer),
      "image/png"
    );
  });

  it("uses 1024x1280 for 4:5 targetFormat (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-3",
      targetFormat: "4:5",
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
  });

  it("uses 1152x2048 for 9:16 targetFormat (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-4",
      targetFormat: "9:16",
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
  });

  it("uses 1024x1024 for 1:1 targetFormat", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-5",
      targetFormat: "1:1",
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("returns revisedPrompt from the provider response", async () => {
    mockOpenAIImages.generate.mockResolvedValueOnce({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "sharper, more vivid" }],
    });

    const result = await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-6",
    });

    expect(result.revisedPrompt).toBe("sharper, more vivid");
  });

  it("returns a buffer alongside the output key", async () => {
    const result = await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-7",
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });
});