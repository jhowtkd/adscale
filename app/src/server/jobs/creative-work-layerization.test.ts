import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { LayerizationState } from "@/server/layerize/contracts";

const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const getOutputMock = vi.hoisted(() => vi.fn());
const claimProcessingMock = vi.hoisted(() => vi.fn());
const recordRequestMock = vi.hoisted(() => vi.fn());
const markReconcilingMock = vi.hoisted(() => vi.fn());
const claimFinalizationMock = vi.hoisted(() => vi.fn());
const updateStateMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const failMock = vi.hoisted(() => vi.fn());
const markUnknownMock = vi.hoisted(() => vi.fn());
const objectSignedUrlMock = vi.hoisted(() => vi.fn());
const objectGetMock = vi.hoisted(() => vi.fn());
const objectPutMock = vi.hoisted(() => vi.fn());
const objectPutStreamMock = vi.hoisted(() => vi.fn());
const createProviderMock = vi.hoisted(() => vi.fn());
const downloadLayersMock = vi.hoisted(() => vi.fn());
const normalizeResponseMock = vi.hoisted(() => vi.fn());
const recomposeMock = vi.hoisted(() => vi.fn());
const fidelityMock = vi.hoisted(() => vi.fn());
const writePsdMock = vi.hoisted(() => vi.fn());
const writeZipMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
}));
vi.mock("@/server/repositories/creative-work-layerization", () => ({
  getCreativeWorkLayerizationOutput: (...args: unknown[]) => getOutputMock(...args),
  claimCreativeWorkLayerizationProcessing: (...args: unknown[]) => claimProcessingMock(...args),
  recordCreativeWorkLayerizationProviderRequest: (...args: unknown[]) => recordRequestMock(...args),
  markCreativeWorkLayerizationReconciling: (...args: unknown[]) => markReconcilingMock(...args),
  claimCreativeWorkLayerizationFinalization: (...args: unknown[]) => claimFinalizationMock(...args),
  updateCreativeWorkLayerizationState: (...args: unknown[]) => updateStateMock(...args),
  completeCreativeWorkLayerization: (...args: unknown[]) => completeMock(...args),
  failCreativeWorkLayerization: (...args: unknown[]) => failMock(...args),
  markCreativeWorkLayerizationSubmissionUnknown: (...args: unknown[]) => markUnknownMock(...args),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: (...args: unknown[]) => objectSignedUrlMock(...args),
    get: (...args: unknown[]) => objectGetMock(...args),
    put: (...args: unknown[]) => objectPutMock(...args),
    putStream: (...args: unknown[]) => objectPutStreamMock(...args),
  },
}));
vi.mock("@/server/layerize/seedream-provider", () => ({
  createSeedreamProvider: (...args: unknown[]) => createProviderMock(...args),
  downloadSeedreamLayers: (...args: unknown[]) => downloadLayersMock(...args),
  estimateSeedreamLayerizationCostUsd: () => 0.09,
  normalizeSeedreamLayerResponse: (...args: unknown[]) => normalizeResponseMock(...args),
  SeedreamProviderError: class SeedreamProviderError extends Error {},
}));
vi.mock("@/server/layerize/artifacts", () => ({
  layerizationArtifactKey: (input: { workItemId: string; attemptId: string }, extension: string) => `creative-work/${input.workItemId}/layerize/${input.attemptId}/piece.${extension}`,
  recomposeStoredLayers: (...args: unknown[]) => recomposeMock(...args),
  calculateLayerizationFidelity: (...args: unknown[]) => fidelityMock(...args),
  writeStoredLayerizationPsd: (...args: unknown[]) => writePsdMock(...args),
  writeLayerizationDiagnosticZip: (...args: unknown[]) => writeZipMock(...args),
}));
vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({ opts, fn: handler })),
  },
}));

import { creativeWorkLayerizationJob, runCreativeWorkLayerization } from "./creative-work-layerization";

const event = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  attemptId: "attempt-1",
  callbackUrl: "https://app.example/api/creative-work/work-1?layerizeCallback=1",
};

const now = "2026-08-12T12:00:00.000Z";

