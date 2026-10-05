import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_TRAINING_CATEGORIES,
  BRAND_TRAINING_USAGE_MODES,
} from "@/server/brand-training/contracts";

const mockCreateChatCompletion = vi.hoisted(() => vi.fn());
const mockGetObject = vi.hoisted(() => vi.fn());
const mockRecordTrainingAnalysis = vi.hoisted(() => vi.fn());
const mockGetTrainingReferenceForAnalysis = vi.hoisted(() => vi.fn());
const controlledProvider = vi.hoisted(() => ({ enabled: false }));
const measure = vi.hoisted(() => ({ failWith: undefined as unknown }));

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
}));

// The brand kit is a fake (no database), so the measurement is reached; the measure itself is the real one unless a test makes it fail.
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: async () => ({ brandColors: ["#071522"] }) }));
vi.mock("@/server/brand-training/measure-image", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/brand-training/measure-image")>();
  return { ...actual, measureImageBuffer: (...args: Parameters<typeof actual.measureImageBuffer>) => (measure.failWith ? Promise.reject(measure.failWith) : actual.measureImageBuffer(...args)) };
});

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_TEXT_MODEL: "gpt-5.6",
    OPENAI_BRAND_TRAINING_MODEL: "gpt-6-luna",
    OPENAI_API_KEY: "test-key",
  },
}));

vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({
      opts,
      fn: handler,
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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
