import { describe, it, expect, vi, beforeEach } from "vitest";
import { resumeGuidedFlowAfterActionFailure } from "./action-integration";

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
  patchGuidedFlow: vi.fn(),
}));

import { getGuidedFlowByThread, patchGuidedFlow } from "@/server/repositories/guided-flow";

const mockGet = vi.mocked(getGuidedFlowByThread);
const mockPatch = vi.mocked(patchGuidedFlow);

describe("resumeGuidedFlowAfterActionFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches guided flow as blocked with safe error", async () => {
    mockGet.mockResolvedValue({
      path: "existing_creative",
      currentStep: "confirm_improvement",
      status: "active",
      slots: {},
    } as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockPatch.mockResolvedValue({} as Awaited<ReturnType<typeof patchGuidedFlow>>);

    await resumeGuidedFlowAfterActionFailure({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
      safeError: "Créditos insuficientes",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "ws-1",
      "t-1",
      "cp-1",
      expect.objectContaining({
        status: "blocked",
        slots: expect.objectContaining({
          lastActionError: "Créditos insuficientes",
        }),
      })
    );
  });

  it("no-ops for unclassified flow", async () => {
    mockGet.mockResolvedValue({
      path: "unclassified",
    } as Awaited<ReturnType<typeof getGuidedFlowByThread>>);

    const result = await resumeGuidedFlowAfterActionFailure({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
      safeError: "err",
    });

    expect(result).toBeNull();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
