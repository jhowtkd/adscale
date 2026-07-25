import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));

const mockSharpPipeline = vi.hoisted(() => ({
  resize: vi.fn().mockReturnThis(),
  blur: vi.fn().mockReturnThis(),
  modulate: vi.fn().mockReturnThis(),
  composite: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(() => Promise.resolve(Buffer.from("normalized"))),
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
  default: vi.fn(() => mockSharpPipeline),
}));

import { objectStorage } from "@/server/storage";
import { generateAndStoreImage, isRetryableProviderError, normalizeGeneratedImage } from "./image-generation";

const BASE_INPUT = {
  prompt: "a creative post",
  dimensions: { width: 1080, height: 1080 },
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
    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "high" })
    );
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

  it("stores the raw candidate before final normalization", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "derivations/raw-candidate",
    });

    expect(objectStorage.put).toHaveBeenCalledWith(
      "derivations/raw-candidate/candidates/openai.png",
      Buffer.from("mockimage"),
      "image/png"
    );
  });

  it("normalizes creative output without a blurred background", async () => {
    await normalizeGeneratedImage(
      Buffer.from("image"),
      { width: 1080, height: 1350 },
      "art_variation"
    );

    expect(mockSharpPipeline.blur).not.toHaveBeenCalled();
    expect(mockSharpPipeline.modulate).not.toHaveBeenCalled();
    expect(mockSharpPipeline.composite).not.toHaveBeenCalled();
    expect(mockSharpPipeline.resize).toHaveBeenCalledWith(1080, 1350, {
      fit: "cover",
      position: "attention",
    });
  });

  it("uses 1024x1280 for 4:5 dimensions (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-3",
      dimensions: { width: 1080, height: 1350 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
  });

  it("uses 1152x2048 for 9:16 dimensions (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-4",
      dimensions: { width: 1080, height: 1920 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
  });

  it("uses 1024x1024 for 1:1 dimensions", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-5",
      dimensions: { width: 1080, height: 1080 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("returns revisedPrompt from the winning provider", async () => {
    // The image orchestrator surfaces the winner's provider-supplied
    // revised_prompt on the top-level result so downstream code (e.g.
    // derivation-pipeline) keeps working unchanged.
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

  it("returns the OpenAI candidate as the winner", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const { fakeProvider } = await import("../../../../tests/helpers/fake-image-provider");
    __setImageProviderForTests(fakeProvider("openai", {
      buffer: Buffer.from("openai-out"),
      mimeType: "image/png",
      providerMeta: { provider: "openai", model: "gpt-image-2", durationMs: 100 },
    }));

    try {
      const result = await generateAndStoreImage({
        prompt: "x",
        dimensions: { width: 1024, height: 1024 },
        outputPrefix: "derivations/test-candidates",
        referenceImages: [],
      });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].provider).toBe("openai");
      expect(result.candidates[0].winner).toBe(true);
      expect(result.candidates[0].outputKey).toMatch(/^derivations\/test-candidates\/candidates\/openai\.png$/);
      expect(result.outputKey).toMatch(/^derivations\/test-candidates\/\d+\.png$/);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("generates three medium-quality routes and normalizes only the selected candidate", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn(async (input: { prompt: string }) => ({
      buffer: Buffer.from(input.prompt),
      mimeType: "image/png",
      providerMeta: {
        provider: "openai" as const,
        model: "gpt-image-2",
        durationMs: 100,
      },
    }));
    const selectCandidate = vi.fn(async () => 1);
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        prompt: "fallback",
        outputPrefix: "creative-work/tournament",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "concept two" },
          { id: "route-3", prompt: "concept three" },
        ],
        selectCandidate,
      });

      expect(generate).toHaveBeenCalledTimes(3);
      expect(generate.mock.calls.every(([input]) => input.quality === "medium")).toBe(true);
      expect(selectCandidate).toHaveBeenCalledOnce();
      expect(result.candidates).toHaveLength(3);
      expect(result.candidates.map((candidate) => candidate.routeId)).toEqual([
        "route-1",
        "route-2",
        "route-3",
      ]);
      expect(result.candidates[1].winner).toBe(true);
      expect(mockSharpPipeline.toBuffer).toHaveBeenCalledTimes(1);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("keeps route generation serial to stay within the production memory budget", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    let active = 0;
    let peak = 0;
    const generate = vi.fn(async (input: { prompt: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return {
        buffer: Buffer.from(input.prompt),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 100,
        },
      };
    });
    __setImageProviderForTests({ name: "openai", generate });

    try {
      await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/memory-safe-tournament",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "concept two" },
          { id: "route-3", prompt: "concept three" },
        ],
      });

      expect(peak).toBe(1);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("continues the tournament when one route generation fails", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn(async (input: { prompt: string }) => {
      if (input.prompt === "broken concept") {
        throw new Error("provider timeout");
      }
      return {
        buffer: Buffer.from(input.prompt),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 100,
        },
      };
    });
    const selectCandidate = vi.fn(async (candidates) => {
      expect(candidates.map((candidate) => candidate.routeId)).toEqual([
        "route-1",
        "route-3",
      ]);
      return 1;
    });
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/partial-tournament",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "broken concept" },
          { id: "route-3", prompt: "concept three" },
        ],
        selectCandidate,
      });

      expect(generate).toHaveBeenCalledTimes(3);
      expect(result.candidates.map((candidate) => candidate.routeId)).toEqual([
        "route-1",
        "route-3",
      ]);
      expect(result.candidates[1].winner).toBe(true);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("marks a local TimeoutError shape retryable", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const providerError = Object.assign(new Error("request timed out"), { name: "TimeoutError", code: "ETIMEDOUT" });
    __setImageProviderForTests({ name: "openai", generate: vi.fn(async () => { throw providerError; }) });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/retryable" }).catch((caught) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error.retryable).toBe(true);
      expect(error).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("recognizes the TimeoutError name preserved only in an Inngest step stack", () => {
    const transported = new Error(
      "All image candidates failed: Error: upstream request failed",
    );
    transported.name = "Error";
    transported.stack = `TimeoutError: ${transported.message}\n    at generateAndStoreImage (image-generation.ts:1:1)`;

    expect(isRetryableProviderError(transported)).toBe(true);
  });

  it("does not treat an ordinary transported Error stack as retryable", () => {
    const transported = new Error("invalid prompt");
    transported.name = "Error";
    transported.stack = `Error: ${transported.message}\n    at generateAndStoreImage (image-generation.ts:1:1)`;

    expect(isRetryableProviderError(transported)).toBe(false);
  });

  it("marks an HTTP 429 provider error retryable", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    __setImageProviderForTests({ name: "openai", generate: vi.fn(async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); }) });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/rate-limit" }).catch((caught) => caught);
      expect(error.retryable).toBe(true);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("recognizes APIConnectionTimeoutError by constructor name", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    class APIConnectionTimeoutError extends Error { name = "Error"; }
    __setImageProviderForTests({ name: "openai", generate: vi.fn(async () => { throw new APIConnectionTimeoutError("timeout"); }) });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/sdk-timeout" }).catch((caught) => caught);
      expect(error.retryable).toBe(true);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("recognizes APIUserAbortError by constructor name", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    class APIUserAbortError extends Error { name = "Error"; }
    __setImageProviderForTests({ name: "openai", generate: vi.fn(async () => { throw new APIUserAbortError("aborted"); }) });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/sdk-abort" }).catch((caught) => caught);
      expect(error.retryable).toBe(true);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("does not mark an input-like 400 provider error retryable", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    __setImageProviderForTests({ name: "openai", generate: vi.fn(async () => { throw Object.assign(new Error("bad input"), { status: 400 }); }) });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/not-retryable" }).catch((caught) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error.retryable).not.toBe(true);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("skips candidates, judging and refinement under the direct execution policy", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn(async (input: { prompt: string }) => ({
      buffer: Buffer.from(input.prompt),
      mimeType: "image/png",
      providerMeta: {
        provider: "openai" as const,
        model: "gpt-image-2",
        durationMs: 100,
      },
    }));
    const selectCandidate = vi.fn(async () => 0);
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/direct",
        executionPolicy: "direct",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "concept two" },
          { id: "route-3", prompt: "concept three" },
        ],
        selectCandidate,
      });

      // Exactly one high-quality provider call for the one visible output.
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0][0]).toEqual(
        expect.objectContaining({ prompt: "a creative post", quality: "high" })
      );
      expect(selectCandidate).not.toHaveBeenCalled();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toEqual(
        expect.objectContaining({ routeId: "openai", winner: true })
      );
      expect(mockSharpPipeline.toBuffer).toHaveBeenCalledTimes(1);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("refines the winner once at high quality and keeps the better version", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn(async (input: { prompt: string }) => ({
      buffer: Buffer.from(input.prompt),
      mimeType: "image/png",
      providerMeta: {
        provider: "openai" as const,
        model: "gpt-image-2",
        durationMs: 100,
      },
    }));
    const selectCandidate = vi
      .fn()
      .mockResolvedValueOnce({
        winnerIndex: 0,
        refinementPrompt: "Remove the synthetic glow while preserving the product.",
        reason: "route-1 has the strongest dominant idea",
      })
      .mockResolvedValueOnce({ winnerIndex: 1, reason: "the refinement is cleaner" });
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/refinement",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "concept two" },
          { id: "route-3", prompt: "concept three" },
        ],
        selectCandidate,
      });

      expect(generate).toHaveBeenCalledTimes(4);
      expect(generate.mock.calls[3][0]).toEqual(
        expect.objectContaining({
          quality: "high",
          prompt: expect.stringContaining("Remove the synthetic glow"),
          referenceImages: expect.arrayContaining([
            expect.objectContaining({ name: "selected-candidate.png" }),
          ]),
        })
      );
      expect(selectCandidate).toHaveBeenCalledTimes(2);
      expect(result.candidates.at(-1)).toEqual(
        expect.objectContaining({
          routeId: "refined",
          winner: true,
          selectionReason: expect.stringContaining("refinement is cleaner"),
        })
      );
    } finally {
      __setImageProviderForTests(null);
    }
  });
});
