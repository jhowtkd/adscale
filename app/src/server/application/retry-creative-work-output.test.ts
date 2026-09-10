import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  CREATIVE_WORK_MAX_IMAGE_CALLS: 2,
  CREATIVE_WORK_GENERATION_FAILED_TERMINAL_REFUND_PENDING:
    "generation_failed_terminal_refund_pending",
  getCreativeWork: vi.fn(),
  claimCreativeWorkOutputManualRetryAttempt: vi.fn(),
  failQueuedCreativeWorkOutput: vi.fn(),
  releaseCreativeWorkOutputManualRetryAttempt: vi.fn(),
  requeueFailedCreativeWorkOutput: vi.fn(),
  markCreativeWorkOutputFailureCode: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/billing/credits", () => ({
  recordUsage: vi.fn(),
  canSpend: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/generation/settlement", () => ({
  settleTerminalRefund: vi.fn(),
}));

import {
  getCreativeWork,
  claimCreativeWorkOutputManualRetryAttempt,
  failQueuedCreativeWorkOutput,
  releaseCreativeWorkOutputManualRetryAttempt,
  requeueFailedCreativeWorkOutput,
  markCreativeWorkOutputFailureCode,
} from "@/server/repositories/creative-work";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
import { recordUsage } from "@/server/billing/credits";
import { inngest } from "@/server/jobs/client";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { retryCreativeWorkOutput } from "./retry-creative-work-output";

const mockGet = vi.mocked(getCreativeWork);
const mockClaimManualRetry = vi.mocked(claimCreativeWorkOutputManualRetryAttempt);
const mockFailQueued = vi.mocked(failQueuedCreativeWorkOutput);
const mockReleaseManualRetry = vi.mocked(releaseCreativeWorkOutputManualRetryAttempt);
const mockRequeue = vi.mocked(requeueFailedCreativeWorkOutput);
const mockMarkFailure = vi.mocked(markCreativeWorkOutputFailureCode);
const mockGetUsage = vi.mocked(getUsageByIdempotencyKey);
const mockRecordUsage = vi.mocked(recordUsage);
const mockSend = vi.mocked(inngest.send);
const mockSettleTerminalRefund = vi.mocked(settleTerminalRefund);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  generationCorrelationId: "generation-1",
  brief: { theme: "Tema", objective: "O", audience: "A", offer: "Of" },
};

const failedOutput = {
  id: "output-1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  generationCorrelationId: "generation-1",
  creativeLevel: "balanced",
  status: "failed",
  outputKey: null,
  failureCode: "provider_failed",
  parentOutputId: null,
  revisionInstruction: null,
  isSelected: false,
  imageCallCount: 1,
  retryCount: 0,
};

