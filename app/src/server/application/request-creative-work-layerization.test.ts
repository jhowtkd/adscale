import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWorkMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const clearFailedMock = vi.hoisted(() => vi.fn());
const failQueuedMock = vi.hoisted(() => vi.fn());
const getOutputMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const quotaClaimMock = vi.hoisted(() => vi.fn());
const quotaReleaseMock = vi.hoisted(() => vi.fn());
const quotaReleasedMock = vi.hoisted(() => vi.fn());
const quotaCommittedMock = vi.hoisted(() => vi.fn());
const markCommittedMock = vi.hoisted(() => vi.fn());
const dispatchCommittedMock = vi.hoisted(() => vi.fn());
const markDispatchCommittedMock = vi.hoisted(() => vi.fn());
const operationLockMock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));
const dispatchLockMock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));

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
vi.mock("@/server/layer-editor/quota", () => ({
  claimLayerEditorQuota: (...args: unknown[]) => quotaClaimMock(...args),
  isLayerEditorQuotaReleased: (...args: unknown[]) => quotaReleasedMock(...args),
  isLayerEditorQuotaReservationCommitted: (...args: unknown[]) => quotaCommittedMock(...args),
  markLayerEditorQuotaReservationCommitted: (...args: unknown[]) => markCommittedMock(...args),
  isLayerEditorQuotaDispatchCommitted: (...args: unknown[]) => dispatchCommittedMock(...args),
  markLayerEditorQuotaDispatchCommitted: (...args: unknown[]) => markDispatchCommittedMock(...args),
  releaseLayerEditorQuota: (...args: unknown[]) => quotaReleaseMock(...args),
  withLayerEditorOperationLock: (...args: unknown[]) => operationLockMock(...args),
  withLayerEditorPostDispatchLock: (...args: unknown[]) => dispatchLockMock(...args),
}));
vi.mock("@/server/layerize/seedream-provider", () => ({
  SEEDREAM_LAYERIZE_MODEL_ID: "bytedance/seedream-v5.0-pro/layer-decomposition",
  SEEDREAM_PROVIDER_ENDPOINT: "https://api.atlascloud.ai/api/v1/model/generateImage",
}));

import { requestCreativeWorkLayerization } from "./request-creative-work-layerization";

const originalAtlasCloudKey = process.env.ATLASCLOUD_API_KEY;
const input = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  userId: "owner-1",
  operationId: "00000000-0000-4000-8000-000000000001",
  callbackUrl: "https://app.example/api/creative-work/work-1",
};

