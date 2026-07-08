import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    BYTEPLUS_API_KEY: "bp-test",
    SEEDREAM_MODEL_NAME: "doubao-seedream-5-0-pro-250630",
    SEEDREAM_BASE_URL: "https://ark.byteplus.com/v1",
  },
}));

const mockSeedreamImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("openai", () => {
  return {
    default: class {
      images = { edit: mockSeedreamImages.edit, generate: mockSeedreamImages.generate };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { SeedreamImageProvider } from "./seedream-image-provider";

const { edit: mockEdit, generate: mockGenerate } = mockSeedreamImages;

describe("SeedreamImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate against the ModelArk baseURL when no references", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("seed-bytes").toString("base64") }],
    });
    const provider = new SeedreamImageProvider();
    const result = await provider.generate({
      prompt: "a poster",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockEdit).not.toHaveBeenCalled();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.providerMeta.provider).toBe("seedream");
    expect(result.providerMeta.model).toBe("doubao-seedream-5-0-pro-250630");
  });

  it("calls images.edit with size WxH when references are present", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("seed-edit").toString("base64") }],
    });
    const provider = new SeedreamImageProvider();
    await provider.generate({
      prompt: "with refs",
      dimensions: { width: 1024, height: 1280 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockGenerate).not.toHaveBeenCalled();
    const call = mockEdit.mock.calls[0][0];
    expect(call.size).toBe("1024x1280");
  });

  it("throws when BYTEPLUS_API_KEY is missing", async () => {
    const provider = new SeedreamImageProvider();
    const { env } = await import("@/server/validation/env");
    const original = env.BYTEPLUS_API_KEY;
    (env as { BYTEPLUS_API_KEY?: string }).BYTEPLUS_API_KEY = undefined;
    try {
      await expect(
        provider.generate({
          prompt: "x",
          dimensions: { width: 1024, height: 1024 },
          referenceImages: [],
          generationMode: "art_variation",
          outputPrefix: "p",
        })
      ).rejects.toThrow(/BYTEPLUS_API_KEY/);
    } finally {
      (env as { BYTEPLUS_API_KEY?: string }).BYTEPLUS_API_KEY = original;
    }
  });
});
