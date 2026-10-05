import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_TRAINING_CATEGORIES,
  BRAND_TRAINING_USAGE_MODES,
} from "@/server/brand-training/contracts";

const mockCreateChatCompletion = vi.hoisted(() => vi.fn());
const mockGetObject = vi.hoisted(() => vi.fn());
const mockRecordTrainingAnalysis = vi.hoisted(() => vi.fn());
const mockGetTrainingReferenceForAnalysis = vi.hoisted(() => vi.fn());
const mockMarkTrainingAnalysisFailed = vi.hoisted(() => vi.fn());
const controlledProvider = vi.hoisted(() => ({ enabled: false }));
const measure = vi.hoisted(() => ({ failWith: undefined as unknown }));
const envMock = vi.hoisted(() => ({
  OPENAI_TEXT_MODEL: "gpt-5.6",
  OPENAI_BRAND_TRAINING_MODEL: "gpt-6-luna" as string | undefined,
  OPENAI_API_KEY: "test-key",
}));
const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
// The fake bytes are not a real image, so the measurement also warns; pick out the provider's warning.
const emptyContentWarnings = () => loggerMock.warn.mock.calls.map(c => String(c[0])).filter(m => m.includes("provider returned empty content"));

vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => controlledProvider.enabled,
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreateChatCompletion,
      },
    };
  },
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: (...args: unknown[]) => mockGetObject(...args),
  },
}));

vi.mock("@/server/ai/normalize-image-for-ai", () => ({
  normalizeImageForAi: async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => ({
    buffer,
    mimeType: mimeType ?? "image/png",
    width: 1080,
    height: 1080,
    originalBytes: buffer.byteLength,
    finalBytes: buffer.byteLength,
    hasTransparency: false,
  }),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  recordTrainingAnalysis: (...args: unknown[]) =>
    mockRecordTrainingAnalysis(...args),
  getTrainingReferenceForAnalysis: (...args: unknown[]) =>
    mockGetTrainingReferenceForAnalysis(...args),
  markTrainingAnalysisFailed: (...args: unknown[]) =>
    mockMarkTrainingAnalysisFailed(...args),
}));

// The brand kit is a fake (no database), so the measurement is reached; the measure itself is the real one unless a test makes it fail.
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: async () => ({ brandColors: ["#071522"] }) }));
vi.mock("@/server/brand-training/measure-image", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/brand-training/measure-image")>();
  return { ...actual, measureImageBuffer: (...args: Parameters<typeof actual.measureImageBuffer>) => (measure.failWith ? Promise.reject(measure.failWith) : actual.measureImageBuffer(...args)) };
});

vi.mock("@/server/validation/env", () => ({ env: envMock }));

vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({
      opts,
      fn: handler,
    })),
  },
}));

vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import { brandTrainingAnalyzeJob } from "./brand-training";
import { RasterImageRejected, RasterRetryError, isRasterRetry } from "@/server/equipe/handoff/raster-image";

interface EventData {
  workspaceId: string;
  clientProfileId: string;
  referenceId: string;
  assetKey: string;
  mimeType: string;
  hasAlpha: boolean;
}

const baseEventData: EventData = {
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
  referenceId: "ref-1",
  assetKey: "workspaces/workspace-1/brand-training/abc-logo.png",
  mimeType: "image/png",
  hasAlpha: true,
};

async function runBrandTrainingAnalyzeJob() {
  const event = { data: baseEventData };
  const step = {
    run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  } as unknown;
  return (brandTrainingAnalyzeJob as unknown as {
    fn: (args: { event: unknown; step: unknown }) => Promise<unknown>;
  }).fn({ event, step });
}

describe("brandTrainingAnalyzeJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controlledProvider.enabled = false;
    measure.failWith = undefined;
    envMock.OPENAI_TEXT_MODEL = "gpt-5.6";
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-6-luna";
    mockGetTrainingReferenceForAnalysis.mockResolvedValue({
      id: baseEventData.referenceId,
      workspaceId: baseEventData.workspaceId,
      clientProfileId: baseEventData.clientProfileId,
      reviewStatus: "pending_analysis",
    });
    mockGetObject.mockResolvedValue(Buffer.from("fake-png-bytes"));
    mockCreateChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              trainingCategory: "graphic",
              usageMode: "reference",
              analysis: {
                description: "Ondas verdes",
                visualAttributes: ["green waves"],
                rules: ["use sparingly"],
                constraints: ["no text overlay"],
                confidence: 0.85,
              },
            }),
          },
        },
      ],
    });
    mockRecordTrainingAnalysis.mockResolvedValue({
      id: baseEventData.referenceId,
      workspaceId: baseEventData.workspaceId,
      clientProfileId: baseEventData.clientProfileId,
      reviewStatus: "pending_approval",
      trainingCategory: "graphic",
      usageMode: "reference",
    });
  });

  it("serializes duplicate analysis events by reference while retaining retries", () => {
    expect(brandTrainingAnalyzeJob).toBeDefined();
    const opts = (brandTrainingAnalyzeJob as unknown as {
      opts: {
        id?: string;
        retries?: number;
        concurrency?: Array<{ limit: number; key?: string }>;
        triggers?: Array<{ event?: string }>;
      };
    }).opts;
    expect(opts.id).toBe("analyze-brand-training-asset");
    expect(opts.retries).toBe(2);
    expect(opts.concurrency).toEqual([{ limit: 1, key: "event.data.referenceId" }]);
    expect(opts.triggers).toEqual([{ event: "brand.training.analyze" }]);
  });

  describe("onFailure", () => {
    type OnFailure = (args: { event: unknown; error: unknown }) => Promise<void>;
    const runOnFailure = (error: unknown = new Error("boom")) => {
      const { onFailure } = (brandTrainingAnalyzeJob as unknown as { opts: { onFailure: OnFailure } }).opts;
      return onFailure({ event: { data: { event: { data: baseEventData } } }, error });
    };

    it("marks the reference analysis_failed once, scoped by workspace, profile and reference", async () => {
      mockMarkTrainingAnalysisFailed.mockResolvedValue({ id: baseEventData.referenceId, reviewStatus: "analysis_failed" });

      await runOnFailure();

      expect(mockMarkTrainingAnalysisFailed).toHaveBeenCalledTimes(1);
      expect(mockMarkTrainingAnalysisFailed).toHaveBeenCalledWith({
        workspaceId: baseEventData.workspaceId,
        clientProfileId: baseEventData.clientProfileId,
        referenceId: baseEventData.referenceId,
      });
      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining("transitioned=true"));
      expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
    });

    it("does not overwrite a concurrent decision: a null from the CAS resolves without throwing", async () => {
      mockMarkTrainingAnalysisFailed.mockResolvedValue(null);

      await expect(runOnFailure("not an Error")).resolves.toBeUndefined();

      expect(mockMarkTrainingAnalysisFailed).toHaveBeenCalledTimes(1);
      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining("transitioned=false"));
    });
  });

  it("asks OpenAI for a structured proposal and persists it via recordTrainingAnalysis", async () => {
    await runBrandTrainingAnalyzeJob();

    expect(mockGetObject).toHaveBeenCalledWith(baseEventData.assetKey);
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as {
      model?: string;
      response_format?: { type?: string };
      messages?: Array<{ role: string; content: unknown }>;
    };
    expect(call.model).toBe("gpt-6-luna");
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call).toMatchObject({
      max_completion_tokens: 4000,
      reasoning_effort: "none",
    });

    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        referenceId: "ref-1",
      },
      {
        existingReviewStatus: "pending_analysis",
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: expect.objectContaining({ description: "Ondas verdes" }),
      },
    );
  });

  it("uses deterministic analysis and never calls OpenAI under the controlled E2E provider", async () => {
    controlledProvider.enabled = true;

    await runBrandTrainingAnalyzeJob();

    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: baseEventData.referenceId }),
      expect.objectContaining({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: expect.objectContaining({
          description: "Controlled E2E brand-training asset",
          confidence: 1,
        }),
      }),
    );
  });

  it.each(["capacity", "wait_timeout", "unavailable"] as const)("a raster retry (%s) in the measurement is rethrown for the durable step to retry: no vendor call and nothing persisted", async reason => {
    measure.failWith = new RasterRetryError(reason);
    const outcome = await runBrandTrainingAnalyzeJob().then(() => undefined, (error: unknown) => error);
    expect(isRasterRetry(outcome)).toBe(true);
    expect(outcome).toMatchObject({ message: `raster_retry:${reason}` });
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
  });
  it("an Inngest-replayed retry (a StepError that keeps only the message) is rethrown too", async () => {
    measure.failWith = Object.assign(new Error("raster_retry:capacity"), { name: "StepError" });
    const outcome = await runBrandTrainingAnalyzeJob().then(() => undefined, (error: unknown) => error);
    expect(isRasterRetry(outcome)).toBe(true);
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
  });
  it("a refusal of this image (unreadable, too large) stays best effort: the analysis goes on without the measurement and is persisted", async () => {
    for (const reason of ["unreadable", "too_large"] as const) {
      vi.clearAllMocks();
      mockGetTrainingReferenceForAnalysis.mockResolvedValue({ id: baseEventData.referenceId, workspaceId: baseEventData.workspaceId, clientProfileId: baseEventData.clientProfileId, reviewStatus: "pending_analysis" });
      mockGetObject.mockResolvedValue(Buffer.from("fake-png-bytes"));
      mockCreateChatCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ trainingCategory: "graphic", usageMode: "reference", analysis: { description: "Ondas", visualAttributes: [], rules: [], constraints: [], confidence: 0.8 } }) } }] });
      mockRecordTrainingAnalysis.mockResolvedValue({ id: baseEventData.referenceId, workspaceId: baseEventData.workspaceId, clientProfileId: baseEventData.clientProfileId, reviewStatus: "pending_approval", trainingCategory: "graphic", usageMode: "reference" });
      measure.failWith = new RasterImageRejected(reason);
      await runBrandTrainingAnalyzeJob();
      expect(mockCreateChatCompletion, reason).toHaveBeenCalledTimes(1);
      expect(mockRecordTrainingAnalysis, reason).toHaveBeenCalledTimes(1);
    }
  });

  it("classifies the asset for generation conditioning", async () => {
    await runBrandTrainingAnalyzeJob();
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const systemMessage = call.messages?.find((m) => m.role === "system");
    const systemContent =
      typeof systemMessage?.content === "string"
        ? systemMessage.content
        : "";
    expect(systemContent.toLowerCase()).toContain("classify");
    expect(systemContent.toLowerCase()).toContain("condition");
  });

  it("persists analysis via recordTrainingAnalysis for human review", async () => {
    await runBrandTrainingAnalyzeJob();
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledTimes(1);
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: baseEventData.referenceId }),
      expect.objectContaining({
        trainingCategory: "graphic",
        usageMode: "reference",
      }),
    );
  });

  it("falls back to an explicit human-review proposal when OpenAI returns no content", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "length",
          message: { content: null, refusal: null },
        },
      ],
    });

    const result = await runBrandTrainingAnalyzeJob();

    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: baseEventData.referenceId }),
      expect.objectContaining({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: expect.objectContaining({
          confidence: 0,
          description: expect.stringContaining("revisão humana"),
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      trainingCategory: "visual_reference",
      usageMode: "reference",
      confidence: 0,
    });
  });

  it("uses OPENAI_BRAND_TRAINING_MODEL and ignores OPENAI_TEXT_MODEL", async () => {
    envMock.OPENAI_TEXT_MODEL = "gpt-4o-mini";
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-6-sol";
    await runBrandTrainingAnalyzeJob();
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockCreateChatCompletion.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-6-sol" });
  });

  it("sends the lowest accepted reasoning effort for the model family: minimal for gpt-5-mini, none for gpt-6*", async () => {
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-5-mini";
    await runBrandTrainingAnalyzeJob();
    expect(mockCreateChatCompletion.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-5-mini", reasoning_effort: "minimal" });

    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-6-luna";
    await runBrandTrainingAnalyzeJob();
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(2);
    expect(mockCreateChatCompletion.mock.calls[1]?.[0]).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "none" });
  });

  it("falls back to gpt-6-luna with effort none when the env value is absent (the env Proxy skips the schema default if another variable fails)", async () => {
    envMock.OPENAI_BRAND_TRAINING_MODEL = undefined;
    await runBrandTrainingAnalyzeJob();
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockCreateChatCompletion.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "none" });
  });

  it("omits the reasoning_effort key for a model that does not take it", async () => {
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-4o-mini";
    await runBrandTrainingAnalyzeJob();
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.model).toBe("gpt-4o-mini");
    expect("reasoning_effort" in call).toBe(false);
  });

  it("caps the completion at 4000 tokens", async () => {
    await runBrandTrainingAnalyzeJob();
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as { max_completion_tokens?: number };
    expect(call.max_completion_tokens).toBe(4000);
  });

  it("an empty answer cut by the token ceiling logs the model, the effort and the usage, then falls back to human review", async () => {
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-5-mini";
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [{ finish_reason: "length", message: { content: null, refusal: null } }],
      usage: { completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 3900 } },
    });

    const result = await runBrandTrainingAnalyzeJob();

    expect(emptyContentWarnings()).toHaveLength(1);
    const message = emptyContentWarnings()[0]!;
    expect(message).toContain("referenceId=ref-1");
    expect(message).toContain("model=gpt-5-mini");
    expect(message).toContain("reasoningEffort=minimal");
    expect(message).toContain("finishReason=length");
    expect(message).toContain("completionTokens=4000");
    expect(message).toContain("reasoningTokens=3900");
    expect(message).toContain("maxCompletionTokens=4000");
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: baseEventData.referenceId }),
      expect.objectContaining({
        trainingCategory: "visual_reference",
        analysis: expect.objectContaining({ confidence: 0 }),
      }),
    );
    expect(result).toMatchObject({ success: true, trainingCategory: "visual_reference", confidence: 0 });
  });

  it("an empty answer without usage or effort says so instead of inventing numbers", async () => {
    envMock.OPENAI_BRAND_TRAINING_MODEL = "gpt-4o-mini";
    mockCreateChatCompletion.mockResolvedValueOnce({ choices: [{ finish_reason: "length", message: { content: null } }] });
    await runBrandTrainingAnalyzeJob();
    expect(emptyContentWarnings()).toHaveLength(1);
    const message = emptyContentWarnings()[0]!;
    expect(message).toContain("reasoningEffort=omitted");
    expect(message).toContain("completionTokens=unknown");
    expect(message).toContain("reasoningTokens=unknown");
  });

  it("rejects invalid proposals that include a forbidden category or mode", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              trainingCategory: "watermark", // not in BRAND_TRAINING_CATEGORIES
              usageMode: "reference",
              analysis: {
                description: "bad",
                visualAttributes: [],
                rules: [],
                constraints: [],
                confidence: 0.5,
              },
            }),
          },
        },
      ],
    });

    await expect(runBrandTrainingAnalyzeJob()).rejects.toThrow();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
  });

  it("rejects proposals with a forbidden usageMode", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              trainingCategory: "graphic",
              usageMode: "clone", // not in BRAND_TRAINING_USAGE_MODES
              analysis: {
                description: "bad",
                visualAttributes: [],
                rules: [],
                constraints: [],
                confidence: 0.5,
              },
            }),
          },
        },
      ],
    });

    await expect(runBrandTrainingAnalyzeJob()).rejects.toThrow();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
  });

  it("skips the second serialized event after the first persists analysis", async () => {
    // The concurrency key serializes duplicate events. Once the first event has
    // persisted, the second re-reads this row and must not re-charge OpenAI.
    mockGetTrainingReferenceForAnalysis.mockResolvedValueOnce({
      id: baseEventData.referenceId,
      workspaceId: baseEventData.workspaceId,
      clientProfileId: baseEventData.clientProfileId,
      reviewStatus: "approved",
      trainingAnalysis: {
        description: "already done",
        visualAttributes: [],
        rules: [],
        constraints: [],
        confidence: 1,
      },
    });

    const result = await runBrandTrainingAnalyzeJob();

    expect(mockGetTrainingReferenceForAnalysis).toHaveBeenCalledWith(
      baseEventData.workspaceId,
      baseEventData.clientProfileId,
      baseEventData.referenceId,
    );
    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      reason: "already_processed",
      referenceId: baseEventData.referenceId,
      reviewStatus: "approved",
    });
  });

  it("does not repeat analysis when a pending approval already has a proposal", async () => {
    mockGetTrainingReferenceForAnalysis.mockResolvedValueOnce({
      id: baseEventData.referenceId,
      workspaceId: baseEventData.workspaceId,
      clientProfileId: baseEventData.clientProfileId,
      reviewStatus: "pending_approval",
      trainingAnalysis: {
        description: "already proposed",
        visualAttributes: [],
        rules: [],
        constraints: [],
        confidence: 1,
      },
    });

    const result = await runBrandTrainingAnalyzeJob();

    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      reason: "already_processed",
      reviewStatus: "pending_approval",
    });
  });

  it("reanalyzes a legacy approved row without revoking approval", async () => {
    mockGetTrainingReferenceForAnalysis.mockResolvedValueOnce({
      id: baseEventData.referenceId,
      workspaceId: baseEventData.workspaceId,
      clientProfileId: baseEventData.clientProfileId,
      reviewStatus: "approved",
      reviewedByUserId: null,
      trainingAnalysis: null,
    });

    const result = await runBrandTrainingAnalyzeJob();

    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledTimes(1);
    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: baseEventData.referenceId }),
      expect.objectContaining({ existingReviewStatus: "approved" }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("advertises valid category and mode enums in the system prompt", async () => {
    await runBrandTrainingAnalyzeJob();
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const systemMessage = call.messages?.find((m) => m.role === "system");
    const systemContent =
      typeof systemMessage?.content === "string"
        ? systemMessage.content
        : "";
    for (const category of BRAND_TRAINING_CATEGORIES) {
      expect(systemContent).toContain(category);
    }
    for (const mode of BRAND_TRAINING_USAGE_MODES) {
      expect(systemContent).toContain(mode);
    }
  });
});
