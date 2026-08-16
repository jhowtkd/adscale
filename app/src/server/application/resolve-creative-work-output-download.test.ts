import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
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

import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";
import { resolveCreativeWorkOutputDownload } from "./resolve-creative-work-output-download";

const mockGet = vi.mocked(getCreativeWork);
const mockSigned = vi.mocked(objectStorage.signedDownloadUrl);
const mockHead = vi.mocked(objectStorage.head);
const mockGetObject = vi.mocked(objectStorage.get);
const mockPutObject = vi.mocked(objectStorage.put);
const mockPutStream = vi.mocked(objectStorage.putStream);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
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
    expect(mockPutObject).not.toHaveBeenCalled();
    const zip = await JSZip.loadAsync(Buffer.concat(storedChunks));
    expect(Object.keys(zip.files)).toContain("manifest.json");
  });
});
