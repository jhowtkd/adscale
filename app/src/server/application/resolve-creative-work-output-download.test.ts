import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));

vi.mock("@/server/creative-work/record-value-event", () => ({
  recordCreativeWorkValueEvent: vi.fn(),
  valueEventFromCreativeWork: vi.fn((work: { id: string; workspaceId: string; createdByUserId: string; clientProfileId: string; campaignId?: string | null; toolKind: string }) => ({
    userId: work.createdByUserId,
    workspaceId: work.workspaceId,
    creativeWorkId: work.id,
    protocol: work.toolKind,
    origin: work.campaignId ? "campaign" : "studio",
    campaignId: work.campaignId ?? null,
    clientProfileId: work.clientProfileId,
  })),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(),
    head: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    putStream: vi.fn(),
  },
}));

vi.mock("@/server/diagnostics/selection-export-tracing", () => ({
  resolveLifecycleTraceContext: vi.fn(),
  traceExportPrepared: vi.fn(),
}));

import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";
import { recordCreativeWorkValueEvent } from "@/server/creative-work/record-value-event";
import {
  resolveLifecycleTraceContext,
  traceExportPrepared,
} from "@/server/diagnostics/selection-export-tracing";
import { resolveCreativeWorkOutputDownload } from "./resolve-creative-work-output-download";

const mockGet = vi.mocked(getCreativeWork);
const mockRecordValue = vi.mocked(recordCreativeWorkValueEvent);
const mockResolveTrace = vi.mocked(resolveLifecycleTraceContext);
const mockTracePrepared = vi.mocked(traceExportPrepared);
const mockSigned = vi.mocked(objectStorage.signedDownloadUrl);
const mockHead = vi.mocked(objectStorage.head);
const mockGetObject = vi.mocked(objectStorage.get);
const mockPutObject = vi.mocked(objectStorage.put);
const mockPutStream = vi.mocked(objectStorage.putStream);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  createdByUserId: "user-1",
  clientProfileId: "profile-1",
  campaignId: null,
  toolKind: "social_post",
  brief: { theme: "Tema", objective: "O", audience: "A", offer: "Of" },
};

const completedOutput = {
  id: "output-1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "completed",
  outputKey: "creative-work/output-1/out.png",
  isSelected: false,
};

describe("resolveCreativeWorkOutputDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSigned.mockResolvedValue("https://signed.example.com/asset.png");
    mockHead.mockResolvedValue(null);
    mockResolveTrace.mockImplementation((scope: { toolKind: string }) =>
      scope.toolKind === "single" ? { operationId: `op-${Math.random()}` } : null,
    );
  });

  it("returns signed url for completed output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe("https://signed.example.com/asset.png");
    expect(result.value.outputKey).toBe(completedOutput.outputKey);
    expect(mockSigned).toHaveBeenCalledWith(completedOutput.outputKey);
    expect(mockRecordValue).toHaveBeenCalledWith(expect.objectContaining({
      kind: "delivered",
      outputId: "output-1",
      outputKey: completedOutput.outputKey,
      origin: "studio",
    }));
  });

  it("rejects missing work", async () => {
    mockGet.mockResolvedValue(null);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "missing",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSigned).not.toHaveBeenCalled();
  });

  it("rejects missing output", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("output_not_found");
  });

  it("rejects non-ready output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "failed", outputKey: null }],
    } as never);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_ready");
      if (result.error.code === "output_not_ready") {
        expect(result.error.status).toBe("failed");
      }
    }
    expect(mockSigned).not.toHaveBeenCalled();
  });

  it("downloads a published editor PSD even when the layerization source is not completed", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...completedOutput,
        layerization: { status: "failed" },
        layerEditor: {
          schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: "attempt", canvas: { width: 2, height: 2 }, layers: [
            { id: "00000000-0000-4000-8000-000000000001", source: { order: 0, name: "Base", visible: true, x: 0, y: 0, width: 2, height: 2, key: "layers/base.png" }, order: 0, name: "Base", visible: true, x: 0, y: 0, width: 2, height: 2, currentKey: "layers/base.png", currentKind: "source", restorableKey: null },
            { id: "00000000-0000-4000-8000-000000000002", source: { order: 1, name: "Product", visible: true, x: 0, y: 0, width: 2, height: 2, key: "layers/product.png" }, order: 1, name: "Product", visible: true, x: 0, y: 0, width: 2, height: 2, currentKey: "layers/product.png", currentKind: "source", restorableKey: null },
          ], lease: null, regeneration: null,
          publishedPsdKey: "creative-work/output-1/editor/published.psd", updatedAt: "2026-08-22T00:00:00.000Z",
        },
      }],
    } as never);

    await expect(resolveCreativeWorkOutputDownload({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1", format: "psd" })).resolves.toMatchObject({ ok: true, value: { outputKey: "creative-work/output-1/editor/published.psd" } });
    expect(mockSigned).toHaveBeenCalledWith("creative-work/output-1/editor/published.psd");
    expect(mockRecordValue).not.toHaveBeenCalled();
  });

  it("materializes the diagnostic ZIP only when it is requested", async () => {
    const base = await sharp({ create: { width: 2, height: 2, channels: 4, background: [20, 30, 40, 255] } }).png().toBuffer();
    mockGetObject.mockResolvedValue(base);
    const storedChunks: Buffer[] = [];
    mockPutStream.mockImplementation(async (_key, data) => {
      for await (const chunk of data) storedChunks.push(Buffer.from(chunk));
    });
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...completedOutput,
        layerization: {
          status: "completed",
          attemptId: "attempt-1",
          callbackTokenHash: "a".repeat(64),
          callbackConsumedAt: null,
          requestedByUserId: "owner-1",
          createdAt: "2026-08-12T12:00:00.000Z",
          updatedAt: "2026-08-12T12:01:00.000Z",
          callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
          latencyMs: 60_000,
          providerRequestId: "request-1",
          providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
          providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
          estimatedCostUsd: 0.09,
          baseWidth: 2,
          baseHeight: 2,
          layers: [{
            order: 0,
            isBase: true,
            name: "Base",
            description: "Base layer",
            x: 0,
            y: 0,
            width: 2,
            height: 2,
            normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
            storageKey: "layers/00.png",
            sourceBytes: base.length,
          }],
          psdKey: "creative-work/work-1/layerize/attempt-1/piece.psd",
          diagnosticZipKey: null,
          fidelity: { normalizedMae: 0, rmse: 0, psnrDb: 99, gate: "passed" },
          failureCode: null,
        },
      }],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      format: "zip",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { outputKey: "creative-work/work-1/layerize/attempt-1/piece.zip" },
    });
    expect(mockPutStream).toHaveBeenCalledOnce();
    expect(mockRecordValue).not.toHaveBeenCalled();
    expect(mockPutObject).not.toHaveBeenCalled();
    const zip = await JSZip.loadAsync(Buffer.concat(storedChunks));
    expect(Object.keys(zip.files)).toContain("manifest.json");
  });
});