describe("requestCreativeWorkLayerization", () => {
  let output: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    getOutputMock.mockReset();
    process.env.ATLASCLOUD_API_KEY = "test-key";
    output = {
      id: "output-1",
      status: "completed",
      outputKey: "creative-work/original.png",
      isSelected: true,
      layerization: null,
    };
    getWorkMock.mockImplementation(async () => ({ outputs: [output] }));
    getOutputMock.mockImplementation(async () => output);
    claimMock.mockImplementation(async (value: { state: Record<string, unknown> }) => {
      output.layerization = value.state;
      return { id: "output-1", layerization: value.state };
    });
    sendMock.mockResolvedValue(undefined);
    quotaClaimMock.mockResolvedValue({ ok: true, replay: false });
    quotaReleaseMock.mockResolvedValue({ released: true });
    quotaReleasedMock.mockResolvedValue(false);
    quotaCommittedMock.mockResolvedValue(false);
    markCommittedMock.mockResolvedValue(true);
    dispatchCommittedMock.mockResolvedValue(false);
    markDispatchCommittedMock.mockResolvedValue(true);
    clearFailedMock.mockImplementation(async () => {
      output.layerization = null;
      return { id: "output-1", layerization: null };
    });
  });

  afterEach(() => {
    if (originalAtlasCloudKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = originalAtlasCloudKey;
  });

  it("rejects a committed historical operation after a later failed attempt", async () => {
    output.layerization = {
      status: "failed", attemptId: "00000000-0000-4000-8000-000000000099", callbackTokenHash: "a".repeat(64), callbackConsumedAt: null, requestedByUserId: "owner-1",
      createdAt: "2026-08-12T12:00:00.000Z", updatedAt: "2026-08-12T12:00:00.000Z", callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
      latencyMs: null, providerRequestId: null, providerModel: "model", providerEndpoint: "https://example.test", estimatedCostUsd: null,
      baseWidth: null, baseHeight: null, layers: [], psdKey: null, diagnosticZipKey: null, fidelity: null, failureCode: "provider_error",
    };
    quotaClaimMock.mockResolvedValue({ ok: true, replay: true });
    quotaCommittedMock.mockResolvedValue(true);

    await expect(requestCreativeWorkLayerization({ ...input, retry: true })).resolves.toMatchObject({ ok: false, error: { code: "layerization_replay_conflict" } });
    expect(clearFailedMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("claims one attempt and redelivers the stable event for a queued replay", async () => {
    const first = await requestCreativeWorkLayerization(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    output.layerization = first.state;

    const second = await requestCreativeWorkLayerization(input);

    expect(second).toMatchObject({ ok: true, accepted: false, replay: true });
    expect(claimMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("serializes a queued replay behind definitive dispatch compensation", async () => {
    let queued: Record<string, unknown> | null = null;
    claimMock.mockImplementation(async (value: { state: Record<string, unknown> }) => {
      queued = value.state;
      output.layerization = queued;
      return { id: "output-1", layerization: queued };
    });
    let tail = Promise.resolve();
    dispatchLockMock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      try { return await run({}); } finally { unlock(); }
    });
    failQueuedMock.mockImplementation(async () => {
      output.layerization = { ...queued!, status: "failed", failureCode: "dispatch_failed" };
      return output;
    });
    let reject!: (error: Error) => void;
    sendMock.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));

    const winner = requestCreativeWorkLayerization(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replay = requestCreativeWorkLayerization(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendMock).toHaveBeenCalledOnce();
    reject(new Error("dispatch failed"));

    await expect(winner).resolves.toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    await expect(replay).resolves.toMatchObject({ ok: false, error: { code: "failed", state: { status: "failed", failureCode: "dispatch_failed" } } });
    expect(quotaReleaseMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("recovers a quota claim that exists before the layerization reservation", async () => {
    quotaClaimMock.mockResolvedValue({ ok: true, replay: true });
    claimMock.mockImplementation(async (value: { state: Record<string, unknown> }) => {
      output.layerization = value.state;
      return { id: "output-1", layerization: value.state };
    });

    await expect(requestCreativeWorkLayerization(input)).resolves.toMatchObject({ ok: true, accepted: true, replay: false });
    expect(claimMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("compensates a replayed quota claim that loses layerization reservation", async () => {
    quotaClaimMock.mockResolvedValue({ ok: true, replay: true });
    claimMock.mockResolvedValue(null);
    getOutputMock.mockResolvedValue({ layerization: null });

    await expect(requestCreativeWorkLayerization(input)).resolves.toMatchObject({ ok: false, error: { code: "output_not_eligible" } });

    expect(quotaReleaseMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "layerize_v1", operationId: input.operationId }), expect.any(Date), expect.anything());
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("redelivers the stable event when a layerization claim CAS loser finds its queued attempt", async () => {
    let queued: Record<string, unknown> | null = null;
    claimMock.mockImplementation(async (value: { state: Record<string, unknown> }) => { queued = value.state; return null; });
    getOutputMock.mockImplementation(async () => ({ layerization: queued }));

    await expect(requestCreativeWorkLayerization(input)).resolves.toMatchObject({ ok: true, accepted: false, replay: true });

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ id: `creative-work-layerize:${input.outputId}:${input.operationId}` }));
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
      providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
      providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
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

  it("allows an explicit retry after a provider failure", async () => {
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
      providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
      providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
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

    expect(result.ok).toBe(true);
    expect(clearFailedMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
    }), expect.anything());
    expect(claimMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it.each(["provider failure", "compensated dispatch failure"])("does not clear or redispatch a terminal same-operation %s", async (label) => {
    void label;
    output.layerization = {
      status: "failed", attemptId: input.operationId, callbackTokenHash: "a".repeat(64), callbackConsumedAt: null, requestedByUserId: "owner-1",
      createdAt: "2026-08-12T12:00:00.000Z", updatedAt: "2026-08-12T12:00:00.000Z", callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
      latencyMs: null, providerRequestId: null, providerModel: "model", providerEndpoint: "https://example.test", estimatedCostUsd: null,
      baseWidth: null, baseHeight: null, layers: [], psdKey: null, diagnosticZipKey: null, fidelity: null, failureCode: "dispatch_failed",
    };

    await expect(requestCreativeWorkLayerization({ ...input, retry: true })).resolves.toMatchObject({ ok: false, error: { code: "failed" } });

    expect(clearFailedMock).not.toHaveBeenCalled();
    expect(quotaClaimMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not clear a failed attempt before retry quota admission succeeds", async () => {
    output.layerization = {
      status: "failed", attemptId: "attempt-1", callbackTokenHash: "a".repeat(64), callbackConsumedAt: null, requestedByUserId: "owner-1",
      createdAt: "2026-08-12T12:00:00.000Z", updatedAt: "2026-08-12T12:00:00.000Z", callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
      latencyMs: null, providerRequestId: null, providerModel: "model", providerEndpoint: "https://example.test", estimatedCostUsd: null,
      baseWidth: null, baseHeight: null, layers: [], psdKey: null, diagnosticZipKey: null, fidelity: null, failureCode: "provider_error",
    };
    quotaClaimMock.mockResolvedValue({ ok: false, code: "quota_exhausted" });

    await expect(requestCreativeWorkLayerization({ ...input, retry: true })).resolves.toMatchObject({ ok: false, error: { code: "layer_editor_quota_exhausted" } });
    expect(clearFailedMock).not.toHaveBeenCalled();
    expect(output.layerization).toMatchObject({ status: "failed", failureCode: "provider_error" });
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
    expect(failQueuedMock).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled", "layer_editor_not_available"],
    ["quota_exhausted", "layer_editor_quota_exhausted"],
  ] as const)("preserves the %s Layerize quota outcome", async (quotaCode, expectedCode) => {
    quotaClaimMock.mockResolvedValue({ ok: false, code: quotaCode });
    const result = await requestCreativeWorkLayerization(input);
    expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
  });

  it("rejects a compensated operation replay after retry state was cleared", async () => {
    quotaClaimMock.mockResolvedValue({ ok: true, replay: true });
    quotaReleasedMock.mockResolvedValue(true);
    const result = await requestCreativeWorkLayerization({ ...input, retry: true });
    expect(result).toMatchObject({ ok: false, error: { code: "layerization_replay_conflict" } });
    expect(claimMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not resend a queued attempt after durable dispatch confirmation", async () => {
    let dispatched = false;
    quotaClaimMock.mockImplementation(async () => ({ ok: true as const, replay: dispatched }));
    dispatchCommittedMock.mockImplementation(async () => dispatched);
    markDispatchCommittedMock.mockImplementation(async () => { dispatched = true; return true; });
    sendMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("must not send"));
    await expect(requestCreativeWorkLayerization(input)).resolves.toMatchObject({ ok: true, accepted: true });
    await expect(requestCreativeWorkLayerization(input)).resolves.toMatchObject({ ok: true, accepted: false, replay: true });
    expect(sendMock).toHaveBeenCalledOnce(); expect(failQueuedMock).not.toHaveBeenCalled(); expect(quotaReleaseMock).not.toHaveBeenCalled();
  });

  it("does not compensate after Layerize dispatch marker persistence fails", async () => {
    sendMock.mockReset(); sendMock.mockResolvedValue(undefined); markDispatchCommittedMock.mockReset(); markDispatchCommittedMock.mockRejectedValue(new Error("marker"));
    await expect(requestCreativeWorkLayerization(input)).rejects.toThrow("marker");
    expect(failQueuedMock).not.toHaveBeenCalled(); expect(quotaReleaseMock).not.toHaveBeenCalled();
  });
});
