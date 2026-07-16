import { beforeEach, describe, expect, it, vi } from "vitest";

const generateAndStoreImageMock = vi.hoisted(() => vi.fn());
const composeExactBrandAssetsMock = vi.hoisted(() => vi.fn());
const analyzeDerivationCreativeMock = vi.hoisted(() => vi.fn());

const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const markProcessingMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const failMock = vi.hoisted(() => vi.fn());
const failQueuedMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const requeueOnceMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const ensureLibraryMock = vi.hoisted(() => vi.fn());

const objectGetMock = vi.hoisted(() => vi.fn());
const objectPutMock = vi.hoisted(() => vi.fn());

const refundCreditsMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  markCreativeWorkOutputProcessing: (...args: unknown[]) =>
    markProcessingMock(...args),
  completeCreativeWorkOutput: (...args: unknown[]) => completeMock(...args),
  failCreativeWorkOutput: (...args: unknown[]) => failMock(...args),
  failQueuedCreativeWorkOutput: (...args: unknown[]) => failQueuedMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  requeueCreativeWorkOutputOnce: (...args: unknown[]) => requeueOnceMock(...args),
}));

vi.mock("@/server/application/ensure-creative-work-output-library", () => ({
  ensureCreativeWorkOutputInLibrary: (...args: unknown[]) =>
    ensureLibraryMock(...args),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: (...args: unknown[]) => refundCreditsMock(...args),
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
    send: (...args: unknown[]) => sendMock(...args),
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
}

const baseEvent: GenerateEvent = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
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

function makeQueuedOutput(overrides: Partial<{ id: string; status: string; creativeLevel: "conservative" | "balanced" | "bold"; retryCount: number }> = {}) {
  return {
    id: "output-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    creativeLevel: overrides.creativeLevel ?? "balanced",
    targetFormat: "1:1",
    versionNumber: 1,
    revisionInstruction: "Use mais contraste",
    retryCount: overrides.retryCount ?? 0,
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

async function runJob(
  eventData: GenerateEvent = baseEvent,
  onStepResult?: (name: string, result: unknown) => void,
) {
  const event = { data: eventData };
  const step = {
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      onStepResult?.(name, result);
      return result;
    }),
  };
  return (creativeWorkOutputJob as unknown as {
    fn: (args: { event: unknown; step: unknown }) => Promise<unknown>;
  }).fn({ event, step });
}

describe("creativeWorkOutputJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectGetMock.mockImplementation(async (key: string) =>
      key.startsWith("creative-work/output-1/")
        ? Buffer.from("generated-png")
        : Buffer.from("png-bytes"),
    );
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
    failQueuedMock.mockResolvedValue(makeQueuedOutput({ status: "failed", retryCount: 1 }));
    refreshStatusMock.mockResolvedValue("completed");
    refundCreditsMock.mockResolvedValue({ status: "refunded" });
    requeueOnceMock.mockResolvedValue(null);
    sendMock.mockResolvedValue(undefined);
    ensureLibraryMock.mockResolvedValue({
      asset: { id: "asset-1" },
      created: true,
    });
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
        // The score from `analyzeDerivationCreative` is now persisted on
        // the output row — it must no longer be silently dropped.
        quality: expect.objectContaining({
          scoreStatus: "analyzed",
          qualityScore: 80,
        }),
      }),
    );
    // Phase 5 / item 37: library on complete (not only on select).
    expect(ensureLibraryMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      outputKey: expect.stringContaining("creative-work/output-1/"),
      theme: "Tema do Post",
      creativeLevel: "balanced",
    });
    expect(ensureLibraryMock).toHaveBeenCalledAfter(completeMock);
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    // No refund should fire on a happy path.
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it("lets only one duplicate delivery claim the queued output", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock
      .mockResolvedValueOnce(makeQueuedOutput({ status: "processing" }))
      .mockResolvedValueOnce(null);
    const first = await runJob();
    const second = await runJob();
    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ skipped: true });
    expect(generateAndStoreImageMock).toHaveBeenCalledOnce();
  });

  it("does not generate when a partially accepted event arrives after dispatch compensation", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput({ status: "failed" })] });
    markProcessingMock.mockResolvedValue(null);
    const result = await runJob();
    expect(result).toMatchObject({ skipped: true });
    expect(generateAndStoreImageMock).not.toHaveBeenCalled();
    expect(failMock).not.toHaveBeenCalled();
  });

  it("loads creative level and target format from the output row", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput({ creativeLevel: "bold" })] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing", creativeLevel: "bold" }));
    await runJob();
    const request = generateAndStoreImageMock.mock.calls[0]?.[0] as { prompt: string; size: { width: number; height: number } };
    expect(request.prompt).toContain("CREATIVE LEVEL: bold");
    expect(request.prompt).toContain("FORMAT: 1:1");
    expect(request.prompt).toContain("Use mais contraste");
  });

  it("automatically redispatches a marked retryable provider failure once", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(Object.assign(new Error("provider timeout"), { retryable: true }));
    requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
    const result = await runJob();
    expect(result).toMatchObject({ success: false, retrying: true });
    expect(sendMock).toHaveBeenCalledWith({ name: "creative-work.generate", data: baseEvent });
    expect(failMock).not.toHaveBeenCalled();
  });

  it("makes a won auto-retry CAS manually recoverable when redispatch fails", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(Object.assign(new Error("provider timeout"), { retryable: true }));
    requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
    sendMock.mockRejectedValue(new Error("inngest unavailable"));
    const result = await runJob();
    expect(result).toMatchObject({ success: false, failureCode: "auto_retry_dispatch_failed" });
    expect(result).not.toHaveProperty("retrying", true);
    expect(failQueuedMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "auto_retry_dispatch_failed");
  });

  it("does not reopen an output when completion wins the automatic-retry CAS", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(Object.assign(new Error("provider timeout"), { retryable: true }));
    requeueOnceMock.mockResolvedValue(null);
    failMock.mockResolvedValue(null);
    const result = await runJob();
    expect(result).toMatchObject({ success: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("never automatically retries a final low-quality rejection", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    analyzeDerivationCreativeMock.mockResolvedValue({ scoreStatus: "analyzed", qualityScore: 1 });
    await runJob();
    expect(requeueOnceMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips safely when the draft brief is absent", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: { ...workItem, brief: null },
      outputs: [makeQueuedOutput()],
      sources: [],
    });

    await expect(runJob()).resolves.toMatchObject({ success: false, skipped: true });
    expect(markProcessingMock).not.toHaveBeenCalled();
    expect(generateAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("does not return the generated image buffer from an Inngest step", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    const stepResults = new Map<string, unknown>();

    await runJob(baseEvent, (name, result) => stepResults.set(name, result));

    expect(stepResults.get("generate-base")).toEqual({
      outputKey: "creative-work/output-1/1700000000000.png",
    });
  });

  it("never returns binary buffers across Inngest step boundaries", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    const stepResults = new Map<string, unknown>();

    await runJob(baseEvent, (name, result) => stepResults.set(name, result));

    const containsBuffer = (value: unknown): boolean => {
      if (Buffer.isBuffer(value)) return true;
      if (Array.isArray(value)) return value.some(containsBuffer);
      if (value && typeof value === "object") {
        return Object.values(value).some(containsBuffer);
      }
      return false;
    };

    for (const [name, result] of stepResults) {
      expect(containsBuffer(result), `${name} returned binary data`).toBe(false);
    }
  });

  it("does not ensure library when generation fails", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(new Error("provider down"));

    await runJob();

    expect(completeMock).not.toHaveBeenCalled();
    expect(ensureLibraryMock).not.toHaveBeenCalled();
  });

  it("keeps output completed when ensure-library fails (does not mark failed)", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    ensureLibraryMock.mockRejectedValue(new Error("storage unreachable"));

    const result = await runJob();

    expect(completeMock).toHaveBeenCalled();
    expect(failMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        outputId: "output-1",
      })
    );
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

  it("uses style input assets as provider references but keeps content-only sources textual", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: { ...workItem, inputSnapshot: { request: "x", settings: { targetFormats: [] }, sources: [
        { sourceId: "style", updatedAt: "now", assetKey: "style.png", mimeType: "image/png", usage: "style", content: null, style: { description: "editorial" } },
        { sourceId: "content", updatedAt: "now", assetKey: "content.png", mimeType: "image/png", usage: "content", content: { subject: "produto" }, style: null },
      ] } },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    await runJob();
    expect(objectGetMock).toHaveBeenCalledWith("style.png");
    expect(objectGetMock).not.toHaveBeenCalledWith("content.png");
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
    // Provider failures happen AFTER the generator was invoked — the
    // charge covers the dispatch slot and is intentionally non-refundable.
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it("refunds the per-output credit and marks failed when a reference image load fails (pre-generator)", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    objectGetMock.mockRejectedValueOnce(new Error("R2 timeout reading ref-1"));

    await runJob();

    expect(refundCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "image_derivation",
        amount: 5,
        idempotencyKey:
          "creative-work:work-1:output:output-1:pregen-refund",
      }),
    );
    expect(failMock).toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
    expect(generateAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("fails the output as low_quality and refunds when the score is below the threshold", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    analyzeDerivationCreativeMock.mockResolvedValue({
      scoreStatus: "analyzed",
      qualityScore: 30,
    });

    const result = await runJob();

    expect(result).toEqual(
      expect.objectContaining({ success: false, failureCode: "low_quality" }),
    );
    expect(failMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "low_quality",
    );
    expect(refundCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "image_derivation",
        amount: 5,
        idempotencyKey:
          "creative-work:work-1:output:output-1:pregen-refund",
      }),
    );
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("fails the output as low_quality when the scorer explicitly reports scoreStatus='failed'", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    analyzeDerivationCreativeMock.mockResolvedValue({
      scoreStatus: "failed",
      qualityScore: 0,
    });

    const result = await runJob();

    expect(result).toEqual(
      expect.objectContaining({ success: false, failureCode: "low_quality" }),
    );
    expect(failMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "low_quality",
    );
  });

  it("persists quality: null when the scorer itself crashes (best-effort)", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    analyzeDerivationCreativeMock.mockRejectedValue(new Error("scorer 500"));

    await runJob();

    expect(completeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      expect.objectContaining({ quality: null }),
    );
    expect(refundCreditsMock).not.toHaveBeenCalled();
    expect(failMock).not.toHaveBeenCalled();
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
        format: "1:1",
        generationMode: "art_variation",
        creativeLevel: "balanced",
        feedback: null,
        creativeDiagnosis: null,
      }),
    );
    expect(call.locale).toBe("pt-BR");
  });
});
