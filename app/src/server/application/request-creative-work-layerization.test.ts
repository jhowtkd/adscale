import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWorkMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const clearFailedMock = vi.hoisted(() => vi.fn());
const failQueuedMock = vi.hoisted(() => vi.fn());
const getOutputMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
}));
vi.mock("@/server/repositories/creative-work-layerization", () => ({
  claimCreativeWorkLayerization: (...args: unknown[]) => claimMock(...args),
  clearFailedCreativeWorkLayerizationForRetry: (...args: unknown[]) => clearFailedMock(...args),
  failQueuedCreativeWorkLayerization: (...args: unknown[]) => failQueuedMock(...args),
  getCreativeWorkLayerizationOutput: (...args: unknown[]) => getOutputMock(...args),
  hashLayerizationCallbackToken: () => "a".repeat(64),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...args) },
}));
vi.mock("@/server/jobs/heavy-image-events", () => ({
  heavyImageEventName: (name: string) => name,
}));
vi.mock("@/server/layerize/seedream-provider", () => ({
  SEEDREAM_LAYERIZE_MODEL_ID: "bytedance/seedream/v5/pro/layerize",
  SEEDREAM_PROVIDER_ENDPOINT: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
}));

import { requestCreativeWorkLayerization } from "./request-creative-work-layerization";

const originalFalKey = process.env.FAL_KEY;
const input = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  userId: "owner-1",
  callbackUrl: "https://app.example/api/creative-work/work-1",
};

describe("requestCreativeWorkLayerization", () => {
  let output: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_KEY = "test-key";
    output = {
      id: "output-1",
      status: "completed",
      outputKey: "creative-work/original.png",
      isSelected: true,
      layerization: null,
    };
    getWorkMock.mockImplementation(async () => ({ outputs: [output] }));
    claimMock.mockResolvedValue({ id: "output-1", layerization: null });
    sendMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalFalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalFalKey;
  });

  it("claims one attempt and replays a second command without another event", async () => {
    const first = await requestCreativeWorkLayerization(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    output.layerization = first.state;

    const second = await requestCreativeWorkLayerization(input);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("already_running");
    expect(claimMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("does not retry a submission whose outcome is unknown", async () => {
    output.layerization = {
      status: "submission_unknown",
      attemptId: "attempt-1",
      callbackTokenHash: "a".repeat(64),
      callbackConsumedAt: null,
      requestedByUserId: "owner-1",
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
      latencyMs: null,
      providerRequestId: null,
      providerModel: "bytedance/seedream/v5/pro/layerize",
      providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
      estimatedCostUsd: null,
      baseWidth: null,
      baseHeight: null,
      layers: [],
      psdKey: null,
      diagnosticZipKey: null,
      fidelity: null,
      failureCode: "submission_unknown",
    };

    const result = await requestCreativeWorkLayerization({ ...input, retry: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("submission_unknown");
    expect(claimMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not retry a provider failure that may already have been charged", async () => {
    output.layerization = {
      status: "failed",
      attemptId: "attempt-1",
      callbackTokenHash: "a".repeat(64),
      callbackConsumedAt: null,
      requestedByUserId: "owner-1",
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
      latencyMs: null,
      providerRequestId: "request-1",
      providerModel: "bytedance/seedream/v5/pro/layerize",
      providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
      estimatedCostUsd: null,
      baseWidth: null,
      baseHeight: null,
      layers: [],
      psdKey: null,
      diagnosticZipKey: null,
      fidelity: null,
      failureCode: "provider_error",
    };

    const result = await requestCreativeWorkLayerization({ ...input, retry: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("failed");
    expect(claimMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not mark an already-advanced attempt failed when Inngest send is ambiguous", async () => {
    sendMock.mockRejectedValue(new Error("inngest response lost"));
    failQueuedMock.mockResolvedValue(null);
    claimMock.mockImplementation(async (value: { state: Record<string, unknown> }) => {
      getOutputMock.mockResolvedValue({
        layerization: { ...value.state, status: "processing" },
      });
      return { id: "output-1", layerization: value.state };
    });

    const result = await requestCreativeWorkLayerization(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.status).toBe("processing");
      expect(result.accepted).toBe(true);
    }
    expect(failQueuedMock).toHaveBeenCalledWith(expect.objectContaining({
      outputId: "output-1",
      code: "dispatch_failed",
    }));
  });
});
