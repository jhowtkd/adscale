import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const stateFromOutput = vi.hoisted(() => vi.fn());
const markProcessing = vi.hoisted(() => vi.fn());
const completeCandidate = vi.hoisted(() => vi.fn());
const failRegeneration = vi.hoisted(() => vi.fn());
const recoverStale = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const putObject = vi.hoisted(() => vi.fn());
const deleteObject = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());
const normalize = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work-layer-editor", () => ({
  getCreativeWorkLayerEditorOutput: vi.fn(),
  layerEditorFromOutput: stateFromOutput,
  markLayerRegenerationProcessing: markProcessing,
  completeLayerRegenerationCandidate: completeCandidate,
  failLayerRegeneration: failRegeneration,
  recoverStaleLayerRegeneration: recoverStale,
}));
vi.mock("@/server/storage", () => ({ objectStorage: { get: getObject, put: putObject, delete: deleteObject } }));
vi.mock("@/server/layer-editor/artifacts", () => ({ renderLayerEditorPng: render }));
vi.mock("@/server/layer-editor/openai-provider", () => ({
  OpenAILayerRegenerationProvider: class {},
  normalizeLayerCandidate: normalize,
}));
vi.mock("./client", () => ({
  inngest: { createFunction: vi.fn((config: { id: string }) => ({ id: () => config.id })) },
}));

import { creativeWorkLayerRegenerationJob, runCreativeWorkLayerRegeneration } from "./creative-work-layer-regeneration";

const input = { workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-1", operationId: "00000000-0000-4000-8000-000000000001" };
const layerId = "00000000-0000-4000-8000-000000000002";
const state: LayerEditorStateV1 = {
  schemaVersion: 1, revision: 4, sourceLayerizationAttemptId: "attempt-1", canvas: { width: 20, height: 20 },
  layers: [
    { id: layerId, source: { order: 0, name: "Product", visible: true, x: 0, y: 0, width: 10, height: 10, key: "private/source.png" }, order: 0, name: "Product", visible: true, x: 0, y: 0, width: 10, height: 10, currentKey: "private/current.png", currentKind: "source", restorableKey: null },
    { id: "00000000-0000-4000-8000-000000000003", source: { order: 1, name: "Background", visible: true, x: 0, y: 0, width: 20, height: 20, key: "private/background.png" }, order: 1, name: "Background", visible: true, x: 0, y: 0, width: 20, height: 20, currentKey: "private/background.png", currentKind: "source", restorableKey: null },
  ],
  lease: { id: "00000000-0000-4000-8000-000000000004", userId: "user-1", acquiredAt: "2026-08-22T00:00:00.000Z", expiresAt: "2026-08-22T00:01:30.000Z" },
  regeneration: { id: input.operationId, status: "reserved", layerId, instruction: "Change color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" },
  publishedPsdKey: null, updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("creativeWorkLayerRegenerationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markProcessing.mockResolvedValue({ id: input.outputId });
    stateFromOutput.mockReturnValue(state);
    getObject.mockResolvedValue(Buffer.from("source"));
    render.mockResolvedValue(Buffer.from("composite"));
    normalize.mockResolvedValue(Buffer.from("normalized"));
    putObject.mockResolvedValue(undefined);
    completeCandidate.mockResolvedValue({ id: input.outputId });
    failRegeneration.mockResolvedValue({ id: input.outputId });
  });

  it("has zero automatic retries", () => {
    expect(creativeWorkLayerRegenerationJob.id()).toBe("regenerate-creative-work-layer");
  });

  it("does not let a late operation overwrite a newer regeneration", async () => {
    markProcessing.mockResolvedValue(null);
    stateFromOutput.mockReturnValue(null);
    const provider = { regenerate: vi.fn() };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "skipped" });

    expect(provider.regenerate).not.toHaveBeenCalled();
    expect(completeCandidate).not.toHaveBeenCalled();
    expect(failRegeneration).not.toHaveBeenCalled();
  });

  it("skips a duplicate delivery once the reserved-to-processing claim is consumed", async () => {
    markProcessing.mockResolvedValueOnce({ id: input.outputId }).mockResolvedValueOnce(null);
    stateFromOutput.mockImplementation((row) => row ? state : null);
    const provider = { regenerate: vi.fn().mockResolvedValue({ buffer: Buffer.from("candidate"), requestId: "request-1" }) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "ready" });
    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "skipped" });
    expect(provider.regenerate).toHaveBeenCalledOnce();
  });

  it("conservatively recovers a stale processing operation without invoking the provider again", async () => {
    markProcessing.mockResolvedValue(null);
    stateFromOutput.mockReturnValue(null);
    recoverStale.mockResolvedValue({ id: input.outputId });
    const provider = { regenerate: vi.fn() };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "skipped" });

    expect(recoverStale).toHaveBeenCalledWith(expect.objectContaining(input));
    expect(provider.regenerate).not.toHaveBeenCalled();
  });

  it("records submission_unknown for ambiguous provider timeout after invocation", async () => {
    const provider = { regenerate: vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" })) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "failed" });

    expect(failRegeneration).toHaveBeenCalledWith(expect.objectContaining({ ...input, status: "submission_unknown", failureCode: "layer_regeneration_submission_unknown" }));
  });

  it("records provider failure for a definitive provider response", async () => {
    const provider = { regenerate: vi.fn().mockRejectedValue(new Error("OpenAI returned no layer candidate")) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "failed" });

    expect(failRegeneration).toHaveBeenCalledWith(expect.objectContaining({ ...input, status: "failed", failureCode: "layer_regeneration_provider_failed" }));
  });

  it("records failed when a returned candidate is not transparent", async () => {
    normalize.mockRejectedValue(new Error("Candidate must be transparent PNG"));
    const provider = { regenerate: vi.fn().mockResolvedValue({ buffer: Buffer.from("not-alpha"), requestId: "request-1" }) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "failed" });

    expect(failRegeneration).toHaveBeenCalledWith(expect.objectContaining({ ...input, status: "failed", failureCode: "layer_regeneration_invalid_asset" }));
    expect(putObject).not.toHaveBeenCalled();
  });

  it("records storage failure separately from an invalid candidate", async () => {
    putObject.mockRejectedValue(new Error("storage unavailable"));
    const provider = { regenerate: vi.fn().mockResolvedValue({ buffer: Buffer.from("valid"), requestId: "request-1" }) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "failed" });

    expect(failRegeneration).toHaveBeenCalledWith(expect.objectContaining({ ...input, status: "failed", failureCode: "layer_regeneration_storage_failed" }));
  });

  it("cleans a temporary candidate and skips when candidate completion loses CAS", async () => {
    completeCandidate.mockResolvedValue(null);
    const provider = { regenerate: vi.fn().mockResolvedValue({ buffer: Buffer.from("valid"), requestId: "request-1" }) };

    await expect(runCreativeWorkLayerRegeneration(input, provider)).resolves.toEqual({ status: "skipped" });
    expect(deleteObject).toHaveBeenCalledWith(`layer-editor-candidates/${input.workspaceId}/${input.workItemId}/${input.outputId}/${input.operationId}.png`);
  });
});
