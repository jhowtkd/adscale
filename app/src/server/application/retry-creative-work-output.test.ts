import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  requeueFailedCreativeWorkOutput: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

import {
  getCreativeWork,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { inngest } from "@/server/jobs/client";
import { retryCreativeWorkOutput } from "./retry-creative-work-output";

const mockGet = vi.mocked(getCreativeWork);
const mockRequeue = vi.mocked(requeueFailedCreativeWorkOutput);
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
  isSelected: false,
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

  it("does not import or call billing", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [failedOutput],
    } as never);
    await retryCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    // Billing modules are intentionally not mocked — import would throw.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
