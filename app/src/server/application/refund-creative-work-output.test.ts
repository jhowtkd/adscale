import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOutcomeMock = vi.hoisted(() => vi.fn());
const settleTerminalRefundMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/generation/settlement-adapters", () => ({
  resolveCreativeWorkOutputReactivationOutcome: (...args: unknown[]) =>
    resolveOutcomeMock(...args),
}));

vi.mock("@/server/generation/settlement", () => ({
  settleTerminalRefund: (...args: unknown[]) => settleTerminalRefundMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) },
}));

import { refundCreativeWorkOutputCompensatory } from "./refund-creative-work-output";

const baseInput = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  outputId: "output-1",
  reason: "stale_generation_timeout",
};

describe("refundCreativeWorkOutputCompensatory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOutcomeMock.mockResolvedValue({ state: "none" });
    settleTerminalRefundMock.mockResolvedValue({
      refunded: true,
      applied: true,
      reason: "creative_work_job_failure",
      status: "refunded",
    });
  });

  it("returns true without settling when the reactivation was already compensated", async () => {
    resolveOutcomeMock.mockResolvedValue({
      state: "already_refunded",
      kind: "manual",
      retryAttempt: 1,
      chargeKey: "creative-work:work-1:output:output-1:reactivate-1",
      refundKey: "creative-work:work-1:output:output-1:reactivate-1-refund",
    });

    const result = await refundCreativeWorkOutputCompensatory({
      ...baseInput,
      manualRetryAttempt: 1,
      userId: "user-1",
    });

    expect(result).toBe(true);
    expect(settleTerminalRefundMock).not.toHaveBeenCalled();
  });

  it("settles an outstanding reactivation with its canonical refund key", async () => {
    resolveOutcomeMock.mockResolvedValue({
      state: "outstanding",
      kind: "manual",
      retryAttempt: 2,
      chargeKey: "creative-work:work-1:output:output-1:reactivate-2",
      refundKey: "creative-work:work-1:output:output-1:reactivate-2-refund",
    });

    const result = await refundCreativeWorkOutputCompensatory({
      ...baseInput,
      manualRetryAttempt: 2,
      userId: "user-1",
    });

    expect(result).toBe(true);
    expect(settleTerminalRefundMock).toHaveBeenCalledWith({
      decision: expect.objectContaining({
        refund: true,
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-2-refund",
        reason: "creative_work_terminal_reactivation_failure",
      }),
      workspaceId: "workspace-1",
      action: "image_derivation",
      metadata: expect.objectContaining({
        creativeWorkId: "work-1",
        outputId: "output-1",
      }),
      userId: "user-1",
    });
  });

  it("uses the terminal canonical key for a preserved QA-fail completion", async () => {
    const result = await refundCreativeWorkOutputCompensatory({
      ...baseInput,
      failurePhase: "terminal",
      userId: "user-1",
    });

    expect(result).toBe(true);
    expect(settleTerminalRefundMock).toHaveBeenCalledWith({
      decision: expect.objectContaining({
        refund: true,
        idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
        reason: "creative_work_terminal_failure",
      }),
      workspaceId: "workspace-1",
      action: "image_derivation",
      metadata: expect.objectContaining({ reason: "stale_generation_timeout" }),
      userId: "user-1",
    });
  });

  it("treats a replayed ledger settlement as liquidated", async () => {
    settleTerminalRefundMock.mockResolvedValue({
      refunded: true,
      applied: true,
      reason: "creative_work_job_failure",
      status: "duplicate",
    });

    const result = await refundCreativeWorkOutputCompensatory(baseInput);

    expect(result).toBe(true);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("returns false when the settlement is not applied", async () => {
    settleTerminalRefundMock.mockResolvedValue({
      refunded: true,
      applied: false,
      reason: "creative_work_job_failure",
      error: "ledger unavailable",
    });

    const result = await refundCreativeWorkOutputCompensatory(baseInput);

    expect(result).toBe(false);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "compensatory_refund",
        status: "failed",
        outputId: "output-1",
        errorMessage: "ledger unavailable",
      })
    );
  });
});
