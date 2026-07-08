import { beforeEach, describe, expect, it, vi } from "vitest";

const generateAndStoreImageMock = vi.hoisted(() => vi.fn());
const composeExactBrandAssetsMock = vi.hoisted(() => vi.fn());
const analyzeDerivationCreativeMock = vi.hoisted(() => vi.fn());

const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const markProcessingMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const failMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());

const objectGetMock = vi.hoisted(() => vi.fn());
const objectPutMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  markCreativeWorkOutputProcessing: (...args: unknown[]) =>
    markProcessingMock(...args),
  completeCreativeWorkOutput: (...args: unknown[]) => completeMock(...args),
  failCreativeWorkOutput: (...args: unknown[]) => failMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(async () => ({ id: "profile-1", name: "Cliente XPTO" })),
}));

vi.mock("@/server/ai/image-generation", () => ({
  generateAndStoreImage: (...args: unknown[]) => generateAndStoreImageMock(...args),
}));

vi.mock("@/server/creative-work/composite", () => ({
  composeExactBrandAssets: (...args: unknown[]) =>
    composeExactBrandAssetsMock(...args),
}));

vi.mock("@/server/ai/creative-score", () => ({
  analyzeDerivationCreative: (...args: unknown[]) =>
    analyzeDerivationCreativeMock(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: (...args: unknown[]) => objectGetMock(...args),
    put: (...args: unknown[]) => objectPutMock(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

import { creativeWorkOutputJob } from "./creative-work";

interface GenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  creativeLevel: "conservative" | "balanced" | "bold";
}

const baseEvent: GenerateEvent = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  creativeLevel: "balanced",
};

const identitySnapshot = {
  clientProfileId: "profile-1",
  confirmedAt: "2026-07-07T00:00:00.000Z",
  assets: [
    {
      referenceId: "ref-exact-1",
      assetKey: "workspaces/workspace-1/brand-training/exact-1.png",
      label: "Logo",
      category: "logo",
      usageMode: "exact",
      analysis: {
        description: "",
        visualAttributes: [],
        rules: [],
        constraints: [],
        confidence: 1,
      },
      mimeType: "image/png",
      hasAlpha: true,
      placement: { gravity: "southeast", widthRatio: 0.4 },
    },
    {
      referenceId: "ref-ref-1",
      assetKey: "workspaces/workspace-1/brand-training/ref-1.png",
      label: "Mood",
      category: "visual_reference",
      usageMode: "reference",
      analysis: {
        description: "warm sunset palette",
        visualAttributes: ["warm", "sunset"],
        rules: [],
        constraints: [],
        confidence: 1,
      },
      mimeType: "image/png",
      hasAlpha: false,
      placement: null,
    },
  ],
  brandKit: {
    colors: [],
    fonts: [],
    toneOfVoice: null,
    prohibitedElements: null,
    requiredElements: null,
  },
};

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "ready",
  brief: {
    theme: "Tema do Post",
    objective: "Reconhecimento",
    audience: "Jovens 18-24",
    offer: "20% off",
  },
  format: "4:5",
  copy: { headline: "H", body: "B", cta: "C" },
  identitySnapshot,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeQueuedOutput(overrides: Partial<{ id: string; status: string; creativeLevel: "conservative" | "balanced" | "bold" }> = {}) {
  return {
    id: "output-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    creativeLevel: overrides.creativeLevel ?? "balanced",
    status: overrides.status ?? "queued",
    outputKey: null,
    cost: null,
    failureCode: null,
    quality: null,
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function runJob(eventData: GenerateEvent = baseEvent) {
  const event = { data: eventData };
  const step = {
    run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  return (creativeWorkOutputJob as unknown as {
    fn: (args: { event: unknown; step: unknown }) => Promise<unknown>;
  }).fn({ event, step });
}

describe("creativeWorkOutputJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectGetMock.mockResolvedValue(Buffer.from("png-bytes"));
    generateAndStoreImageMock.mockResolvedValue({
      outputKey: "creative-work/output-1/1700000000000.png",
      revisedPrompt: "revised",
      imageOperation: "generate",
      buffer: Buffer.from("generated-png"),
    });
    composeExactBrandAssetsMock.mockResolvedValue(Buffer.from("composed-png"));
    analyzeDerivationCreativeMock.mockResolvedValue({
      scoreStatus: "analyzed",
      qualityScore: 80,
    });
    completeMock.mockResolvedValue(makeQueuedOutput({ status: "completed" }));
    failMock.mockResolvedValue(makeQueuedOutput({ status: "failed" }));
    refreshStatusMock.mockResolvedValue("completed");
  });

  it("has Inngest function id, retries=0, and trigger configured correctly", () => {
    expect(creativeWorkOutputJob).toBeDefined();
    const opts = (creativeWorkOutputJob as unknown as {
      opts: { id?: string; retries?: number; triggers?: Array<{ event?: string }> };
    }).opts;
    expect(opts.id).toBe("generate-creative-work-output");
    expect(opts.retries).toBe(0);
    expect(opts.triggers).toEqual([{ event: "creative-work.generate" }]);
  });

  it("runs the full generation sequence on a fresh queued output", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await runJob();

    expect(markProcessingMock).toHaveBeenCalledBefore(generateAndStoreImageMock);
    expect(composeExactBrandAssetsMock).toHaveBeenCalledTimes(1);
    expect(completeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      expect.objectContaining({
        cost: 5,
        outputKey: expect.stringContaining("creative-work/output-1/"),
      }),
    );
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
  });

  it("loads up to four reference-mode asset buffers for image generation", async () => {
    const manyRefs = Array.from({ length: 6 }, (_, i) => ({
      referenceId: `ref-ref-${i}`,
      assetKey: `workspaces/workspace-1/brand-training/ref-${i}.png`,
      label: `Ref ${i}`,
      category: "visual_reference",
      usageMode: "reference",
      analysis: { description: "x", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
      mimeType: "image/png",
      hasAlpha: false,
      placement: null,
    }));
    getCreativeWorkMock.mockResolvedValue({
      work: { ...workItem, identitySnapshot: { ...identitySnapshot, assets: manyRefs } },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await runJob();

    const call = generateAndStoreImageMock.mock.calls[0]?.[0] as {
      referenceImages?: unknown[];
    };
    expect(call.referenceImages).toHaveLength(4);
  });

  it("skips generation entirely when the output is already completed (duplicate event)", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput({ status: "completed" })],
    });

    const result = await runJob();

    expect(result).toEqual(
      expect.objectContaining({ skipped: true, outputId: "output-1" }),
    );
    expect(markProcessingMock).not.toHaveBeenCalled();
    expect(generateAndStoreImageMock).not.toHaveBeenCalled();
    expect(composeExactBrandAssetsMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("marks the output failed with sanitized code, refreshes status, and does not refund on provider error", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(new Error("OpenAI image generation timed out after 300s"));

    await runJob();

    expect(failMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      expect.stringMatching(/^[a-z][a-z0-9_]+$/),
    );
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("composes the exact layers over the generated base and overwrites the generated key", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await runJob();

    expect(composeExactBrandAssetsMock).toHaveBeenCalledWith(
      Buffer.from("generated-png"),
      expect.arrayContaining([
        expect.objectContaining({
          gravity: "southeast",
          widthRatio: 0.4,
        }),
      ]),
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
    // The composed buffer overwrites the generated key via objectStorage.put.
    expect(objectPutMock).toHaveBeenCalledWith(
      "creative-work/output-1/1700000000000.png",
      Buffer.from("composed-png"),
      "image/png",
    );
  });

  it("passes brief fields to analyzeDerivationCreative using the R5 mapping", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await runJob();

    expect(analyzeDerivationCreativeMock).toHaveBeenCalledTimes(1);
    const call = analyzeDerivationCreativeMock.mock.calls[0]?.[0] as {
      campaign: Record<string, string>;
      derivation: Record<string, unknown>;
      locale: string;
    };
    expect(call.campaign).toEqual({
      name: "Tema do Post",
      client: "Cliente XPTO",
      product: "Tema do Post",
      offer: "20% off",
      objective: "Reconhecimento",
      audience: "Jovens 18-24",
    });
    expect(call.derivation).toEqual(
      expect.objectContaining({
        ctaText: "C",
        format: "4:5",
        generationMode: "art_variation",
        creativeLevel: "balanced",
        feedback: null,
        creativeDiagnosis: null,
      }),
    );
    expect(call.locale).toBe("pt-BR");
  });
});