import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  CREATIVE_WORK_MAX_IMAGE_CALLS: 2,
  getCreativeWork: vi.fn(),
  requeueFailedCreativeWorkOutput: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/billing/credits", () => ({
  recordUsage: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

import {
  getCreativeWork,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
import { recordUsage } from "@/server/billing/credits";
import { inngest } from "@/server/jobs/client";
import { retryCreativeWorkOutput } from "./retry-creative-work-output";

const mockGet = vi.mocked(getCreativeWork);
const mockRequeue = vi.mocked(requeueFailedCreativeWorkOutput);
const mockGetUsage = vi.mocked(getUsageByIdempotencyKey);
const mockRecordUsage = vi.mocked(recordUsage);
const mockSend = vi.mocked(inngest.send);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  brief: { theme: "Tema", objective: "O", audience: "A", offer: "Of" },
};

const failedOutput = {
  id: "output-1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "failed",
  outputKey: null,
  failureCode: "provider_failed",
  parentOutputId: null,
  revisionInstruction: null,
  isSelected: false,
  imageCallCount: 1,
};

describe("retryCreativeWorkOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined as never);
    mockRequeue.mockResolvedValue({
      ...failedOutput,
      status: "queued",
      failureCode: null,
    } as never);
    // Default: no refund ledger rows, so no reactivation debit is needed.
    mockGetUsage.mockResolvedValue(null as never);
    mockRecordUsage.mockResolvedValue({ status: "recorded" } as never);
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
    expect(mockRequeue).toHaveBeenCalledWith("ws-1", "work-1", "output-1");
    expect(mockSend).toHaveBeenCalledWith([
      {
        name: "creative-work.generate",
        data: {
          workspaceId: "ws-1",
          workItemId: "work-1",
          outputId: "output-1",
        },
      },
    ]);
    // No refund on the ledger -> the retry must not add any charge.
    expect(mockRecordUsage).not.toHaveBeenCalled();
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
        idempotencyKey: "creative-work:work-1:output:output-1:reactivate-terminal",
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

  it("does not re-debit when the reactivation row already exists (repeat manual command)", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);
    mockGetUsage.mockImplementation(async (_workspaceId: string, key: string) => {
      if (
        key === "creative-work:work-1:output:output-1:terminal-refund" ||
        key === "creative-work:work-1:output:output-1:reactivate-terminal"
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
});