describe("trace-390 diagnostic tracing of export", () => {
  const singleWork = { ...workItem, toolKind: "single" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSigned.mockResolvedValue("https://signed.example.com/asset.png");
    mockHead.mockResolvedValue(null);
    mockResolveTrace.mockImplementation((scope: { toolKind: string }) =>
      scope.toolKind === "single" ? { operationId: `op-${Math.random()}` } : null,
    );
  });

  it("emits export.prepared for a single-protocol download and threads the operation", async () => {
    mockGet.mockResolvedValue({
      work: singleWork,
      outputs: [completedOutput],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockResolveTrace).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      clientProfileId: "profile-1",
      toolKind: "single",
    });
    expect(mockTracePrepared).toHaveBeenCalledTimes(1);
    expect(mockTracePrepared).toHaveBeenCalledWith({
      context: result.value.traceContext,
      format: "original",
    });
    expect(result.value.traceContext).toMatchObject({ operationId: expect.any(String) });
    expect(result.value.url).toBe("https://signed.example.com/asset.png");
  });

  it("treats repeated downloads as distinct operations", async () => {
    mockGet.mockResolvedValue({
      work: singleWork,
      outputs: [completedOutput],
    } as never);
    const input = { workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" };

    const first = await resolveCreativeWorkOutputDownload(input);
    const second = await resolveCreativeWorkOutputDownload(input);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(mockTracePrepared).toHaveBeenCalledTimes(2);
    expect(first.value.traceContext?.operationId).toBeTruthy();
    expect(second.value.traceContext?.operationId).toBeTruthy();
    expect(first.value.traceContext?.operationId).not.toBe(
      second.value.traceContext?.operationId,
    );
    // New operations, same Peça: no new output, same key.
    expect(first.value.outputKey).toBe(completedOutput.outputKey);
    expect(second.value.outputKey).toBe(completedOutput.outputKey);
  });

  it("keeps the delivered value event alongside the journal record", async () => {
    mockGet.mockResolvedValue({
      work: singleWork,
      outputs: [completedOutput],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    expect(mockRecordValue).toHaveBeenCalledWith(expect.objectContaining({
      kind: "delivered",
      outputId: "output-1",
      outputKey: completedOutput.outputKey,
      origin: "studio",
    }));
    expect(mockTracePrepared).toHaveBeenCalledTimes(1);
  });

  it("records the requested format on prepared", async () => {
    mockGet.mockResolvedValue({
      work: singleWork,
      outputs: [{
        ...completedOutput,
        layerEditor: {
          schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: "attempt", canvas: { width: 2, height: 2 }, layers: [
            { id: "00000000-0000-4000-8000-000000000001", source: { order: 0, name: "Base", visible: true, x: 0, y: 0, width: 2, height: 2, key: "layers/base.png" }, order: 0, name: "Base", visible: true, x: 0, y: 0, width: 2, height: 2, currentKey: "layers/base.png", currentKind: "source", restorableKey: null },
            { id: "00000000-0000-4000-8000-000000000002", source: { order: 1, name: "Product", visible: true, x: 0, y: 0, width: 2, height: 2, key: "layers/product.png" }, order: 1, name: "Product", visible: true, x: 0, y: 0, width: 2, height: 2, currentKey: "layers/product.png", currentKind: "source", restorableKey: null },
          ], lease: null, regeneration: null,
          publishedPsdKey: "creative-work/output-1/editor/published.psd", updatedAt: "2026-08-22T00:00:00.000Z",
        },
      }],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      format: "psd",
    });

    expect(result.ok).toBe(true);
    expect(mockTracePrepared).toHaveBeenCalledWith({
      context: expect.objectContaining({ operationId: expect.any(String) }),
      format: "psd",
    });
  });

  it("stays silent outside the Peça única pilot", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockTracePrepared).not.toHaveBeenCalled();
    expect(result.value.traceContext).toBeUndefined();
    // The value event is business behavior — unchanged by the pilot gate.
    expect(mockRecordValue).toHaveBeenCalledTimes(1);
  });

  it("emits nothing when the download is not ready", async () => {
    mockGet.mockResolvedValue({
      work: singleWork,
      outputs: [{ ...completedOutput, status: "failed", outputKey: null }],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(false);
    expect(mockTracePrepared).not.toHaveBeenCalled();
  });
});
