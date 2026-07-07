import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_TRAINING_CATEGORIES,
  BRAND_TRAINING_USAGE_MODES,
} from "@/server/brand-training/contracts";

const mockCreateChatCompletion = vi.hoisted(() => vi.fn());
const mockGetObject = vi.hoisted(() => vi.fn());
const mockRecordTrainingAnalysis = vi.hoisted(() => vi.fn());

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

vi.mock("@/server/repositories/client-reference", () => ({
  recordTrainingAnalysis: (...args: unknown[]) =>
    mockRecordTrainingAnalysis(...args),
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

    expect(mockRecordTrainingAnalysis).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        referenceId: "ref-1",
      },
      {
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: expect.objectContaining({ description: "Ondas verdes" }),
      },
    );
  });

  it("system prompt forbids the model from claiming approval", async () => {
    await runBrandTrainingAnalyzeJob();
    const call = mockCreateChatCompletion.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const systemMessage = call.messages?.find((m) => m.role === "system");
    const systemContent =
      typeof systemMessage?.content === "string"
        ? systemMessage.content
        : "";
    expect(systemContent.toLowerCase()).toContain("propos");
    expect(systemContent.toLowerCase()).toContain("not");
    expect(systemContent.toLowerCase()).toContain("approv");
  });

  it("never writes reviewStatus: approved", async () => {
    await runBrandTrainingAnalyzeJob();
    for (const call of mockRecordTrainingAnalysis.mock.calls) {
      const payload = call[1] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("reviewStatus");
    }
    expect(mockRecordTrainingAnalysis).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reviewStatus: "approved" }),
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