import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerizationState } from "@/server/layerize/contracts";

const claimMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const postDispatchLockMock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));

vi.mock("@/server/repositories/creative-work-layerization", () => ({
  claimExpiredCreativeWorkLayerizationRecovery: (...args: unknown[]) => claimMock(...args),
  releaseCreativeWorkLayerizationRecoveryLease: (...args: unknown[]) => releaseMock(...args),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...args) },
}));
vi.mock("@/server/layer-editor/quota", () => ({
  withLayerEditorPostDispatchLock: (...args: unknown[]) => postDispatchLockMock(...args),
}));

import { recoverExpiredCreativeWorkLayerizations } from "./recover-expired-creative-work-layerizations";

const now = new Date("2026-08-12T15:00:00.000Z");

function state(status: LayerizationState["status"]): LayerizationState {
  return {
    status,
    attemptId: "attempt-1",
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: now.toISOString(),
    callbackDeadlineAt: "2026-08-12T12:00:00.000Z",
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
    failureCode: null,
  };
}

describe("expired creative work layerization recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    releaseMock.mockResolvedValue(true);
    postDispatchLockMock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({}));
  });

  it("releases the recovery lease when event dispatch fails", async () => {
    const recovered = state("reconciling");
    claimMock.mockResolvedValue({ id: "output-1", layerization: recovered });
    sendMock.mockRejectedValue(new Error("inngest unavailable"));

    const result = await recoverExpiredCreativeWorkLayerizations({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputs: [{
        id: "output-1",
        layerization: {
          ...recovered,
          status: "finalizing",
          updatedAt: "2026-08-12T10:00:00.000Z",
          callbackDeadlineAt: "2099-08-12T12:00:00.000Z",
        },
      }],
      now,
    });

    expect(result.get("output-1")).toEqual(recovered);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "creative-work-layerize:output-1:attempt-1:recovery:2026-08-12T15:00:00.000Z",
    }));
    expect(releaseMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      claimedAt: "2026-08-12T15:00:00.000Z",
      now,
    });
  });

  it("claims an expired queued attempt so it can become submission_unknown", async () => {
    const unknown = { ...state("submission_unknown"), providerRequestId: null, failureCode: "submission_unknown" as const };
    claimMock.mockResolvedValue({ id: "output-queued", layerization: unknown });

    const result = await recoverExpiredCreativeWorkLayerizations({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputs: [{
        id: "output-queued",
        layerization: {
          ...unknown,
          status: "queued",
          updatedAt: "2026-08-12T10:00:00.000Z",
          callbackDeadlineAt: "2026-08-12T12:00:00.000Z",
        },
      }],
      now,
    });

    expect(result.get("output-queued")).toEqual(unknown);
    expect(claimMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-queued",
      now,
    }, expect.anything());
    expect(postDispatchLockMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "layerize_v1", operationId: "attempt-1" }), expect.any(Function));
    expect(sendMock).not.toHaveBeenCalled();
  });
});
