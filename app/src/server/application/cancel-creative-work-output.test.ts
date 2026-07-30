import { beforeEach, describe, expect, it, vi } from "vitest";

const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const cancelOutputMock = vi.hoisted(() => vi.fn());
const markFailureCodeMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const recordAggregateMock = vi.hoisted(() => vi.fn());
const settleRefundMock = vi.hoisted(() => vi.fn());
const terminalMock = vi.hoisted(() => vi.fn());
const aggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  cancelCreativeWorkOutput: (...args: unknown[]) => cancelOutputMock(...args),
  markCreativeWorkOutputFailureCode: (...args: unknown[]) => markFailureCodeMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  recordCreativeWorkGenerationAggregate: (...args: unknown[]) => recordAggregateMock(...args),
}));

vi.mock("@/server/generation/settlement", () => ({
  settleTerminalRefund: (...args: unknown[]) => settleRefundMock(...args),
}));

vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkOutputTerminal: (...args: unknown[]) => terminalMock(...args),
  logCreativeWorkGenerationAggregate: (...args: unknown[]) => aggregateMock(...args),
}));

import { cancelCreativeWorkOutput } from "./cancel-creative-work-output";

const queuedOutput = {
  id: "output-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  generationCorrelationId: "generation-1",
  status: "queued",
  imageCallCount: 0,
  retryCount: 0,
  queuedAt: new Date("2026-07-29T10:00:00.000Z"),
  createdAt: new Date("2026-07-29T10:00:00.000Z"),
  updatedAt: new Date("2026-07-29T10:00:01.000Z"),
  terminalAt: new Date("2026-07-29T10:00:01.000Z"),
};

const work = {
  id: "work-1",
  workspaceId: "workspace-1",
  generationCorrelationId: "generation-1",
};

describe("cancelCreativeWorkOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCreativeWorkMock.mockResolvedValue({ work, outputs: [{ ...queuedOutput, status: "queued" }] });
    cancelOutputMock.mockResolvedValue(queuedOutput);
    settleRefundMock.mockResolvedValue({ refunded: true, applied: true, status: "refunded" });
    refreshStatusMock.mockResolvedValue("partial");
    recordAggregateMock.mockResolvedValue(null);
  });

  it("wins the CAS, refunds once, and emits one canceled terminal event", async () => {
    const result = await cancelCreativeWorkOutput({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      userId: "user-1",
    });

    expect(result).toMatchObject({ ok: true, value: { refunded: true } });
    expect(cancelOutputMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1");
    expect(settleRefundMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      userId: "user-1",
      decision: expect.objectContaining({ idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund" }),
    }));
    expect(terminalMock).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "canceled",
      failureCode: "generation_canceled",
      refunded: true,
    }));
    expect(terminalMock).toHaveBeenCalledTimes(1);
  });

  it("does not refund when another terminal transition wins the race", async () => {
    cancelOutputMock.mockResolvedValue(null);
    getCreativeWorkMock
      .mockResolvedValueOnce({ work, outputs: [{ ...queuedOutput, status: "queued" }] })
      .mockResolvedValueOnce({ work, outputs: [{ ...queuedOutput, status: "completed" }] });

    const result = await cancelCreativeWorkOutput({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result).toEqual({ ok: false, error: { code: "output_not_cancellable", status: "completed" } });
    expect(settleRefundMock).not.toHaveBeenCalled();
    expect(terminalMock).not.toHaveBeenCalled();
  });
});