function state(status: LayerizationState["status"], providerRequestId: string | null = null): LayerizationState {
  return {
    status,
    attemptId: event.attemptId,
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: now,
    updatedAt: now,
    callbackDeadlineAt: "2099-08-12T14:00:00.000Z",
    latencyMs: null,
    providerRequestId,
    providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
    providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
}

function row(layerization: LayerizationState) {
  return {
    workspaceId: event.workspaceId,
    workItemId: event.workItemId,
    id: event.outputId,
    layerization,
  };
}

const basePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const overlayPng = Buffer.from("overlay-png");
const provider = {
  submit: vi.fn(async () => ({ requestId: "request-1" })),
  status: vi.fn(async () => "COMPLETED" as const),
  result: vi.fn(async () => ({ provider: "payload" })),
};

function configureCompletedFlow() {
  const processing = state("processing");
  const submitted = state("processing", "request-1");
  const finalizing = state("finalizing", "request-1");
  getOutputMock.mockResolvedValueOnce(row(state("queued")));
  claimProcessingMock.mockResolvedValueOnce(row(processing));
  recordRequestMock.mockResolvedValueOnce(row(submitted));
  claimFinalizationMock.mockResolvedValueOnce(row(finalizing));
  updateStateMock.mockImplementation(async (input: { state: LayerizationState }) => row(input.state));
  completeMock.mockImplementation(async (input: { state: LayerizationState }) => row({ ...input.state, status: "completed" }));
  getCreativeWorkMock.mockResolvedValue({ outputs: [{ id: event.outputId, outputKey: "creative-work/original.png" }] });
  objectSignedUrlMock.mockResolvedValue("https://storage.example/original.png");
  objectGetMock.mockResolvedValue(basePng);
  objectPutMock.mockResolvedValue(undefined);
  objectPutStreamMock.mockResolvedValue(undefined);
  normalizeResponseMock.mockReturnValue({
    width: 2,
    height: 2,
    layers: [
      {
        order: 0,
        isBase: true,
        name: "Base",
        description: "Canvas base",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
        sourceUrl: "https://v3.fal.media/base.png",
      },
      {
        order: 1,
        isBase: false,
        name: "Foreground",
        description: "Foreground layer",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
        sourceUrl: "https://v3.fal.media/foreground.png",
      },
    ],
  });
  downloadLayersMock.mockImplementation(async (
    layers: Array<{ sourceUrl: string; isBase: boolean }>,
    options: { store: (layer: { sourceUrl: string; isBase: boolean }, index: number, stream: Readable) => Promise<void> },
  ) => {
    const buffers = [basePng, overlayPng];
    await Promise.all(layers.map((layer, index) => options.store(layer, index, Readable.from(buffers[index]))));
    return buffers.map((buffer) => buffer.length);
  });
  recomposeMock.mockResolvedValue(Buffer.from("recomposed"));
  fidelityMock.mockResolvedValue({ normalizedMae: 0, rmse: 0, psnrDb: 99, gate: "passed" });
  writePsdMock.mockResolvedValue(Buffer.from("psd"));
  writeZipMock.mockResolvedValue(Buffer.from("zip"));
  createProviderMock.mockReturnValue(provider);
}

describe("creative work layerization job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.submit.mockResolvedValue({ requestId: "request-1" });
    provider.status.mockResolvedValue("COMPLETED");
    provider.result.mockResolvedValue({ provider: "payload" });
  });

  it("submits once, keeps the original, stores private artifacts, and strips provider URLs from state", async () => {
    configureCompletedFlow();

    const result = await runCreativeWorkLayerization({ event, provider });

    expect(result.status).toBe("completed");
    expect(provider.submit).toHaveBeenCalledOnce();
    expect(objectSignedUrlMock).toHaveBeenCalledWith("creative-work/original.png", 8_100);
    expect(objectGetMock).toHaveBeenCalledWith("creative-work/original.png");
    expect(objectPutStreamMock).toHaveBeenCalledTimes(2);
    expect(objectPutMock).toHaveBeenCalledTimes(1);
    expect(writeZipMock).not.toHaveBeenCalled();
    expect(updateStateMock).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        layers: expect.not.arrayContaining([expect.objectContaining({ sourceUrl: expect.any(String) })]),
      }),
    }));
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        status: "finalizing",
        psdKey: expect.stringMatching(/piece\.psd$/),
        diagnosticZipKey: null,
      }),
    }));
  });

  it("keeps a redelivered attempt without a request id reconciling instead of submitting again", async () => {
    getOutputMock.mockResolvedValue(row(state("processing")));
    markReconcilingMock.mockResolvedValue(row(state("reconciling")));

    const result = await runCreativeWorkLayerization({ event, provider });

    expect(result).toEqual({ status: "reconciling" });
    expect(provider.submit).not.toHaveBeenCalled();
    expect(getCreativeWorkMock).not.toHaveBeenCalled();
    expect(markReconcilingMock).toHaveBeenCalledOnce();
  });

  it("marks an unidentified submission unknown only after its callback deadline", async () => {
    const expired = state("reconciling");
    expired.callbackDeadlineAt = "2020-01-01T00:00:00.000Z";
    getOutputMock.mockResolvedValue(row(expired));
    markUnknownMock.mockResolvedValue(row(state("submission_unknown")));

    await expect(runCreativeWorkLayerization({ event, provider })).resolves.toEqual({ status: "submission_unknown" });
    expect(provider.submit).not.toHaveBeenCalled();
    expect(markUnknownMock).toHaveBeenCalledOnce();
  });

  it("waits for callback when the submit response is lost", async () => {
    getOutputMock.mockResolvedValueOnce(row(state("queued")));
    claimProcessingMock.mockResolvedValueOnce(row(state("processing")));
    getCreativeWorkMock.mockResolvedValue({ outputs: [{ id: event.outputId, outputKey: "creative-work/original.png" }] });
    objectSignedUrlMock.mockResolvedValue("https://storage.example/original.png");
    provider.submit.mockRejectedValueOnce(new Error("response lost"));
    markReconcilingMock.mockResolvedValue(row(state("reconciling")));

    await expect(runCreativeWorkLayerization({ event, provider })).resolves.toEqual({ status: "reconciling" });
    expect(markUnknownMock).not.toHaveBeenCalled();
    expect(provider.submit).toHaveBeenCalledOnce();
  });

  it("keeps a known provider request reconciling after the callback deadline", async () => {
    const expired = state("reconciling", "request-1");
    expired.callbackDeadlineAt = "2020-01-01T00:00:00.000Z";
    getOutputMock.mockResolvedValue(row(expired));
    getCreativeWorkMock.mockResolvedValue({ outputs: [{ id: event.outputId, outputKey: "creative-work/original.png" }] });
    provider.status.mockRejectedValueOnce(new Error("provider unavailable"));
    markReconcilingMock.mockResolvedValue(row(expired));

    await expect(runCreativeWorkLayerization({ event, provider })).resolves.toEqual({ status: "reconciling" });
    expect(failMock).not.toHaveBeenCalled();
    expect(markReconcilingMock).toHaveBeenCalledOnce();
  });

  it("polls a reconciling request before finalizing it", async () => {
    const reconciling = state("reconciling", "request-1");
    const finalizing = state("finalizing", "request-1");
    getOutputMock
      .mockResolvedValueOnce(row(state("processing", "request-1")))
      .mockResolvedValueOnce(row(reconciling));
    markReconcilingMock.mockResolvedValue(row(reconciling));
    claimFinalizationMock.mockResolvedValue(row(finalizing));
    getCreativeWorkMock.mockResolvedValue({ outputs: [{ id: event.outputId, outputKey: "creative-work/original.png" }] });
    objectGetMock.mockResolvedValue(basePng);
    objectPutMock.mockResolvedValue(undefined);
    objectPutStreamMock.mockResolvedValue(undefined);
    objectSignedUrlMock.mockResolvedValue("https://storage.example/original.png");
    provider.status.mockResolvedValueOnce("IN_PROGRESS").mockResolvedValueOnce("COMPLETED");
    provider.result.mockResolvedValue({ provider: "payload" });
    normalizeResponseMock.mockReturnValue({ width: 1, height: 1, layers: [] });
    downloadLayersMock.mockResolvedValue([]);
    recomposeMock.mockResolvedValue(Buffer.from("recomposed"));
    fidelityMock.mockResolvedValue({ normalizedMae: 0, rmse: 0, psnrDb: 99, gate: "passed" });
    writePsdMock.mockResolvedValue(Buffer.from("psd"));
    writeZipMock.mockResolvedValue(Buffer.from("zip"));
    updateStateMock.mockImplementation(async (input: { state: LayerizationState }) => row(input.state));
    completeMock.mockImplementation(async (input: { state: LayerizationState }) => row({ ...input.state, status: "completed" }));
    createProviderMock.mockReturnValue(provider);

    const job = creativeWorkLayerizationJob as unknown as { fn: (input: unknown) => Promise<unknown> };
    const sleep = vi.fn(async () => undefined);
    const result = await job.fn({ event: { data: event }, step: { run: (_name: string, fn: () => Promise<unknown>) => fn(), sleep } });

    expect(result).toEqual({ status: "completed" });
    expect(provider.status).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith("wait-for-layerization-0", "5m");
  });
});
