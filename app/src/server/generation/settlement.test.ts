import { describe, expect, it, vi } from "vitest";

const refund = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/credits", () => ({
  refundCredits: refund,
}));

import {
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
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    } as const;
    vi.mocked(adapter.charge).mockResolvedValue(blocked as never);

    const result = await startGenerationSettlement(adapter);

    expect(result).toEqual({
      ok: false,
      error: { code: "credit_blocked", spend: blocked },
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
});
