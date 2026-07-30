import { beforeEach, describe, expect, it, vi } from "vitest";

const generateAndStoreImageMock = vi.hoisted(() => vi.fn());
const composeExactBrandAssetsMock = vi.hoisted(() => vi.fn());
const analyzeDerivationCreativeMock = vi.hoisted(() => vi.fn());
const planCreativeRoutesMock = vi.hoisted(() => vi.fn());
const selectCreativeCandidateMock = vi.hoisted(() => vi.fn());

const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const markProcessingMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const failMock = vi.hoisted(() => vi.fn());
const failQueuedMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const recordGenerationAggregateMock = vi.hoisted(() => vi.fn());
const countProcessingOutputsMock = vi.hoisted(() => vi.fn());
const requeueOnceMock = vi.hoisted(() => vi.fn());
const claimImageCallMock = vi.hoisted(() => vi.fn());
const touchHeartbeatMock = vi.hoisted(() => vi.fn());
const normalizeReferenceMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const ensureLibraryMock = vi.hoisted(() => vi.fn());

const objectGetMock = vi.hoisted(() => vi.fn());
const objectPutMock = vi.hoisted(() => vi.fn());

const settleTerminalRefundMock = vi.hoisted(() =>
  vi.fn(
    async (input: {
      decision: {
        refund: boolean;
        reason: string;
        amount?: number;
        idempotencyKey?: string;
      };
    }) => {
      if (!input.decision.refund) {
        return {
          refunded: false as const,
          applied: true as const,
          reason: input.decision.reason,
        };
      }
      return {
        refunded: true as const,
        applied: true as const,
        reason: input.decision.reason,
        status: "refunded" as const,
      };
    },
  ),
);

vi.mock("@/server/generation/settlement", () => ({
  settleTerminalRefund: (...args: unknown[]) =>
    settleTerminalRefundMock(...args),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  CREATIVE_WORK_MAX_IMAGE_CALLS: 2,
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  markCreativeWorkOutputProcessing: (...args: unknown[]) =>
    markProcessingMock(...args),
  completeCreativeWorkOutput: (...args: unknown[]) => completeMock(...args),
  failCreativeWorkOutput: (...args: unknown[]) => failMock(...args),
  failQueuedCreativeWorkOutput: (...args: unknown[]) => failQueuedMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  recordCreativeWorkGenerationAggregate: (...args: unknown[]) =>
    recordGenerationAggregateMock(...args),
  countCreativeWorkProcessingOutputs: (...args: unknown[]) =>
    countProcessingOutputsMock(...args),
  requeueCreativeWorkOutputOnce: (...args: unknown[]) => requeueOnceMock(...args),
  claimCreativeWorkOutputImageCall: (...args: unknown[]) => claimImageCallMock(...args),
  touchCreativeWorkOutputHeartbeat: (...args: unknown[]) => touchHeartbeatMock(...args),
  markCreativeWorkOutputFailureCode: vi.fn(),
}));

vi.mock("@/server/ai/normalize-image-for-ai", () => ({
  normalizeReferenceBuffers: async (references: unknown[]) => references,
}));

vi.mock("@/server/creative-work/reference-normalize", () => ({
  normalizeCreativeWorkReferenceImage: (...args: unknown[]) => normalizeReferenceMock(...args),
  normalizedCreativeWorkReferenceName: (name: string) => name,
}));

vi.mock("@/server/application/ensure-creative-work-output-library", () => ({
  ensureCreativeWorkOutputInLibrary: (...args: unknown[]) =>
    ensureLibraryMock(...args),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(async () => ({ id: "profile-1", name: "Cliente XPTO" })),
}));

vi.mock("@/server/ai/image-generation", () => ({
  generateAndStoreImage: (...args: unknown[]) => generateAndStoreImageMock(...args),
  isRetryableProviderError: (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const value = error as { retryable?: unknown; name?: unknown; code?: unknown; stack?: unknown };
    const stackName = typeof value.stack === "string" ? value.stack.split("\n", 1)[0]?.split(":", 1)[0] : null;
    return value.retryable === true || value.name === "TimeoutError" || value.code === "ETIMEDOUT" || stackName === "TimeoutError";
  },
}));

vi.mock("@/server/creative-work/composite", () => ({
  composeExactBrandAssets: (...args: unknown[]) =>
    composeExactBrandAssetsMock(...args),
}));

vi.mock("@/server/ai/creative-route-planner", () => ({
  planCreativeRoutes: (...args: unknown[]) => planCreativeRoutesMock(...args),
}));

vi.mock("@/server/ai/creative-candidate-selector", () => ({
  selectCreativeCandidate: (...args: unknown[]) =>
    selectCreativeCandidateMock(...args),
}));

vi.mock("@/server/ai/creative-score", () => ({
  analyzeDerivationCreative: (...args: unknown[]) =>
    analyzeDerivationCreativeMock(...args),
}));

const analyzeCreativeWorkQaMock = vi.hoisted(() => vi.fn());
const inspectCreativeWorkImageFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/ai/creative-qa", async (importOriginal) => ({
  // Keep the real QA contracts (R-005 codes/types) and mock only the I/O
  // seams: the vision evaluator and the deterministic file inspector.
  ...(await importOriginal<typeof import("@/server/ai/creative-qa")>()),
  analyzeCreativeWorkQa: (...args: unknown[]) => analyzeCreativeWorkQaMock(...args),
  inspectCreativeWorkImageFile: (...args: unknown[]) => inspectCreativeWorkImageFileMock(...args),
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

import { logger } from "@/lib/logger";
import { observeImagePipelineExternalCall } from "@/server/ai/image-pipeline-telemetry";
import { E2EControlledImageProvider } from "@/server/ai/providers/e2e-controlled-provider";
import { creativeWorkOutputJob } from "./creative-work";

interface GenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  generationCorrelationId: string;
}

const baseEvent: GenerateEvent = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  generationCorrelationId: "generation-1",
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
  generationCorrelationId: "generation-1",
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