describe("retryCreativeWorkOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined as never);
    mockRequeue.mockResolvedValue({
      ...failedOutput,
      status: "queued",
      failureCode: null,
      retryCount: 1,
    } as never);
    mockClaimManualRetry.mockResolvedValue({ ...failedOutput, manualRetryAttempt: 1 } as never);
    mockFailQueued.mockResolvedValue({ ...failedOutput, status: "failed" } as never);
    mockReleaseManualRetry.mockResolvedValue({ ...failedOutput, manualRetryAttempt: null } as never);
    mockMarkFailure.mockResolvedValue({ ...failedOutput, status: "failed" } as never);
    // Default: no refund ledger rows, so no reactivation debit is needed.
    mockGetUsage.mockResolvedValue(null as never);
    mockRecordUsage.mockResolvedValue({ status: "recorded" } as never);
    mockSettleTerminalRefund.mockResolvedValue({
      refunded: true,
      applied: true,
      reason: "test",
      status: "refunded",
    });
  });

  it("requeues failed output and dispatches creative-work.generate", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output.status).toBe("queued");
    expect(mockRequeue).toHaveBeenCalledWith("ws-1", "work-1", "output-1", 0, 1);
    expect(mockSend).toHaveBeenCalledWith([
      {
        id: "creative-work-generate:output-1:retry-1",
        name: "creative-work.generate",
        data: {
          workspaceId: "ws-1",
          workItemId: "work-1",
          outputId: "output-1",
          generationCorrelationId: "generation-1",
        },
      },
    ]);
    // No refund on the ledger -> the retry must not add any charge.
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  it("retries only the failed directional output and preserves its frozen snapshot", async () => {
    const directionalOutput = {
      ...failedOutput,
      directionId: "00000000-0000-4000-8000-000000000001",
      directionSnapshot: {
        label: "Oferta em primeiro plano",
        instruction: "Destaque a oferta com hierarquia imediata.",
        order: 0,
      },
    };
    const completedSibling = { ...failedOutput, id: "output-completed", status: "completed", outputKey: "stored/image.png" };
    mockGet.mockResolvedValue({ work: workItem, outputs: [completedSibling, directionalOutput] } as never);
    mockRequeue.mockResolvedValue({ ...directionalOutput, status: "queued", failureCode: null, retryCount: 1 } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: directionalOutput.id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { output: { id: directionalOutput.id, directionId: directionalOutput.directionId, directionSnapshot: directionalOutput.directionSnapshot } },
    });
    expect(mockRequeue).toHaveBeenCalledWith("ws-1", "work-1", directionalOutput.id, 0, 1);
    expect(mockRequeue).not.toHaveBeenCalledWith("ws-1", "work-1", completedSibling.id);
  });

  it("rejects missing work without requeue or dispatch", async () => {
    mockGet.mockResolvedValue(null);
    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "missing",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects missing output", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("output_not_found");
    expect(mockRequeue).not.toHaveBeenCalled();
  });

  it("rejects non-failed status", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, status: "queued" }],
    } as never);
    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_retriable");
      if (result.error.code === "output_not_retriable") {
        expect(result.error.status).toBe("queued");
      }
    }
    expect(mockRequeue).not.toHaveBeenCalled();
  });

  it("rejects revisions so a refunded or credit-blocked version cannot use the free retry path", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...failedOutput,
        parentOutputId: "output-v1",
        revisionInstruction: "Use mais contraste",
        failureCode: "credit_blocked",
      }],
    } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "output_not_retriable", status: "revision_requires_paid_command" },
    });
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects when the durable image call budget is exhausted (never a third provider call)", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, imageCallCount: 2 }],
    } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "output_not_retriable", status: "image_call_budget_exhausted" },
    });
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  it("rejects an exact pending terminal-refund marker without reserve, charge or dispatch", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...failedOutput,
        failureCode: "generation_failed_terminal_refund_pending",
        imageCallCount: 1,
      }],
    } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "output_not_retriable", status: "terminal_refund_pending" },
    });
    expect(mockClaimManualRetry).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("retries after the marker settles to generation_failed", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...failedOutput,
        failureCode: "generation_failed",
        imageCallCount: 1,
      }],
    } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    expect(mockClaimManualRetry).toHaveBeenCalled();
    expect(mockRequeue).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
  });

  it("reactivates a refunded charge idempotently BEFORE the requeue, keeping one net debit", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);
    // A terminal refund exists on the ledger; its reactivation row does not.
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (key === "creative-work:work-1:output:output-1:terminal-refund") {
        return { id: "usage-refund-1", idempotencyKey: key } as never;
      }
      return null as never;
    });

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        amount: 50,
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-terminal:1",
        metadata: expect.objectContaining({
          description: "creative_work_retry_reactivation",
          reactivates: "creative-work:work-1:output:output-1:terminal-refund",
        }),
        userId: "user-1",
      })
    );
    // Reactivation happens before the requeue/enqueue.
    const reactivationOrder = mockRecordUsage.mock.invocationCallOrder[0];
    const requeueOrder = mockRequeue.mock.invocationCallOrder[0];
    const sendOrder = mockSend.mock.invocationCallOrder[0];
    expect(reactivationOrder).toBeLessThan(requeueOrder);
    expect(reactivationOrder).toBeLessThan(sendOrder);
  });

  it("does not re-debit a duplicate manual attempt two click", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, retryCount: 1 }],
    } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (
        key === "creative-work:work-1:output:output-1:reactivate-terminal:1-refund" ||
        key === "creative-work:work-1:output:output-1:reactivate-terminal:2"
      ) {
        return { id: "usage-row", idempotencyKey: key } as never;
      }
      return null as never;
    });

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockRequeue).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("recovers a durable but response-ambiguous manual debit by enqueueing its same attempt", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, manualRetryAttempt: 2 }],
    } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-terminal:2"
        ? { id: "already-charged", idempotencyKey: key }
        : null
    ));

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toMatchObject({ ok: true });
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockRequeue).toHaveBeenCalledWith("ws-1", "work-1", "output-1", 0, 2);
  });

  it("serializes overlapping double clicks on manual attempt two", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockGet.mockResolvedValue({ work: workItem, outputs: [{ ...failedOutput, manualRetryAttempt: 2 }] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-terminal:2-refund"
        ? { id: "refund-2" }
        : null
    ));
    mockClaimManualRetry
      .mockImplementationOnce(async () => { await gate; return { ...failedOutput, manualRetryAttempt: 3 } as never; })
      .mockResolvedValueOnce(null as never);
    const first = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    await Promise.resolve();
    const second = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    release();
    const [winner, loser] = await Promise.all([first, second]);
    expect(winner).toMatchObject({ ok: true });
    expect(loser).toEqual({ ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } });
    expect(mockRecordUsage).toHaveBeenCalledOnce();
    expect(mockRequeue).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("marks a dispatched retry terminal and compensates its same manual debit when dispatch throws", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, manualRetryAttempt: 1 }],
    } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-terminal:1"
        ? { id: "charged", idempotencyKey: key }
        : null
    ));
    mockSend.mockRejectedValueOnce(new Error("inngest unavailable"));

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toEqual({ ok: false, error: { code: "output_not_retriable", status: "dispatch_failed" } });
    expect(mockFailQueued).toHaveBeenCalledWith("ws-1", "work-1", "output-1", "manual_retry_dispatch_failed");
  });

  it("charges the next manual retry from the preceding terminal reactivation refund", async () => {
    mockGet
      .mockResolvedValueOnce({
        work: workItem,
        outputs: [failedOutput],
      } as never)
      .mockResolvedValueOnce({
        work: workItem,
        outputs: [{ ...failedOutput, retryCount: 1, manualRetryAttempt: 1 }],
      } as never);
    mockRequeue
      .mockResolvedValueOnce({ ...failedOutput, status: "queued", failureCode: null, retryCount: 1 } as never)
      .mockResolvedValueOnce({ ...failedOutput, status: "queued", failureCode: null, retryCount: 2 } as never);
    mockClaimManualRetry
      .mockResolvedValueOnce({ ...failedOutput, manualRetryAttempt: 1 } as never)
      .mockResolvedValueOnce({ ...failedOutput, retryCount: 1, manualRetryAttempt: 2 } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (key === "creative-work:work-1:output:output-1:terminal-refund") {
        return { id: "terminal-refund", idempotencyKey: key } as never;
      }
      if (key === "creative-work:work-1:output:output-1:reactivate-terminal:1-refund") {
        return { id: "terminal-refund-1", idempotencyKey: key } as never;
      }
      return null as never;
    });

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toMatchObject({ ok: true });
    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toMatchObject({ ok: true });

    expect(mockRecordUsage.mock.calls.map(([input]) => (
      (input as { idempotencyKey: string; metadata: { reactivates: string } })
    ))).toEqual([
      expect.objectContaining({
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-terminal:1",
        metadata: expect.objectContaining({ reactivates: "creative-work:work-1:output:output-1:terminal-refund" }),
      }),
      expect.objectContaining({
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-terminal:2",
        metadata: expect.objectContaining({ reactivates: "creative-work:work-1:output:output-1:reactivate-terminal:1-refund" }),
      }),
    ]);
  });

  it("maps a blocked reactivation (insufficient credits) to credit_blocked without requeue or dispatch", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (key === "creative-work:work-1:output:output-1:pregen-refund") {
        return { id: "usage-refund-1", idempotencyKey: key } as never;
      }
      return null as never;
    });
    mockRecordUsage.mockResolvedValue({ status: "blocked" } as never);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result).toEqual({ ok: false, error: { code: "credit_blocked" } });
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockReleaseManualRetry).toHaveBeenCalledWith("ws-1", "work-1", "output-1", 0, 1);
  });

  it("releases a blocked reservation so a funded retry reserves, charges, requeues, and dispatches the same ordinal once", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [failedOutput] } as never);
    mockClaimManualRetry
      .mockResolvedValueOnce({ ...failedOutput, manualRetryAttempt: 1 } as never)
      .mockResolvedValueOnce({ ...failedOutput, manualRetryAttempt: 1 } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:terminal-refund"
        ? { id: "original-refund", idempotencyKey: key } as never
        : null as never
    ));
    mockRecordUsage
      .mockResolvedValueOnce({ status: "blocked" } as never)
      .mockResolvedValueOnce({ status: "recorded" } as never);

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toEqual({ ok: false, error: { code: "credit_blocked" } });
    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toMatchObject({ ok: true });

    expect(mockClaimManualRetry).toHaveBeenNthCalledWith(1, "ws-1", "work-1", "output-1", 0, null, 1);
    expect(mockReleaseManualRetry).toHaveBeenCalledWith("ws-1", "work-1", "output-1", 0, 1);
    expect(mockClaimManualRetry).toHaveBeenNthCalledWith(2, "ws-1", "work-1", "output-1", 0, null, 1);
    expect(mockRecordUsage).toHaveBeenCalledTimes(2);
    expect(mockRequeue).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("does not release a reservation when a charge response throws ambiguously", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [failedOutput] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:terminal-refund"
        ? { id: "original-refund", idempotencyKey: key } as never
        : null as never
    ));
    mockRecordUsage.mockRejectedValueOnce(new Error("charge response lost"));

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .rejects.toThrow("charge response lost");
    expect(mockReleaseManualRetry).not.toHaveBeenCalled();
    expect(mockRequeue).not.toHaveBeenCalled();
  });

  it("reissues the same debit for a persisted uncharged reservation after a pre-commit response failure", async () => {
    const reserved = { ...failedOutput, manualRetryAttempt: 1 };
    mockGet
      .mockResolvedValueOnce({ work: workItem, outputs: [failedOutput] } as never)
      .mockResolvedValueOnce({ work: workItem, outputs: [reserved] } as never);
    mockClaimManualRetry.mockResolvedValueOnce(reserved as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:terminal-refund"
        ? { id: "original-refund", idempotencyKey: key } as never
        : null as never
    ));
    mockRecordUsage
      .mockRejectedValueOnce(new Error("response lost before commit"))
      .mockResolvedValueOnce({ status: "recorded" } as never);

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .rejects.toThrow("response lost before commit");
    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toMatchObject({ ok: true });

    const keys = mockRecordUsage.mock.calls.map(([record]) => (
      (record as { idempotencyKey: string }).idempotencyKey
    ));
    expect(keys).toEqual([
      "creative-work:work-1:output:output-1:reactivate-terminal:1",
      "creative-work:work-1:output:output-1:reactivate-terminal:1",
    ]);
    expect(mockClaimManualRetry).toHaveBeenCalledOnce();
    expect(mockRequeue).toHaveBeenCalledWith("ws-1", "work-1", "output-1", 0, 1);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("lets overlapping uncharged-reservation recovery dispatch once without refunding the active winner", async () => {
    let releaseFirstDebit!: () => void;
    const firstDebit = new Promise<void>((resolve) => { releaseFirstDebit = resolve; });
    const reserved = { ...failedOutput, manualRetryAttempt: 1 };
    mockGet
      .mockResolvedValueOnce({ work: workItem, outputs: [reserved] } as never)
      .mockResolvedValueOnce({ work: workItem, outputs: [reserved] } as never)
      .mockResolvedValueOnce({ work: workItem, outputs: [{ ...reserved, status: "processing" }] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:terminal-refund"
        ? { id: "original-refund", idempotencyKey: key } as never
        : null as never
    ));
    mockRecordUsage
      .mockImplementationOnce(async () => { await firstDebit; return { status: "recorded" } as never; })
      .mockResolvedValueOnce({ status: "recorded" } as never);
    mockRequeue
      .mockResolvedValueOnce({ ...reserved, status: "queued", failureCode: null, retryCount: 1 } as never)
      .mockResolvedValueOnce(null);

    const first = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    await Promise.resolve();
    const second = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    await Promise.resolve();
    releaseFirstDebit();
    const results = await Promise.all([first, second]);

    expect(results).toContainEqual(expect.objectContaining({ ok: true }));
    expect(results).toContainEqual({ ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } });
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSettleTerminalRefund).not.toHaveBeenCalled();
  });

  it("joins a same-key debit after a blocked concurrent recovery instead of releasing it", async () => {
    let releaseWinnerCharge!: () => void;
    let releaseBlockedLoser!: () => void;
    const winnerCharge = new Promise<void>((resolve) => { releaseWinnerCharge = resolve; });
    const blockedLoser = new Promise<void>((resolve) => { releaseBlockedLoser = resolve; });
    let chargeRecorded = false;
    const reserved = { ...failedOutput, manualRetryAttempt: 1 };
    mockGet
      .mockResolvedValueOnce({ work: workItem, outputs: [reserved] } as never)
      .mockResolvedValueOnce({ work: workItem, outputs: [reserved] } as never)
      .mockResolvedValueOnce({ work: workItem, outputs: [{ ...reserved, status: "processing" }] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (key === "creative-work:work-1:output:output-1:terminal-refund") {
        return { id: "original-refund", idempotencyKey: key } as never;
      }
      if (key === "creative-work:work-1:output:output-1:reactivate-terminal:1") {
        return chargeRecorded ? { id: "same-key-debit", idempotencyKey: key } as never : null as never;
      }
      return null as never;
    });
    mockRecordUsage
      .mockImplementationOnce(async () => { await winnerCharge; chargeRecorded = true; return { status: "recorded" } as never; })
      .mockImplementationOnce(async () => { await blockedLoser; return { status: "blocked" } as never; });
    mockRequeue
      .mockResolvedValueOnce({ ...reserved, status: "queued", failureCode: null, retryCount: 1 } as never)
      .mockResolvedValueOnce(null);

    const winner = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    await Promise.resolve();
    const loser = retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    await Promise.resolve();
    releaseWinnerCharge();
    await Promise.resolve();
    releaseBlockedLoser();

    const results = await Promise.all([winner, loser]);
    expect(results).toContainEqual(expect.objectContaining({ ok: true }));
    expect(results).toContainEqual({ ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } });
    expect(mockReleaseManualRetry).not.toHaveBeenCalled();
    expect(mockSettleTerminalRefund).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("maps concurrent requeue loss to not_retriable", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);
    mockRequeue.mockResolvedValue(null);

    const result = await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_retriable");
      if (result.error.code === "output_not_retriable") {
        expect(result.error.status).toBe("concurrent_change");
      }
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("compensates a joined legacy pregen debit with its paired key when the requeue CAS loses", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [failedOutput] } as never);
    mockRequeue.mockResolvedValue(null);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-pregen"
        ? { id: "legacy-pregen-debit", idempotencyKey: key } as never
        : null as never
    ));

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toEqual({ ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } });

    expect(mockSettleTerminalRefund).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-pregen-refund",
      }),
    }));
  });

  it("compensates a joined legacy dispatch debit with its paired key after terminal dispatch failure", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [failedOutput] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-dispatch"
        ? { id: "legacy-dispatch-debit", idempotencyKey: key } as never
        : null as never
    ));
    mockSend.mockRejectedValueOnce(new Error("inngest unavailable"));

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toEqual({ ok: false, error: { code: "output_not_retriable", status: "dispatch_failed" } });

    expect(mockFailQueued).toHaveBeenCalledWith("ws-1", "work-1", "output-1", "manual_retry_dispatch_failed");
    expect(mockSettleTerminalRefund).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-dispatch-refund",
      }),
    }));
  });

  it("does not refund a joined legacy debit when dispatch terminalization loses to active processing", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [failedOutput] } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => (
      key === "creative-work:work-1:output:output-1:reactivate-terminal"
        ? { id: "legacy-terminal-debit", idempotencyKey: key } as never
        : null as never
    ));
    mockSend.mockRejectedValueOnce(new Error("inngest unavailable"));
    mockFailQueued.mockResolvedValue(null);

    await expect(retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }))
      .resolves.toEqual({ ok: false, error: { code: "output_not_retriable", status: "dispatch_failed" } });

    expect(mockSettleTerminalRefund).not.toHaveBeenCalled();
  });
});
