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

const TRANSPORT = { timeout: 180_000, maxRetries: 0 };

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate when no references provided", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
      _request_id: "req-image-1",
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "a hero image",
      dimensions: { width: 1080, height: 1080 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
      quality: "medium",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "medium", size: "1088x1088" }),
      TRANSPORT,
    );
    expect(mockEdit).not.toHaveBeenCalled();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.providerMeta.provider).toBe("openai");
    expect(result.providerMeta.rawRequestId).toBe("req-image-1");
  });

  it("calls images.edit when at least one reference is provided", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("edited").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "with ref",
      dimensions: { width: 1080, height: 1350 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-2026-04-21",
        size: "1088x1360",
      }),
      TRANSPORT,
    );
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.model).toBe("gpt-image-2-2026-04-21");
  });

  it("throws a clear error when the response has no image data", async () => {
    mockGenerate.mockResolvedValue({ data: [] });
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1080, height: 1080 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
      }),
    ).rejects.toThrow(/No image data/);
  });

  it("uses timeout above the 2-minute worst case and zero SDK retries", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    await provider.generate({
      prompt: "x",
      dimensions: { width: 1080, height: 1080 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    });
    // maxRetries: 0 — SDK HTTP retries would bill extra image gens outside the
    // upstream 2-call creative budget.
    expect(mockGenerate.mock.calls[0][1]).toEqual(TRANSPORT);
    expect(TRANSPORT.timeout).toBeGreaterThan(120_000);
    expect(TRANSPORT.maxRetries).toBe(0);
  });

  it.each([
    { label: "1:1", dims: { width: 1080, height: 1080 }, size: "1088x1088" },
    { label: "4:5", dims: { width: 1080, height: 1350 }, size: "1088x1360" },
    { label: "9:16", dims: { width: 1080, height: 1920 }, size: "1152x2048" },
    { label: "3:4", dims: { width: 1080, height: 1440 }, size: "1152x1536" },
    { label: "landscape 1.91:1", dims: { width: 1200, height: 628 }, size: "2048x1072" },
    { label: "landscape 16:9", dims: { width: 1920, height: 1080 }, size: "2048x1152" },
  ])("requests $size for $label", async ({ dims, size }) => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    await provider.generate({
      prompt: "x",
      dimensions: dims,
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    });
    expect(mockGenerate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ size }),
    );
  });

  it.each(["high", "xhigh", "max"] as const)("sends explicit Sunburst %s with one call", async quality => {
    mockGenerate.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }], usage: { output_tokens: 12 } });
    const result = await new OpenAIImageProvider().generate({
      prompt: "hero", dimensions: { width: 1080, height: 1350 }, referenceImages: [],
      generationMode: "art_variation", outputPrefix: "test/sunburst",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality },
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality }), TRANSPORT);
    expect(mockGenerate.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(result.providerMeta.observation?.usage).toEqual({ output_tokens: 12 });
  });

  it("sends explicit Sunburst edit with one call", async () => {
    mockEdit.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }], usage: { output_tokens: 12 } });
    const result = await new OpenAIImageProvider().generate({
      prompt: "hero",
      dimensions: { width: 1080, height: 1350 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "art_variation",
      outputPrefix: "test/sunburst",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockEdit).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" }),
      TRANSPORT,
    );
    expect(mockEdit.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.observation?.usage).toEqual({ output_tokens: 12 });
  });

  it.each([
    { operation: "generate" as const, referenceImages: [] as { buffer: Buffer; mimeType: string; name: string }[] },
    {
      operation: "edit" as const,
      referenceImages: [{ buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" }],
    },
  ])("prefers frozen renderPolicy max over legacy medium on $operation", async ({ operation, referenceImages }) => {
    const mockCall = operation === "generate" ? mockGenerate : mockEdit;
    mockCall.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }] });
    await new OpenAIImageProvider().generate({
      prompt: "hero",
      dimensions: { width: 1080, height: 1350 },
      referenceImages,
      generationMode: "art_variation",
      outputPrefix: "test/sunburst",
      quality: "medium",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    });
    expect(mockCall).toHaveBeenCalledOnce();
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" }),
      TRANSPORT,
    );
    expect(mockCall.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(mockCall.mock.calls[0]?.[0].quality).not.toBe("medium");
    if (operation === "generate") {
      expect(mockEdit).not.toHaveBeenCalled();
    } else {
      expect(mockGenerate).not.toHaveBeenCalled();
    }
  });

  it("rejects a legacy-model policy before any billable call", async () => {
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1080, height: 1440 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
        // Cast: the schema is the runtime gate for untyped callers.
        renderPolicy: { version: 1, model: "gpt-image-1" as "gpt-image-2", quality: "medium" },
      }),
    ).rejects.toThrow(/gpt-image-2/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });
});