function makeQueuedOutput(overrides: Partial<{
  id: string;
  status: string;
  creativeLevel: "conservative" | "balanced" | "bold";
  retryCount: number;
  imageCallCount: number;
  versionNumber: number;
  parentOutputId: string | null;
  revisionInstruction: string | null;
  outputKey: string | null;
  directionId: string | null;
  directionSnapshot: { label: string; instruction: string; order: number } | null;
}> = {}) {
  return {
    id: overrides.id ?? "output-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    generationCorrelationId: "generation-1",
    creativeLevel: overrides.creativeLevel ?? "balanced",
    targetFormat: "1:1",
    versionNumber: overrides.versionNumber ?? 1,
    parentOutputId: overrides.parentOutputId ?? null,
    revisionInstruction: overrides.revisionInstruction ?? "Use mais contraste",
    revisionAssetId: null,
    retryCount: overrides.retryCount ?? 0,
    imageCallCount: overrides.imageCallCount ?? 0,
    status: overrides.status ?? "queued",
    outputKey: overrides.outputKey ?? null,
    directionId: overrides.directionId ?? null,
    directionSnapshot: overrides.directionSnapshot ?? null,
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
    vi.unstubAllEnvs();
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
    // R-005 defaults: a well-formed 1:1 file and a clean objective evaluation,
    // so v1 direct outputs complete with objectiveVerdict "pass".
    inspectCreativeWorkImageFileMock.mockResolvedValue({
      ok: true,
      width: 1080,
      height: 1080,
      format: "png",
      bytes: 4096,
      error: null,
    });
    analyzeCreativeWorkQaMock.mockResolvedValue({
      findings: [],
      summary: "Objetivamente íntegro.",
    });
    // Default: planner unavailable, so legacy social_post outputs fall back to
    // the direct prompt — the same effective behavior these tests had before
    // the planner module was mocked.
    planCreativeRoutesMock.mockRejectedValue(new Error("planner unavailable in tests"));
    selectCreativeCandidateMock.mockResolvedValue({ winnerIndex: 0, invalidRouteIds: [], reason: "only candidate" });
    completeMock.mockResolvedValue(makeQueuedOutput({ status: "completed" }));
    failMock.mockResolvedValue(makeQueuedOutput({ status: "failed" }));
    failQueuedMock.mockResolvedValue(makeQueuedOutput({ status: "failed", retryCount: 1 }));
    refreshStatusMock.mockResolvedValue("completed");
    recordGenerationAggregateMock.mockResolvedValue(null);
    countProcessingOutputsMock.mockResolvedValue(1);
    settleTerminalRefundMock.mockClear();
    requeueOnceMock.mockResolvedValue(null);
    // R-006/R-007 defaults: the first provider call is claimable and the
    // lease is always held; tests exercise exhaustion/lease-loss explicitly.
    claimImageCallMock.mockImplementation(async () =>
      makeQueuedOutput({ status: "processing", imageCallCount: 1 }),
    );
    touchHeartbeatMock.mockImplementation(async () =>
      makeQueuedOutput({ status: "processing" }),
    );
    // Identity normalization: buffers/mimeTypes pass through unchanged.
    normalizeReferenceMock.mockImplementation(
      async (input: { buffer: Buffer; mimeType?: string }) => ({
        buffer: input.buffer,
        mimeType: input.mimeType ?? "image/png",
        width: 1080,
        height: 1080,
        originalBytes: input.buffer.byteLength,
        finalBytes: input.buffer.byteLength,
        hasTransparency: false,
      }),
    );
    sendMock.mockResolvedValue(undefined);
    ensureLibraryMock.mockResolvedValue({
      asset: { id: "asset-1" },
      created: true,
    });
  });

  it("has a global single-image-job limit on the 512 MB production instance", () => {
    expect(creativeWorkOutputJob).toBeDefined();
    const opts = (creativeWorkOutputJob as unknown as {
      opts: {
        id?: string;
        retries?: number;
        concurrency?: Array<{ limit: number; scope?: string; key?: string }>;
        onFailure?: (...args: unknown[]) => Promise<unknown>;
        triggers?: Array<{ event?: string }>;
      };
    }).opts;
    expect(opts.id).toBe("generate-creative-work-output");
    expect(opts.retries).toBe(0);
    expect(opts.concurrency).toEqual([
      { limit: 1, scope: "account", key: `"creative-work-image"` },
    ]);
    expect(opts.onFailure).toBeDefined();
    expect(opts.triggers).toEqual([{ event: "creative-work.generate" }]);
    // R-007: at most one Creative Work image call in flight on rollout.
  });

  it("closes and refunds an output when the worker dies outside the handler", async () => {
    const onFailure = (creativeWorkOutputJob as unknown as {
      opts: { onFailure: (args: unknown) => Promise<unknown> };
    }).opts.onFailure;
    failMock.mockResolvedValue(makeQueuedOutput({ status: "failed" }));
    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await onFailure({
      event: { data: { event: { data: baseEvent } } },
      error: new Error("worker lost"),
      step,
    });

    expect(failMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "generation_interrupted",
    );
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(settleTerminalRefundMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      decision: expect.objectContaining({
        refund: true,
        amount: 5,
        idempotencyKey: "creative-output:output-1:compensatory-refund",
      }),
    }));
  });

  it("still emits the interrupted terminal event when aggregate telemetry fails", async () => {
    const onFailure = (creativeWorkOutputJob as unknown as {
      opts: { onFailure: (args: unknown) => Promise<unknown> };
    }).opts.onFailure;
    failMock.mockResolvedValue(makeQueuedOutput({ status: "failed" }));
    recordGenerationAggregateMock.mockRejectedValueOnce(new Error("aggregate store down"));
    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await onFailure({
      event: { data: { event: { data: baseEvent } } },
      error: new Error("worker lost"),
      step,
    });

    const terminalEvents = [
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ].filter(([payload]) => (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { event?: string }).event === "creative_work_output_terminal"
    ));
    expect(terminalEvents).toHaveLength(1);
    expect(terminalEvents[0]?.[0]).toEqual(expect.objectContaining({
      failureCode: "generation_interrupted",
      refunded: true,
    }));
  });

  it("recovers the persisted correlation for legacy failure events", async () => {
    const onFailure = (creativeWorkOutputJob as unknown as {
      opts: { onFailure: (args: unknown) => Promise<unknown> };
    }).opts.onFailure;
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    failMock.mockResolvedValue(makeQueuedOutput({ status: "failed" }));
    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await onFailure({
      event: { data: { event: { data: { ...baseEvent, generationCorrelationId: undefined } } } },
      error: new Error("worker lost"),
      step,
    });

    const terminalEvents = [
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ].filter(([payload]) => (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { event?: string }).event === "creative_work_output_terminal"
    ));
    expect(terminalEvents).toEqual([
      [expect.objectContaining({ generationCorrelationId: "generation-1" })],
    ]);
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
    expect(settleTerminalRefundMock).not.toHaveBeenCalled();
  });

  it("normalizes serialized Inngest timestamps before measuring queue wait", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue({
      ...makeQueuedOutput({ status: "processing" }),
      queuedAt: "2026-07-28T12:00:00.000Z",
      createdAt: "2026-07-28T12:00:00.000Z",
      updatedAt: "2026-07-28T12:00:00.250Z",
    } as unknown as ReturnType<typeof makeQueuedOutput>);

    await expect(runJob()).resolves.toMatchObject({ success: true });

    const queueWait = vi.mocked(logger.info).mock.calls
      .map(([payload]) => payload)
      .find((payload) => (
        typeof payload === "object" && payload !== null &&
        (payload as { event?: string }).event === "creative_work_output_stage" &&
        (payload as { stage?: string }).stage === "queue_wait"
      ));
    expect(queueWait).toEqual(expect.objectContaining({ stageDurationMs: 250 }));
  });

  it("proves the deterministic correlated timeline without network timing", async () => {
    const provider = E2EControlledImageProvider.forUnitTests();
    generateAndStoreImageMock.mockImplementationOnce(async (input: {
      prompt: string;
      dimensions: { width: number; height: number };
      referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
      outputPrefix: string;
      attempt?: number;
      generationMode?: "art_variation" | "format_adaptation" | "restyling";
      telemetry?: { generationCorrelationId?: string; [key: string]: unknown };
    }) => {
      const candidate = await observeImagePipelineExternalCall({
        callType: "image",
        attempt: input.attempt ?? 0,
        ...input.telemetry,
      }, () => provider.generate({
        prompt: input.prompt,
        dimensions: input.dimensions,
        referenceImages: input.referenceImages,
        outputPrefix: input.outputPrefix,
        attempt: input.attempt,
        generationMode: input.generationMode ?? "art_variation",
      }));
      return {
        outputKey: "creative-work/output-1/deterministic.png",
        revisedPrompt: input.prompt,
        imageOperation: "generate" as const,
        buffer: candidate.buffer,
        candidates: [],
        providerCalls: 1,
        providerRetries: 0,
      };
    });
    getCreativeWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        toolKind: "single",
        inputSnapshot: {
          generationPolicyVersion: "quality_recovery_v1",
          request: "Deterministic generation",
          settings: { targetFormats: [] },
          sources: [],
        },
      },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await expect(runJob()).resolves.toMatchObject({ success: true });

    const structuredEvents = vi.mocked(logger.info).mock.calls
      .map(([payload]) => payload)
      .filter((payload): payload is { event: string; [key: string]: unknown } => (
        typeof payload === "object" && payload !== null &&
        typeof (payload as { event?: unknown }).event === "string"
      ));
    const stageEvents = structuredEvents.filter((event) => event.event === "creative_work_output_stage");
    const externalEvents = structuredEvents.filter((event) => event.event === "image_pipeline_external_call");
    const terminalEvents = structuredEvents.filter((event) => event.event === "creative_work_output_terminal");

    expect(stageEvents.map((event) => `${event.stage}:${event.status}`)).toEqual([
      "queue_wait:completed",
      "generate_base:started",
      "claim_image_call:completed",
      "generate_base:completed",
      "quality_assessment:started",
      "quality_assessment:completed",
    ]);
    expect(stageEvents.every((event) => event.generationCorrelationId === "generation-1")).toBe(true);
    expect(externalEvents.map((event) => `${event.callType}:${event.result}`)).toEqual([
      "image:success",
      "qa:success",
      "score:success",
    ]);
    expect(externalEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        callType: "image",
        generationCorrelationId: "generation-1",
        result: "success",
      }),
      expect.objectContaining({
        callType: "score",
        generationCorrelationId: "generation-1",
        result: "success",
      }),
    ]));
      expect(terminalEvents).toEqual([
        expect.objectContaining({
          generationCorrelationId: "generation-1",
          imageCallCount: 1,
          providerCalls: 1,
          activeUnitCount: 1,
        outcome: "completed",
        rssMb: expect.any(Number),
        heapUsedMb: expect.any(Number),
      }),
    ]);
  });

  it("routes the job by the generation policy version frozen in the snapshot, not the env switch", async () => {
    // The env switch only steers NEW preparations; an output whose snapshot
    // froze quality_recovery_v1 keeps that contract even after rollback.
    vi.stubEnv("CREATIVE_WORK_QUALITY_RECOVERY_ENABLED", "false");
    getCreativeWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        inputSnapshot: {
          generationPolicyVersion: "quality_recovery_v1",
          request: "x",
          settings: { targetFormats: [] },
          sources: [],
        },
      },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    const result = await runJob();

    expect(result).toMatchObject({ success: true });
    expect(completeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      expect.objectContaining({ outputKey: expect.stringContaining("creative-work/output-1/") }),
    );
    const infoMessages = vi.mocked(logger.info).mock.calls.map(([message]) => String(message));
    expect(infoMessages.some((message) => message.includes("policy=quality_recovery_v1"))).toBe(true);
  });

  it("treats a snapshot without generationPolicyVersion as legacy even with the switch on", async () => {
    vi.stubEnv("CREATIVE_WORK_QUALITY_RECOVERY_ENABLED", "true");
    getCreativeWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        inputSnapshot: { request: "x", settings: { targetFormats: [] }, sources: [] },
      },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    const result = await runJob();

    expect(result).toMatchObject({ success: true });
    expect(completeMock).toHaveBeenCalled();
    const infoMessages = vi.mocked(logger.info).mock.calls.map(([message]) => String(message));
    expect(infoMessages.some((message) => message.includes("quality_recovery_v1"))).toBe(false);
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

  it("appends the frozen direction snapshot instruction to the prompt", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput({
        directionId: "d1",
        directionSnapshot: { label: "A", instruction: "Use a dark cinematic mood", order: 0 },
      })],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({
      status: "processing",
      directionId: "d1",
      directionSnapshot: { label: "A", instruction: "Use a dark cinematic mood", order: 0 },
    }));
    await runJob();
    const request = generateAndStoreImageMock.mock.calls[0]?.[0] as { prompt: string };
    expect(request.prompt).toContain("DIRECTION INSTRUCTION:");
    expect(request.prompt).toContain("Use a dark cinematic mood");
  });

  it("passes the persisted output retry count as the canonical attempt", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput({ retryCount: 2 })],
    });
    markProcessingMock.mockResolvedValue(
      makeQueuedOutput({ status: "processing", retryCount: 2 }),
    );

    await runJob();

    expect(generateAndStoreImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
  });

  it("uses the completed parent image as the primary revision reference without overwriting it", async () => {
    const parent = makeQueuedOutput({
      id: "output-v1",
      status: "completed",
      outputKey: "creative-work/output-v1/original.png",
      revisionInstruction: null,
    });
    const revision = makeQueuedOutput({
      id: "output-1",
      versionNumber: 2,
      parentOutputId: parent.id,
      revisionInstruction: "Troque o fundo por azul",
    });
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [parent, revision] });
    markProcessingMock.mockResolvedValue({ ...revision, status: "processing" });

    await runJob();

    const request = generateAndStoreImageMock.mock.calls[0]?.[0] as {
      prompt: string;
      referenceImages: Array<{ name: string; buffer: Buffer }>;
      outputPrefix: string;
      generationMode: string;
    };
    expect(objectGetMock).toHaveBeenCalledWith("creative-work/output-v1/original.png");
    expect(request.referenceImages[0]).toEqual(expect.objectContaining({ name: "Versão 1" }));
    expect(request.prompt).toContain("Troque o fundo por azul");
    expect(request.generationMode).toBe("art_variation");
    expect(request.outputPrefix).toBe("creative-work/output-1");
    expect(parent.outputKey).toBe("creative-work/output-v1/original.png");
  });

  it("does not requeue a legacy provider failure after the pipeline retry budget", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(Object.assign(new Error("provider timeout"), { retryable: true }));
    requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
    const result = await runJob();
    expect(result).toMatchObject({ success: false, failureCode: "provider_timeout" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(requeueOnceMock).not.toHaveBeenCalled();
    expect(failMock).toHaveBeenCalled();
  });

  it("settles a transported legacy provider failure without a second job dispatch", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    const transported = new Error("All image candidates failed: Error: upstream request failed");
    transported.name = "Error";
    transported.stack = `TimeoutError: ${transported.message}\n    at generateAndStoreImage (image-generation.ts:1:1)`;
    generateAndStoreImageMock.mockRejectedValue(transported);
    requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
    const result = await runJob();
    expect(result).toMatchObject({ success: false, failureCode: "all_image_candidates_failed_error_upstream_request_failed" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(requeueOnceMock).not.toHaveBeenCalled();
  });

  it("refunds a terminal legacy provider failure with the compensatory policy", async () => {
    getCreativeWorkMock.mockResolvedValue({ work: workItem, outputs: [makeQueuedOutput()] });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    generateAndStoreImageMock.mockRejectedValue(Object.assign(new Error("provider timeout"), { retryable: true }));
    requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
    const result = await runJob();
    expect(result).toMatchObject({ success: false, failureCode: "provider_timeout" });
    expect(requeueOnceMock).not.toHaveBeenCalled();
    expect(settleTerminalRefundMock).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({
        refund: true,
        idempotencyKey: "creative-output:output-1:compensatory-refund",
      }),
    }));
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

  it("sends both the original and style image to the provider for restyle", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "restyle", inputSnapshot: { request: "", settings: { targetFormats: [] }, sources: [
        { sourceId: "style", updatedAt: "now", assetKey: "style.png", mimeType: "image/png", usage: "style", content: null, style: { description: "editorial" } },
        { sourceId: "content", updatedAt: "now", assetKey: "content.png", mimeType: "image/png", usage: "content", content: { subject: "produto" }, style: null },
      ] } },
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

    await runJob();

    expect(objectGetMock).toHaveBeenCalledWith("style.png");
    expect(objectGetMock).toHaveBeenCalledWith("content.png");
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

  it("marks the output failed and refunds according to the post-provider policy", async () => {
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
    expect(settleTerminalRefundMock).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({
        refund: true,
        idempotencyKey: "creative-output:output-1:compensatory-refund",
      }),
    }));
  });

  it("refunds the per-output credit and marks failed when a reference image load fails (pre-generator)", async () => {
    getCreativeWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [makeQueuedOutput()],
    });
    markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
    objectGetMock.mockRejectedValueOnce(new Error("R2 timeout reading ref-1"));

    await runJob();

    expect(settleTerminalRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        decision: expect.objectContaining({
          refund: true,
          amount: 5,
          idempotencyKey: "creative-output:output-1:compensatory-refund",
        }),
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
    expect(settleTerminalRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        decision: expect.objectContaining({
          refund: true,
          amount: 5,
          idempotencyKey: "creative-output:output-1:compensatory-refund",
        }),
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
    expect(settleTerminalRefundMock).not.toHaveBeenCalled();
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

  describe("quality_recovery_v1 protocol routing", () => {
    const v1Snapshot = {
      generationPolicyVersion: "quality_recovery_v1" as const,
      request: "Promoção de agosto com vagas limitadas",
      settings: { targetFormats: [] },
      sources: [],
    };

    /** R-003: adaptation/restyle snapshots carry the mandatory ready sources. */
    const v1Source = (
      sourceId: string,
      usage: "content" | "style" | "both",
      assetKey: string | null = `${sourceId}.png`,
    ) => ({
      sourceId,
      updatedAt: "2026-07-20T00:00:00.000Z",
      assetKey,
      mimeType: assetKey ? "image/png" : null,
      usage,
      content: usage === "style" ? null : { product: "Produto da arte" },
      style: usage === "content" ? null : { description: "Editorial" },
    });

    const v1AdaptationSnapshot = {
      ...v1Snapshot,
      sources: [v1Source("original", "content")],
    };

    const v1RestyleSnapshot = {
      ...v1Snapshot,
      sources: [v1Source("conteudo", "content"), v1Source("estilo", "style")],
    };

    function referenceNames(): string[] {
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        referenceImages: Array<{ name: string }>;
      };
      return input.referenceImages.map((reference) => reference.name);
    }

    const ROUTES = ["one", "two", "three"].map((name, index) => ({
      id: `route-${index + 1}`,
      thesis: `Thesis ${name}`,
      visualMechanism: `mechanism-${name}`,
      scene: `Scene ${name}`,
      composition: `Composition ${name}`,
      preserve: ["brand"],
      avoid: ["AI slop"],
      renderPrompt: `Render ${name}`,
    }));

    function v1Work(toolKind: string) {
      return { ...workItem, toolKind, inputSnapshot: v1Snapshot };
    }

    function executorModes(): string[] {
      return vi.mocked(logger.info).mock.calls
        .map(([message]) => String(message))
        .filter((message) => message.includes("[executeCanonicalGeneration]"))
        .map((message) => message.match(/mode=(\w+)/)?.[1] ?? "");
    }

    it("Peça única: one direct social_post call without planner, judge or refinement", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("single"),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(planCreativeRoutesMock).not.toHaveBeenCalled();
      expect(selectCreativeCandidateMock).not.toHaveBeenCalled();
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      expect(generateAndStoreImageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          // social_post maps to art_variation at the provider seam.
          generationMode: "art_variation",
          executionPolicy: "direct",
          routes: undefined,
          selectCandidate: undefined,
        }),
      );
      expect(executorModes()).toEqual(["social_post"]);
    });

    it("Variações: each output runs one direct art_variation call on the same snapshot with its persisted level", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("variations"),
        outputs: [
          makeQueuedOutput({ id: "output-1", creativeLevel: "conservative" }),
          makeQueuedOutput({ id: "output-2", creativeLevel: "bold" }),
        ],
      });
      markProcessingMock.mockImplementation(async () => makeQueuedOutput({ status: "processing" }));

      await runJob({ ...baseEvent, outputId: "output-1" });
      await runJob({ ...baseEvent, outputId: "output-2" });

      expect(planCreativeRoutesMock).not.toHaveBeenCalled();
      expect(selectCreativeCandidateMock).not.toHaveBeenCalled();
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(2);
      const prompts = generateAndStoreImageMock.mock.calls.map(
        ([input]) => (input as { prompt: string }).prompt,
      );
      expect(prompts[0]).toContain("CREATIVE LEVEL: conservative");
      expect(prompts[1]).toContain("CREATIVE LEVEL: bold");
      // Same frozen input snapshot feeds both directions.
      expect(prompts[0]).toContain("REQUEST: Promoção de agosto com vagas limitadas");
      expect(prompts[1]).toContain("REQUEST: Promoção de agosto com vagas limitadas");
      for (const [input] of generateAndStoreImageMock.mock.calls) {
        expect(input).toEqual(
          expect.objectContaining({ generationMode: "art_variation", executionPolicy: "direct" }),
        );
      }
      expect(executorModes()).toEqual(["art_variation", "art_variation"]);
    });

    it("Adaptar formatos: one direct format_adaptation call with the original art first", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "format_adaptation", inputSnapshot: v1AdaptationSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      expect(planCreativeRoutesMock).not.toHaveBeenCalled();
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      expect(generateAndStoreImageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          generationMode: "format_adaptation",
          executionPolicy: "direct",
          routes: undefined,
          selectCandidate: undefined,
        }),
      );
      expect(executorModes()).toEqual(["format_adaptation"]);
      // R-003: the original art occupies the first position; optional brand
      // identity only fills the remaining slots. Source labels are role
      // fallbacks — never the raw internal source id.
      expect(referenceNames()).toEqual(["Original art", "Mood"]);
      expect(objectGetMock).toHaveBeenCalledWith("original.png");
    });

    it("Adaptar formatos: fails as reference_failure with zero image calls when the original is not ready", async () => {
      getCreativeWorkMock.mockResolvedValue({
        // Stale snapshot: the original was frozen without an asset key
        // (cross-workspace or deleted asset) — there is no fallback generate.
        work: { ...workItem, toolKind: "format_adaptation", inputSnapshot: {
          ...v1Snapshot,
          sources: [v1Source("original", "content", null)],
        } },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "reference_failure" });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "reference_failure");
      // Pre-provider failure: the per-output credit is refunded.
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-1",
          decision: expect.objectContaining({ refund: true, amount: 5 }),
        }),
      );
      expect(completeMock).not.toHaveBeenCalled();
    });

    it("Adaptar formatos: fails as reference_failure with zero image calls when the original download is invalid", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "format_adaptation", inputSnapshot: v1AdaptationSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
      objectGetMock.mockImplementation(async (key: string) => {
        if (key === "original.png") throw new Error("R2 NoSuchKey");
        return Buffer.from("png-bytes");
      });

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "reference_failure" });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "reference_failure");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-1",
          decision: expect.objectContaining({ refund: true, amount: 5 }),
        }),
      );
    });

    it("Mudar estilo: one direct restyling call sending content first, style second, identity last", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: v1RestyleSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      expect(planCreativeRoutesMock).not.toHaveBeenCalled();
      expect(generateAndStoreImageMock).toHaveBeenCalledWith(
        expect.objectContaining({ generationMode: "restyling", executionPolicy: "direct" }),
      );
      expect(executorModes()).toEqual(["restyling"]);
      // R-003: content authority, then style authority, then the optional
      // brand identity asset inside the provider limit.
      expect(referenceNames()).toEqual(["Content source", "Style source", "Mood"]);
      expect(objectGetMock).toHaveBeenCalledWith("conteudo.png");
      expect(objectGetMock).toHaveBeenCalledWith("estilo.png");
    });

    it("Mudar estilo: never evicts mandatory content/style references for optional identity", async () => {
      const fourIdentityRefs = Array.from({ length: 4 }, (_, index) => ({
        referenceId: `ref-ref-${index}`,
        assetKey: `workspaces/workspace-1/brand-training/ref-${index}.png`,
        label: `Identidade ${index}`,
        category: "visual_reference",
        usageMode: "reference",
        analysis: { description: "x", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
        mimeType: "image/png",
        hasAlpha: false,
        placement: null,
      }));
      getCreativeWorkMock.mockResolvedValue({
        work: {
          ...workItem,
          toolKind: "restyle",
          inputSnapshot: {
            ...v1Snapshot,
            sources: [v1Source("conteudo", "content"), v1Source("conteudo-b", "both"), v1Source("estilo", "style")],
          },
          identitySnapshot: { ...identitySnapshot, assets: fourIdentityRefs },
        },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      // Limit 4: all three mandatory sources stay; only one identity slot remains.
      expect(referenceNames()).toEqual([
        "Content source",
        "Content source",
        "Style source",
        "Identidade 0",
      ]);
    });

    it("Mudar estilo: drops an optional identity reference whose download fails and still generates with the mandatory authorities", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: v1RestyleSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
      const failingIdentityKey = "workspaces/workspace-1/brand-training/ref-1.png";
      objectGetMock.mockImplementation(async (key: string) => {
        if (key === failingIdentityKey) throw new Error("R2 NoSuchKey");
        return Buffer.from(`bytes:${key}`);
      });

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      // The failed optional slot was filtered out; every mandatory authority
      // reached the provider with its bytes intact.
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        referenceImages: Array<{ name: string; buffer: Buffer }>;
      };
      expect(input.referenceImages.map((reference) => reference.name)).toEqual(["Content source", "Style source"]);
      expect(input.referenceImages.map((reference) => reference.buffer.toString())).toEqual([
        "bytes:conteudo.png",
        "bytes:estilo.png",
      ]);
      expect(
        vi.mocked(logger.warn).mock.calls.some(([message]) =>
          String(message).includes("optional reference skipped") && String(message).includes(failingIdentityKey)),
      ).toBe(true);
      expect(failMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("numbers the prompt references after the slots that actually loaded when an optional download fails", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: v1RestyleSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
      const failingIdentityKey = "workspaces/workspace-1/brand-training/ref-1.png";
      objectGetMock.mockImplementation(async (key: string) => {
        if (key === failingIdentityKey) throw new Error("R2 NoSuchKey");
        return Buffer.from(`bytes:${key}`);
      });

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        prompt: string;
        referenceImages: Array<{ name: string }>;
      };
      // The skipped optional slot leaves BOTH the prompt block and the
      // provider array, so `#n` still matches the n-th attached image.
      expect(input.prompt).toContain('- #1 [content] "Content source" (required)');
      expect(input.prompt).toContain('- #2 [style] "Style source" (required)');
      expect(input.prompt).not.toContain("- #3");
      expect(input.prompt).toContain("image #1 is the first attached image");
      expect(input.referenceImages.map((reference) => reference.name)).toEqual([
        "Content source",
        "Style source",
      ]);
    });

    it("Mudar estilo: still fails as reference_failure when a REQUIRED source download fails", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: v1RestyleSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));
      objectGetMock.mockImplementation(async (key: string) => {
        if (key === "conteudo.png") throw new Error("R2 NoSuchKey");
        return Buffer.from(`bytes:${key}`);
      });

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "reference_failure" });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "reference_failure");
    });

    it("Mudar estilo: rejects a visually incomplete combination as reference_failure before the provider", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: {
          ...v1Snapshot,
          sources: [v1Source("conteudo", "content"), v1Source("estilo", "style", null)],
        } },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "reference_failure" });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "reference_failure");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-1",
          decision: expect.objectContaining({ refund: true, amount: 5 }),
        }),
      );
    });

    it("Revisão: one direct creative_revision call linked to the completed parent", async () => {
      const parent = makeQueuedOutput({
        id: "output-v1",
        status: "completed",
        outputKey: "creative-work/output-v1/original.png",
        revisionInstruction: null,
      });
      const revision = makeQueuedOutput({
        id: "output-1",
        versionNumber: 2,
        parentOutputId: parent.id,
        revisionInstruction: "Troque o fundo por azul",
      });
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("variations"),
        outputs: [parent, revision],
      });
      markProcessingMock.mockResolvedValue({ ...revision, status: "processing" });

      await runJob();

      expect(planCreativeRoutesMock).not.toHaveBeenCalled();
      expect(selectCreativeCandidateMock).not.toHaveBeenCalled();
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        executionPolicy?: string;
        referenceImages: Array<{ name: string }>;
      };
      expect(input.executionPolicy).toBe("direct");
      expect(input.referenceImages[0]).toEqual(expect.objectContaining({ name: "Versão 1" }));
      expect(executorModes()).toEqual(["creative_revision"]);
    });

    it("R-004: v1 direct outputs use the protocol-aware prompt with the frozen fact pack", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: {
          ...v1Work("variations"),
          inputSnapshot: {
            ...v1Snapshot,
            factPack: {
              version: 1,
              request: "Promoção de agosto com vagas limitadas",
              facts: [
                { value: "agosto", class: "date", required: true, origin: "request" },
                { value: "vagas limitadas", class: "condition", required: true, origin: "request" },
              ],
              brand: { requiredElements: ["Logo visível"], prohibitedElements: [] },
              identity: {
                clientProfileId: "profile-1",
                brandName: "Cliente XPTO",
                brandAuthority: "active",
              },
            },
          },
        },
        outputs: [makeQueuedOutput({ creativeLevel: "conservative" })],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      const { prompt } = generateAndStoreImageMock.mock.calls[0]?.[0] as { prompt: string };
      expect(prompt).toContain("CREATIVE WORK ART_VARIATION — VISUAL PROMPT");
      expect(prompt).toContain("FACT PACK — AUDITABLE FACTUAL CONTRACT:");
      expect(prompt).toContain("REQUEST: Promoção de agosto com vagas limitadas");
      expect(prompt).toContain('[date] "agosto" (origin: request)');
      expect(prompt).toContain('[condition] "vagas limitadas" (origin: request)');
      expect(prompt).toContain("BRAND NAME: Cliente XPTO");
      expect(prompt).toContain("MODE POLICY — VARIATION:");
      expect(prompt).toContain("CREATIVE LEVEL: conservative");
      // The legacy persisted-brief block and its generic audience are gone.
      expect(prompt).not.toContain("PERSISTED BRIEF AND INPUT:");
      expect(prompt).not.toContain("Público da marca");
    });

    it("warns without failing when a v1 direct output resolves no frozen fact pack", async () => {
      // v1 direct outputs freeze the fact pack at prepare time (R-002); a
      // snapshot without one is an upstream anomaly — logged, never failed.
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("variations"),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      const warnMessages = vi.mocked(logger.warn).mock.calls.map(([message]) => String(message));
      expect(
        warnMessages.some((message) =>
          message.includes("without frozen fact pack") &&
          message.includes("outputId=output-1") &&
          message.includes("workItemId=work-1")),
      ).toBe(true);
      // Generation follows with the snapshot request as sole factual authority.
      const { prompt } = generateAndStoreImageMock.mock.calls[0]?.[0] as { prompt: string };
      expect(prompt).toContain("REQUEST: Promoção de agosto com vagas limitadas");
      expect(prompt).toContain("no frozen fact pack");
    });

    it("keeps the legacy tournament for the explicit social_post toolKind under v1", async () => {
      planCreativeRoutesMock.mockResolvedValue(ROUTES);
      generateAndStoreImageMock.mockResolvedValueOnce({
        outputKey: "creative-work/output-1/1700000000000.png",
        revisedPrompt: "revised",
        imageOperation: "generate",
        buffer: Buffer.from("generated-png"),
        providerCalls: 3,
        providerRetries: 0,
      });
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("social_post"),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      expect(planCreativeRoutesMock).toHaveBeenCalledTimes(1);
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        routes?: Array<{ id: string }>;
        selectCandidate?: unknown;
        executionPolicy?: string;
      };
      expect(input.routes?.map((route) => route.id)).toEqual(["route-1", "route-2", "route-3"]);
      expect(input.selectCandidate).toEqual(expect.any(Function));
      expect(input.executionPolicy).toBe("legacy_tournament");
      const terminalEvent = vi.mocked(logger.info).mock.calls
        .map(([payload]) => payload)
        .find((payload) => (
          typeof payload === "object" && payload !== null &&
          (payload as { event?: string }).event === "creative_work_output_terminal"
        ));
      expect(terminalEvent).toEqual(expect.objectContaining({ providerCalls: 3 }));
    });

    it("keeps legacy-frozen works on the planner path even for variations", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: {
          ...workItem,
          toolKind: "variations",
          inputSnapshot: { request: "x", settings: { targetFormats: [] }, sources: [] },
        },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      // Legacy contract: the job still sends social_post and the executor
      // still consults the route planner (which fails here and falls back).
      expect(planCreativeRoutesMock).toHaveBeenCalledTimes(1);
      const input = generateAndStoreImageMock.mock.calls[0]?.[0] as { executionPolicy?: string };
      expect(input.executionPolicy).toBeUndefined();
    });

    it("creates no extra image call, charge or event when the same v1 confirmation is redelivered", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work("single"),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing" }))
        .mockResolvedValueOnce(null);

      const first = await runJob();
      const second = await runJob();

      expect(first).toMatchObject({ success: true });
      expect(second).toMatchObject({ skipped: true });
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("R-005 objective QA tri-state persistence (v1 direct)", () => {
    const v1Snapshot = {
      generationPolicyVersion: "quality_recovery_v1" as const,
      request: "Promoção de agosto com vagas limitadas",
      settings: { targetFormats: [] },
      sources: [],
    };

    function v1DirectWork() {
      return { ...workItem, toolKind: "single", inputSnapshot: v1Snapshot };
    }

    function completedQuality(): Record<string, unknown> {
      const call = completeMock.mock.calls[0]?.[3] as {
        quality: Record<string, unknown>;
      };
      return call.quality;
    }

    it("persists the versioned tri-state payload on complete", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(completedQuality()).toMatchObject({
        schemaVersion: 1,
        objectiveVerdict: "pass",
        objectiveCodes: [],
        attempt: 1,
        subjective: { scoreStatus: "analyzed", qualityScore: 80 },
        evaluator: { status: "completed", error: null },
        checks: {
          file: { ok: true, width: 1080, height: 1080 },
          dimensions: { ok: true, expected: { width: 1080, height: 1080 } },
          references: { ok: true, missingRequired: [] },
        },
      });
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("score 95 + confirmed objective finding triggers the exclusive correction and completes on pass", async () => {
      analyzeDerivationCreativeMock.mockResolvedValue({
        scoreStatus: "analyzed",
        qualityScore: 95,
      });
      analyzeCreativeWorkQaMock
        .mockResolvedValueOnce({
          findings: [
            { code: "unsupported_claim", status: "confirmed", note: "Renderiza R$ 99 sem origem." },
          ],
          summary: "Fato inventado.",
        })
        .mockResolvedValueOnce({ findings: [], summary: "Íntegro após correção." });
      claimImageCallMock
        .mockImplementationOnce(async () => makeQueuedOutput({ status: "processing", imageCallCount: 1 }))
        .mockImplementationOnce(async () => makeQueuedOutput({ status: "processing", imageCallCount: 2 }));
      generateAndStoreImageMock
        .mockResolvedValueOnce({
          outputKey: "creative-work/output-1/base.png",
          revisedPrompt: "revised",
          imageOperation: "generate",
          buffer: Buffer.from("generated-png"),
        })
        .mockResolvedValueOnce({
          outputKey: "creative-work/output-1/correction.png",
          revisedPrompt: "revised",
          imageOperation: "generate",
          buffer: Buffer.from("generated-png"),
        });
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true, outputKey: "creative-work/output-1/correction.png" });
      // Exactly two provider calls: base + the exclusive objective correction.
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(2);
      expect(claimImageCallMock).toHaveBeenCalledTimes(2);
      // The correction prompt starts from the original contract and appends
      // only the failure codes and their surgical instructions.
      const correctionRequest = generateAndStoreImageMock.mock.calls[1]?.[0] as { prompt: string; attempt: number };
      expect(correctionRequest.prompt).toContain("OBJECTIVE CORRECTION — SECOND AND FINAL CALL:");
      expect(correctionRequest.prompt).toContain("- unsupported_claim");
      expect(correctionRequest.prompt).toContain("SURGICAL INSTRUCTIONS: Renderiza R$ 99 sem origem.");
      expect(correctionRequest.attempt).toBe(1);
      // The persisted payload is the correction's pass with attempt 2 — the
      // scorer was skipped on the failed base attempt (95 could not soften
      // the fail) and ran only for the passing correction.
      expect(completedQuality()).toMatchObject({
        objectiveVerdict: "pass",
        objectiveCodes: [],
        attempt: 2,
      });
      expect(completeMock).toHaveBeenCalledWith(
        "workspace-1", "work-1", "output-1",
        expect.objectContaining({ outputKey: "creative-work/output-1/correction.png" }),
      );
      // The correction never charges, never refunds and never requeues.
      expect(failMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
      expect(requeueOnceMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("low subjective score without objective failure completes instead of rejecting low_quality", async () => {
      analyzeDerivationCreativeMock.mockResolvedValue({
        scoreStatus: "analyzed",
        qualityScore: 30,
        scoreIssues: ["Composição genérica"],
      });
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(completeMock).toHaveBeenCalled();
      expect(failMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
      expect(completedQuality()).toMatchObject({
        objectiveVerdict: "pass",
        subjective: {
          scoreStatus: "analyzed",
          qualityScore: 30,
          issues: ["Composição genérica"],
        },
      });
    });

    it("evaluator error completes the output as inconclusive without retry or refund", async () => {
      analyzeCreativeWorkQaMock.mockRejectedValue(new Error("vision QA timed out after 180s"));
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(completedQuality()).toMatchObject({
        objectiveVerdict: "inconclusive",
        objectiveCodes: [],
        evaluator: { status: "failed", error: "vision QA timed out after 180s" },
      });
      expect(failMock).not.toHaveBeenCalled();
      expect(requeueOnceMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("wrong dimensions fail again after the correction → terminal factual_violation with idempotent refund", async () => {
      inspectCreativeWorkImageFileMock.mockResolvedValue({
        ok: true,
        width: 1024,
        height: 1024,
        format: "png",
        bytes: 4096,
        error: null,
      });
      claimImageCallMock
        .mockImplementationOnce(async () => makeQueuedOutput({ status: "processing", imageCallCount: 1 }))
        .mockImplementationOnce(async () => makeQueuedOutput({ status: "processing", imageCallCount: 2 }));
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      // Both calls consumed (base + correction); the deterministic code was
      // confirmed on both, so the output fails terminally — no third call.
      expect(result).toMatchObject({ success: false, failureCode: "factual_violation" });
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(2);
      expect(completeMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "factual_violation");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
            amount: 5,
          }),
          metadata: expect.objectContaining({
            description: "creative_work_output_terminal_refund",
            reason: "creative_work_objective_correction_failed",
          }),
        }),
      );
      expect(requeueOnceMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("subjective scorer crash keeps the v1 output available without a score", async () => {
      analyzeDerivationCreativeMock.mockRejectedValue(new Error("scorer 500"));
      getCreativeWorkMock.mockResolvedValue({
        work: v1DirectWork(),
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(completedQuality()).toMatchObject({
        objectiveVerdict: "pass",
        subjective: { scoreStatus: "unavailable", qualityScore: null, issues: [] },
      });
    });

    it("passes the frozen fact pack and the loaded references to the objective evaluator", async () => {
      getCreativeWorkMock.mockResolvedValue({
        work: {
          ...v1DirectWork(),
          inputSnapshot: {
            ...v1Snapshot,
            factPack: {
              version: 1,
              request: "Promoção de agosto com vagas limitadas",
              facts: [{ value: "agosto", class: "date", required: true, origin: "request" }],
              brand: { requiredElements: [], prohibitedElements: [] },
              identity: {
                clientProfileId: "profile-1",
                brandName: "Cliente XPTO",
                brandAuthority: "active",
              },
            },
          },
        },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      await runJob();

      expect(analyzeCreativeWorkQaMock).toHaveBeenCalledTimes(1);
      const qaInput = analyzeCreativeWorkQaMock.mock.calls[0]?.[0] as {
        mode: string;
        request: string;
        factPack: { facts: Array<{ value: string }> } | null;
        references: Array<{ role: string; label: string }>;
      };
      expect(qaInput.mode).toBe("social_post");
      expect(qaInput.request).toBe("Promoção de agosto com vagas limitadas");
      expect(qaInput.factPack?.facts.map((fact) => fact.value)).toContain("agosto");
      // The brand identity reference slot reached the evaluator positionally.
      expect(qaInput.references.map((reference) => reference.label)).toContain("Mood");
    });
  });

  describe("R-006/R-007 durable budget, terminal refund and lease (v1)", () => {
    const v1Snapshot = {
      generationPolicyVersion: "quality_recovery_v1" as const,
      request: "Promoção de agosto com vagas limitadas",
      settings: { targetFormats: [] },
      sources: [],
    };

    function v1Work() {
      return { ...workItem, toolKind: "single", inputSnapshot: v1Snapshot };
    }

    it("preserves correlation across a deterministic retry and duplicate without exceeding two provider calls", async () => {
      const provider = E2EControlledImageProvider.forUnitTests();
      const generateControlled = async (input: {
        prompt: string;
        dimensions: { width: number; height: number };
        referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
        outputPrefix: string;
        attempt?: number;
        generationMode?: "art_variation" | "format_adaptation" | "restyling";
        telemetry?: { generationCorrelationId?: string; [key: string]: unknown };
      }) => {
        const candidate = await observeImagePipelineExternalCall({
          callType: "image",
          attempt: input.attempt ?? 0,
          ...input.telemetry,
        }, () => provider.generate({
          prompt: input.prompt,
          dimensions: input.dimensions,
          referenceImages: input.referenceImages,
          outputPrefix: input.outputPrefix,
          attempt: input.attempt,
          generationMode: input.generationMode ?? "art_variation",
        }));
        return {
          outputKey: `creative-work/output-1/attempt-${input.attempt ?? 0}.png`,
          revisedPrompt: input.prompt,
          imageOperation: "generate" as const,
          buffer: candidate.buffer,
          candidates: [],
          providerCalls: 1,
          providerRetries: 0,
        };
      };
      generateAndStoreImageMock.mockImplementation(generateControlled);
      const retryWork = {
        ...v1Work(),
        inputSnapshot: {
          ...v1Snapshot,
          request: "[e2e:timeout-once] Promoção de agosto com vagas limitadas",
        },
      };
      claimImageCallMock
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing", imageCallCount: 1 }))
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing", imageCallCount: 2 }));
      getCreativeWorkMock
        .mockResolvedValueOnce({
          work: retryWork,
          outputs: [makeQueuedOutput()],
        })
        .mockResolvedValueOnce({
          work: retryWork,
          outputs: [makeQueuedOutput({ retryCount: 1, imageCallCount: 1 })],
        })
        .mockResolvedValueOnce({
          work: retryWork,
          outputs: [makeQueuedOutput({ status: "completed", retryCount: 1, imageCallCount: 2 })],
        });
      markProcessingMock
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing" }))
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing", retryCount: 1, imageCallCount: 1 }));
      requeueOnceMock.mockResolvedValueOnce(makeQueuedOutput({ retryCount: 1, imageCallCount: 1 }));

      const first = await runJob({ ...baseEvent });
      const second = await runJob({ ...baseEvent });
      const duplicate = await runJob({ ...baseEvent });

      expect(first).toMatchObject({ success: false, retrying: true });
      expect(second).toMatchObject({ success: true });
      expect(duplicate).toMatchObject({ skipped: true });
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(2);
      expect(claimImageCallMock).toHaveBeenCalledTimes(2);
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
        id: "creative-work-generate:output-1:retry-1",
        data: expect.objectContaining({ generationCorrelationId: "generation-1" }),
      }));

      const structuredEvents = [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
      ]
        .map(([payload]) => payload)
        .filter((payload): payload is { event: string; [key: string]: unknown } => (
          typeof payload === "object" && payload !== null &&
          typeof (payload as { event?: unknown }).event === "string"
        ));
      const externalEvents = structuredEvents.filter((event) => event.event === "image_pipeline_external_call");
      expect(externalEvents.map((event) => `${event.callType}:${event.attempt}:${event.result}`)).toEqual([
        "image:0:failed",
        "image:1:success",
        "qa:2:success",
        "score:2:success",
      ]);
      expect(externalEvents.filter((event) => event.callType === "image").map((event) => event.imageCallCount)).toEqual([1, 2]);
      expect(externalEvents.every((event) => event.generationCorrelationId === "generation-1")).toBe(true);
    });

    it("fails as image_call_budget_exhausted with zero provider calls when the claim hits the ceiling", async () => {
      claimImageCallMock.mockResolvedValue(null);
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work(),
        outputs: [makeQueuedOutput({ imageCallCount: 2 })],
      });
      markProcessingMock.mockResolvedValue(
        makeQueuedOutput({ status: "processing", imageCallCount: 2 }),
      );

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "image_call_budget_exhausted" });
      // The CAS ceiling failed BEFORE the provider: zero calls in this run.
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(completeMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "image_call_budget_exhausted");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
            amount: 5,
          }),
        }),
      );
    });

    it("refunds a v1 terminal provider failure and never requeues once the budget is consumed", async () => {
      claimImageCallMock.mockImplementation(async () =>
        makeQueuedOutput({ status: "processing", imageCallCount: 2 }),
      );
      generateAndStoreImageMock.mockRejectedValue(
        Object.assign(new Error("provider timeout"), { retryable: true }),
      );
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work(),
        outputs: [makeQueuedOutput({ imageCallCount: 1, retryCount: 1 })],
      });
      markProcessingMock.mockResolvedValue(
        makeQueuedOutput({ status: "processing", imageCallCount: 1, retryCount: 1 }),
      );

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "provider_timeout" });
      // imageCallCount reached 2 — the XOR budget is spent: no requeue, no
      // third call, terminal idempotent refund instead.
      expect(requeueOnceMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
          }),
        }),
      );
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "provider_timeout");
    });

    it("allows exactly one transport retry while the durable budget still has a call", async () => {
      generateAndStoreImageMock.mockRejectedValue(
        Object.assign(new Error("provider timeout"), { retryable: true }),
      );
      requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();
      expect(result).toMatchObject({ success: false, retrying: true });
      expect(sendMock).toHaveBeenCalledWith({ id: "creative-work-generate:output-1:retry-1", name: "creative-work.generate", data: baseEvent });
      // The transport retry keeps the charge — no refund before the second
      // call exists.
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("denies the correction when a transport retry already consumed the second call", async () => {
      analyzeCreativeWorkQaMock.mockResolvedValue({
        findings: [{ code: "wrong_brand", status: "confirmed", note: "Marca trocada." }],
        summary: "Marca errada.",
      });
      claimImageCallMock
        .mockImplementationOnce(async () =>
          makeQueuedOutput({ status: "processing", imageCallCount: 2 }),
        )
        .mockResolvedValue(null);
      getCreativeWorkMock.mockResolvedValue({
        work: v1Work(),
        outputs: [makeQueuedOutput({ imageCallCount: 1, retryCount: 1 })],
      });
      markProcessingMock.mockResolvedValue(
        makeQueuedOutput({ status: "processing", imageCallCount: 1, retryCount: 1 }),
      );

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "image_call_budget_exhausted" });
      // The base call of this run produced an image with a confirmed
      // objective fail, but the correction claim hit the CAS ceiling —
      // exactly one provider call in this run, terminal refund applied.
      expect(generateAndStoreImageMock).toHaveBeenCalledTimes(1);
      expect(completeMock).not.toHaveBeenCalled();
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "image_call_budget_exhausted");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
          }),
        }),
      );
    });

    it("aborts before the provider call when the lease was lost", async () => {
      touchHeartbeatMock.mockResolvedValue(null);
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false, leaseLost: true });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(claimImageCallMock).not.toHaveBeenCalled();
      expect(completeMock).not.toHaveBeenCalled();
      expect(failMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("preserves the provider heartbeat stage when the lease is lost in flight", async () => {
      touchHeartbeatMock
        .mockResolvedValueOnce(makeQueuedOutput({ status: "processing" }))
        .mockResolvedValueOnce(null);
      generateAndStoreImageMock.mockImplementationOnce(async (input: {
        onStageHeartbeat?: (stage: string) => Promise<void>;
      }) => {
        await input.onStageHeartbeat?.("candidate_attempt:openai");
        return {
          outputKey: "creative-work/output-1/1700000000000.png",
          revisedPrompt: "revised",
          imageOperation: "generate" as const,
          buffer: Buffer.from("generated-png"),
        };
      });
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false });
      expect(failMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", expect.stringContaining("lease_lost"));
      const stageEvents = [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
      ].map(([payload]) => payload).filter((payload): payload is { event: string; [key: string]: unknown } => (
        typeof payload === "object" && payload !== null &&
        (payload as { event?: unknown }).event === "creative_work_output_stage"
      ));
      expect(stageEvents).toContainEqual(expect.objectContaining({
        stage: "lease",
        leaseStage: "candidate_attempt:openai",
        result: "failed",
      }));
    });

    it("discards a late completion without touching billing or library", async () => {
      completeMock.mockResolvedValue(null);
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true, skipped: true });
      expect(ensureLibraryMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
      expect(failMock).not.toHaveBeenCalled();
    });

    it("fails a required restyle reference that cannot be normalized as reference_failure with zero provider calls", async () => {
      normalizeReferenceMock.mockRejectedValue(new Error("unable to decode reference image"));
      const restyleSnapshot = {
        ...v1Snapshot,
        request: "Mude o estilo",
        sources: [
          {
            sourceId: "conteudo",
            updatedAt: "2026-07-20T00:00:00.000Z",
            assetKey: "conteudo.png",
            mimeType: "image/png",
            usage: "content",
            content: { product: "Produto da arte" },
            style: null,
          },
          {
            sourceId: "estilo",
            updatedAt: "2026-07-20T00:00:00.000Z",
            assetKey: "estilo.png",
            mimeType: "image/png",
            usage: "style",
            content: null,
            style: { description: "Editorial" },
          },
        ],
      };
      getCreativeWorkMock.mockResolvedValue({
        work: { ...workItem, toolKind: "restyle", inputSnapshot: restyleSnapshot },
        outputs: [makeQueuedOutput()],
      });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "reference_failure" });
      expect(generateAndStoreImageMock).not.toHaveBeenCalled();
      expect(claimImageCallMock).not.toHaveBeenCalled();
      // Pre-provider failure: pregen refund, never the terminal one.
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-output:output-1:compensatory-refund",
          }),
        }),
      );
      expect(settleTerminalRefundMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
          }),
        }),
      );
    });

    it("settles a v1 auto-retry dispatch failure at net zero (terminal refund, no debit leak)", async () => {
      // Requeue CAS won but the redispatch never left the gate: the consumed
      // image call makes this a terminal post-provider failure — the v1
      // output must NOT keep the debit.
      generateAndStoreImageMock.mockRejectedValue(
        Object.assign(new Error("provider timeout"), { retryable: true }),
      );
      requeueOnceMock.mockResolvedValue(makeQueuedOutput({ retryCount: 1 }));
      sendMock.mockRejectedValue(new Error("inngest unavailable"));
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: false, failureCode: "auto_retry_dispatch_failed" });
      expect(failQueuedMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1", "auto_retry_dispatch_failed");
      expect(settleTerminalRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({
            refund: true,
            idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
          }),
          metadata: expect.objectContaining({ reason: "auto_retry_dispatch_failed" }),
        }),
      );
      const terminalEvents = [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
      ].filter(([payload]) => (
        typeof payload === "object" &&
        payload !== null &&
        (payload as { event?: string }).event === "creative_work_output_terminal"
      ));
      expect(terminalEvents).toHaveLength(1);
    });

    it("keeps a completed output untouched when post-commit telemetry throws", async () => {
      // R-007.7: auxiliary telemetry failing after the commit must not fall
      // into the outer catch — the completed output keeps its status AND its
      // debit (no terminal refund on a completed row).
      const loggerInfoMock = logger.info as ReturnType<typeof vi.fn>;
      loggerInfoMock.mockImplementation((payload: unknown) => {
        if (
          typeof payload === "object" &&
          payload !== null &&
          (payload as { event?: string }).event === "creative_work_output_terminal"
        ) {
          throw new Error("telemetry sink down");
        }
      });
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      expect(completeMock).toHaveBeenCalled();
      expect(failMock).not.toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });

    it("drops an optional identity reference that fails normalization and still generates", async () => {
      // Single mode: the brand identity asset is an optional slot — a
      // normalization failure drops it instead of failing the output.
      normalizeReferenceMock.mockRejectedValue(new Error("unable to decode reference image"));
      getCreativeWorkMock.mockResolvedValue({ work: v1Work(), outputs: [makeQueuedOutput()] });
      markProcessingMock.mockResolvedValue(makeQueuedOutput({ status: "processing" }));

      const result = await runJob();

      expect(result).toMatchObject({ success: true });
      const request = generateAndStoreImageMock.mock.calls[0]?.[0] as {
        referenceImages: unknown[];
      };
      expect(request.referenceImages).toEqual([]);
      expect(completeMock).toHaveBeenCalled();
      expect(settleTerminalRefundMock).not.toHaveBeenCalled();
    });
  });
});
