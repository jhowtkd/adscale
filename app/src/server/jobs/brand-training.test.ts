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

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_TEXT_MODEL: "gpt-5-mini",
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

  it("has Inngest function id, retries, and trigger configured correctly", () => {
    expect(brandTrainingAnalyzeJob).toBeDefined();
    const opts = (brandTrainingAnalyzeJob as unknown as { opts: { id?: string; retries?: number; triggers?: Array<{ event?: string }> } }).opts;
    expect(opts.id).toBe("analyze-brand-training-asset");
    expect(opts.retries).toBe(2);
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
    expect(call.model).toBe("gpt-5-mini");
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call).toMatchObject({ max_completion_tokens: 1600 });

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

  it("short-circuits on stale retry: does not call OpenAI when analysis already exists", async () => {
    // Simulate a retry where the previous attempt already enriched the approved
    // row. The job must skip the LLM call entirely so we don't re-charge OpenAI.
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
