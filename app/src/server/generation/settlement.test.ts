import { beforeEach, describe, expect, it, vi } from "vitest";

const refund = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/credits", () => ({
  refundCredits: refund,
}));

import {
  settleTerminalRefund,
  startGenerationSettlement,
  type GenerationSettlementAdapter,
} from "./settlement";

type TestValue = { id: string; status: "queued" | "generating" | "failed" };

function testAdapter(): GenerationSettlementAdapter<TestValue> {
  return {
    reserve: vi.fn().mockResolvedValue({
      claimed: true,
      value: { id: "output-1", status: "queued" },
    }),
    charge: vi.fn().mockResolvedValue({ ok: true, creditsSpent: 5 }),
    release: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    failDispatch: vi.fn(),
    completeDispatch: vi.fn().mockResolvedValue({
      id: "output-1",
      status: "generating",
    }),
  };
}

describe("startGenerationSettlement", () => {
  it("settles a claimed generation through one interface", async () => {
    const result = await startGenerationSettlement(testAdapter());

    expect(result).toEqual({
      ok: true,
      value: { id: "output-1", status: "generating" },
    });
  });

  it("releases a blocked reservation without dispatching", async () => {
    const adapter = testAdapter();
    const blocked = {
      ok: false,
      reason: "insufficient_credits",
      details: { reason: "insufficient_credits" },
    } as const;
    vi.mocked(adapter.charge).mockResolvedValue(blocked);

    const result = await startGenerationSettlement(adapter);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "credit_blocked",
        reason: "insufficient_credits",
        details: { reason: "insufficient_credits" },
      },
    });
    expect(adapter.release).toHaveBeenCalledOnce();
    expect(adapter.dispatch).not.toHaveBeenCalled();
  });

  it("releases the reservation when charging crashes", async () => {
    const adapter = testAdapter();
    vi.mocked(adapter.charge).mockRejectedValue(new Error("billing down"));

    await expect(startGenerationSettlement(adapter)).rejects.toThrow(
      "billing down",
    );
    expect(adapter.release).toHaveBeenCalledOnce();
    expect(adapter.dispatch).not.toHaveBeenCalled();
  });

  it("retries when a joined reservation disappears before charging", async () => {
    const adapter = testAdapter();
    vi.mocked(adapter.reserve)
      .mockResolvedValueOnce({
        claimed: false,
        value: { id: "output-1", status: "queued" },
      })
      .mockResolvedValueOnce({
        claimed: true,
        value: { id: "output-2", status: "queued" },
      });
    adapter.join = vi.fn().mockResolvedValue(null);

    const result = await startGenerationSettlement(adapter);

    expect(result.ok).toBe(true);
    expect(adapter.reserve).toHaveBeenCalledTimes(2);
    expect(adapter.charge).toHaveBeenCalledOnce();
  });

  it("fails the reservation and compensates a synchronous dispatch failure", async () => {
    const adapter = testAdapter();
    const refundInput = {
      workspaceId: "workspace-1",
      action: "image_derivation" as const,
      amount: 5,
      idempotencyKey: "output-1:dispatch-refund",
    };
    vi.mocked(adapter.dispatch).mockRejectedValue(new Error("transport down"));
    vi.mocked(adapter.failDispatch).mockResolvedValue({
      value: { id: "output-1", status: "failed" },
      refunds: [refundInput],
    } as never);
    refund.mockResolvedValue({ status: "refunded" });

    const result = await startGenerationSettlement(adapter);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "dispatch_failed",
        value: { id: "output-1", status: "failed" },
        compensated: true,
      },
    });
    expect(refund).toHaveBeenCalledWith(refundInput);
    expect(adapter.completeDispatch).not.toHaveBeenCalled();
  });

  it("keeps dispatch failure typed when failure persistence crashes", async () => {
    const adapter = testAdapter();
    vi.mocked(adapter.dispatch).mockRejectedValue(new Error("transport down"));
    vi.mocked(adapter.failDispatch).mockRejectedValue(new Error("database down"));

    const result = await startGenerationSettlement(adapter);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "dispatch_failed",
        value: { id: "output-1", status: "queued" },
        compensated: false,
      },
    });
  });
});

describe("settleTerminalRefund", () => {
  beforeEach(() => {
    refund.mockReset();
  });

  it("refunds a refundable decision exactly once through the ledger", async () => {
    refund.mockResolvedValue({ status: "refunded" });

    const result = await settleTerminalRefund({
      decision: {
        refund: true,
        amount: 5,
        idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
        reason: "creative_work_terminal_failure",
      },
      workspaceId: "workspace-1",
      metadata: {
        creativeWorkId: "work-1",
        outputId: "output-1",
        description: "creative_work_output_terminal_refund",
      },
      userId: "user-1",
    });

    expect(result).toEqual({
      refunded: true,
      applied: true,
      reason: "creative_work_terminal_failure",
      status: "refunded",
    });
    expect(refund).toHaveBeenCalledOnce();
    expect(refund).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
      amount: 5,
      metadata: {
        creativeWorkId: "work-1",
        outputId: "output-1",
        description: "creative_work_output_terminal_refund",
      },
      userId: "user-1",
    });
  });

  it("skips non-refundable decisions without touching the ledger", async () => {
    const result = await settleTerminalRefund({
      decision: {
        refund: false,
        reason: "derivation_job_failure_non_refundable",
      },
      workspaceId: "workspace-1",
      metadata: { derivationId: "derivation-1" },
    });

    expect(result).toEqual({
      refunded: false,
      applied: true,
      reason: "derivation_job_failure_non_refundable",
    });
    expect(refund).not.toHaveBeenCalled();
  });

  it("treats duplicate ledger writes as applied (idempotent redelivery)", async () => {
    refund.mockResolvedValue({ status: "duplicate" });

    const result = await settleTerminalRefund({
      decision: {
        refund: true,
        amount: 5,
        idempotencyKey: "assistant-action:action-1:refund",
        reason: "assistant_creative_revision_job_failure",
      },
      workspaceId: "workspace-1",
      metadata: { actionId: "action-1" },
      userId: "user-1",
    });

    expect(result).toEqual({
      refunded: true,
      applied: true,
      reason: "assistant_creative_revision_job_failure",
      status: "duplicate",
    });
    expect(refund).toHaveBeenCalledOnce();
  });

  it("reports applied=false when the ledger write fails", async () => {
    refund.mockRejectedValue(new Error("billing down"));

    const result = await settleTerminalRefund({
      decision: {
        refund: true,
        amount: 5,
        idempotencyKey: "creative-work:work-1:output:output-1:terminal-refund",
        reason: "creative_work_terminal_failure",
      },
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      refunded: true,
      applied: false,
      reason: "creative_work_terminal_failure",
      error: "billing down",
    });
  });
});
