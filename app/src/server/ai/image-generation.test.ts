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
    signedDownloadUrl: vi.fn((key: string) => Promise.resolve(`https://signed.example/${key}`)),
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
import { logger } from "@/lib/logger";
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
      expect.objectContaining({ quality: "medium" }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
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

  it("uses 1088x1360 for 4:5 dimensions (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-3",
      dimensions: { width: 1080, height: 1350 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1088x1360" }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
    );
  });

  it("uses 1152x2048 for 9:16 dimensions (gpt-image-2 target-aspect size)", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-4",
      dimensions: { width: 1080, height: 1920 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
    );
  });

  it("uses 1088x1088 for 1:1 dimensions", async () => {
    await generateAndStoreImage({
      ...BASE_INPUT,
      outputPrefix: "creative-work/output-5",
      dimensions: { width: 1080, height: 1080 },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1088x1088" }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
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

  it("uses the deterministic provider to prove correlated external-call telemetry without network timing", async () => {
    const { E2EControlledImageProvider } = await import("./providers/e2e-controlled-provider");
    const { __setImageProviderForTests } = await import("./image-generation");
    __setImageProviderForTests(E2EControlledImageProvider.forUnitTests());

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/deterministic",
        executionPolicy: "direct",
        callBudget: { remaining: 2 },
        telemetry: {
          workspaceId: "workspace-1",
          workId: "work-1",
          outputId: "output-1",
          generationCorrelationId: "generation-1",
          jobType: "creative_work",
        },
      });

      const externalCalls = vi.mocked(logger.info).mock.calls
        .map(([payload]) => payload)
        .filter((payload): payload is { event: string } => (
          typeof payload === "object" && payload !== null &&
          (payload as { event?: string }).event === "image_pipeline_external_call"
        ));
      expect(result.providerCalls).toBe(1);
      expect(externalCalls).toEqual([
        expect.objectContaining({
          callType: "image",
          attempt: 0,
          generationCorrelationId: "generation-1",
          result: "success",
        }),
      ]);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("keeps excluded provider calls with request id and attempt after a later success", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("request timed out"), {
        name: "TimeoutError",
        code: "ETIMEDOUT",
        requestID: "req-timeout",
      }))
      .mockResolvedValueOnce({
        buffer: Buffer.from("recovered"),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 90,
          rawRequestId: "req-winner",
        },
      });
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/excluded-call",
        telemetry: { outputId: "output-1" },
      });

      expect(generate).toHaveBeenCalledTimes(2);
      expect(result.candidates[0]).toMatchObject({
        winner: true,
        rawRequestId: "req-winner",
      });
      expect(result.excludedCalls).toEqual([
        expect.objectContaining({
          requestId: "req-timeout",
          status: "failed",
          attempt: 0,
          outputId: "output-1",
          error: "ETIMEDOUT",
        }),
      ]);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("keeps an excluded call when the provider error has no request id", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("request timed out"), {
        name: "TimeoutError",
        code: "ETIMEDOUT",
      }))
      .mockResolvedValueOnce({
        buffer: Buffer.from("recovered"),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 90,
          rawRequestId: "req-winner",
        },
      });
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/excluded-call-missing-id",
        telemetry: { outputId: "output-1" },
      });

      expect(result.excludedCalls).toEqual([
        expect.objectContaining({
          requestId: "requestIdMissing",
          status: "failed",
          attempt: 0,
          outputId: "output-1",
          error: "ETIMEDOUT",
        }),
      ]);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("keeps provider identity when candidate persistence rejects before a later route succeeds", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn()
      .mockResolvedValueOnce({
        buffer: Buffer.from("first"),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 120,
          rawRequestId: "req-storage-failure",
        },
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from("second"),
        mimeType: "image/png",
        providerMeta: {
          provider: "openai" as const,
          model: "gpt-image-2",
          durationMs: 90,
          rawRequestId: "req-winner",
        },
      });
    vi.mocked(objectStorage.put)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    __setImageProviderForTests({ name: "openai", generate });

    try {
      const result = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/excluded-storage-call",
        routes: [
          { id: "first", prompt: "first" },
          { id: "second", prompt: "second" },
        ],
        telemetry: { outputId: "output-1" },
      });

      expect(result.candidates[0]).toMatchObject({
        winner: true,
        rawRequestId: "req-winner",
      });
      expect(result.excludedCalls).toEqual([
        expect.objectContaining({
          requestId: "req-storage-failure",
          status: "rejected",
          attempt: 0,
          outputId: "output-1",
          durationMs: 120,
        }),
      ]);
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
      expect(result.providerCalls).toBe(3);
      const imageCalls = vi.mocked(logger.info).mock.calls
        .map(([payload]) => payload)
        .filter((payload): payload is { event: string; callType?: string; callIndex?: number } => (
          typeof payload === "object" && payload !== null
          && (payload as { event?: string }).event === "image_pipeline_external_call"
        ));
      expect(imageCalls).toHaveLength(result.providerCalls);
      expect(imageCalls.map((call) => call.callIndex)).toEqual([0, 1, 2]);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("keeps route generation within IMAGE_ROUTE_CONCURRENCY", async () => {
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

      // Default IMAGE_ROUTE_CONCURRENCY is 1 in tests.
      expect(peak).toBe(1);
      // Upload-and-release: each candidate is put before the next starts under concurrency 1.
      expect(objectStorage.put).toHaveBeenCalled();
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

  it("exhausts one controlled retry then marks total failure non-retryable", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const providerError = Object.assign(new Error("request timed out"), { name: "TimeoutError", code: "ETIMEDOUT" });
    const generate = vi.fn(async () => { throw providerError; });
    __setImageProviderForTests({ name: "openai", generate });
    try {
      const error = await generateAndStoreImage({ ...BASE_INPUT, outputPrefix: "creative-work/retryable" }).catch((caught) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error.retryable).toBe(false);
      expect(String(error.message)).toMatch(/All image candidates failed/);
      // One controlled app-level round retry (2 × 1 route).
      expect(generate).toHaveBeenCalledTimes(2);
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

  it("treats HTTP 429 as retryable via isRetryableProviderError", () => {
    expect(isRetryableProviderError(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(true);
  });

  it("recognizes APIConnectionTimeoutError by constructor name", () => {
    class APIConnectionTimeoutError extends Error { name = "Error"; }
    expect(isRetryableProviderError(new APIConnectionTimeoutError("timeout"))).toBe(true);
  });

  it("recognizes APIUserAbortError by constructor name", () => {
    class APIUserAbortError extends Error { name = "Error"; }
    expect(isRetryableProviderError(new APIUserAbortError("aborted"))).toBe(true);
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

  it("does not call the provider again after selection even when refinementPrompt is present", async () => {
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
    const selectCandidate = vi.fn().mockResolvedValue({
      winnerIndex: 1,
      refinementPrompt: "Remove the synthetic glow while preserving the product.",
      reason: "route-2 has the strongest dominant idea",
    });
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

      expect(generate).toHaveBeenCalledTimes(3);
      expect(selectCandidate).toHaveBeenCalledTimes(1);
      expect(result.candidates.find((c) => c.winner)?.routeId).toBe("route-2");
      expect(result.candidates.some((c) => c.routeId === "refined")).toBe(false);
    } finally {
      __setImageProviderForTests(null);
    }
  });

  it("aborts pending routes when heartbeat reports lease loss", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    process.env.IMAGE_ROUTE_CONCURRENCY = "1";
    let active = 0;
    const generate = vi.fn(async (input: { prompt: string }) => {
      active += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
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
    const onStageHeartbeat = vi.fn(async (stage: string) => {
      if (stage.includes("route-1")) {
        const err = new Error("creative_work_lease_lost:output-1") as Error & { code: string };
        err.code = "lease_lost";
        throw err;
      }
    });

    try {
      const error = await generateAndStoreImage({
        ...BASE_INPUT,
        outputPrefix: "creative-work/lease-abort",
        routes: [
          { id: "route-1", prompt: "concept one" },
          { id: "route-2", prompt: "concept two" },
          { id: "route-3", prompt: "concept three" },
        ],
        onStageHeartbeat,
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { code?: string }).code).toBe("lease_lost");
      expect(generate.mock.calls.length).toBeLessThan(3);
      expect(active).toBe(0);
    } finally {
      delete process.env.IMAGE_ROUTE_CONCURRENCY;
      __setImageProviderForTests(null);
    }
  });

  it("shares a call budget across controlled retries", async () => {
    const { __setImageProviderForTests } = await import("./image-generation");
    const generate = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { status: 504 });
    });
    __setImageProviderForTests({ name: "openai", generate });
    const callBudget = { remaining: 4 };

    try {
      await expect(
        generateAndStoreImage({
          ...BASE_INPUT,
          outputPrefix: "creative-work/budget",
          routes: [
            { id: "route-1", prompt: "a" },
            { id: "route-2", prompt: "b" },
            { id: "route-3", prompt: "c" },
          ],
          callBudget,
        })
      ).rejects.toThrow(/All image candidates failed/);
      expect(generate).toHaveBeenCalledTimes(4);
      expect(callBudget.remaining).toBe(0);
    } finally {
      __setImageProviderForTests(null);
    }
  });
});
