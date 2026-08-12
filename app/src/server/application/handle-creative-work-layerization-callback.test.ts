import { beforeEach, describe, expect, it, vi } from "vitest";

const acceptMock = vi.hoisted(() => vi.fn());
const failMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work-layerization", () => ({
  acceptCreativeWorkLayerizationCallback: (...args: unknown[]) => acceptMock(...args),
  failCreativeWorkLayerization: (...args: unknown[]) => failMock(...args),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...args) },
}));

import { handleCreativeWorkLayerizationCallback } from "./handle-creative-work-layerization-callback";

const callback = {
  workItemId: "work-1",
  outputId: "output-1",
  attemptId: "attempt-1",
  token: "token-1",
};

describe("creative work layerization callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue(undefined);
    failMock.mockResolvedValue(undefined);
  });

  it("validates the callback and dispatches exactly one continuation", async () => {
    acceptMock.mockResolvedValue({
      accepted: true,
      replay: false,
      row: { workspaceId: "workspace-1" },
    });

    const result = await handleCreativeWorkLayerizationCallback({
      ...callback,
      payload: { status: "COMPLETED", request_id: "request-1", response: { layers: [] } },
    });

    expect(result).toEqual({ ok: true, replay: false });
    expect(acceptMock).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      token: "token-1",
      requestId: "request-1",
    }));
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].data).not.toHaveProperty("providerPayload");
  });

  it("does not dispatch a replayed callback", async () => {
    acceptMock.mockResolvedValue({
      accepted: false,
      replay: true,
      row: { workspaceId: "workspace-1" },
    });

    await expect(handleCreativeWorkLayerizationCallback({
      ...callback,
      payload: { status: "COMPLETED", request_id: "request-1" },
    })).resolves.toEqual({ ok: true, replay: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not mutate or dispatch an invalid callback", async () => {
    acceptMock.mockResolvedValue({ accepted: false, replay: false, row: null });

    await expect(handleCreativeWorkLayerizationCallback({
      ...callback,
      payload: { status: "COMPLETED", request_id: "" },
    })).resolves.toEqual({ ok: false, code: "invalid_callback" });
    expect(acceptMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(failMock).not.toHaveBeenCalled();
  });
});
