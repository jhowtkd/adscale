import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./assistant-action", () => ({
  transitionAssistantAction: vi.fn(),
  sanitizeSafeError: vi.fn((value: string | null | undefined) => value ?? null),
}));

import { transitionAssistantAction } from "./assistant-action";
import { syncAssistantActionFromJob } from "./assistant-job-sync";

const mockTransition = vi.mocked(transitionAssistantAction);

describe("assistant-job-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransition.mockResolvedValue({ id: "action-1", status: "running" } as Awaited<
      ReturnType<typeof transitionAssistantAction>
    >);
  });

  it("maps processing to running", async () => {
    await syncAssistantActionFromJob({
      workspaceId: "ws-1",
      actionId: "action-1",
      status: "processing",
      jobRef: { kind: "derivation", id: "deriv-1" },
    });

    expect(mockTransition).toHaveBeenCalledWith(
      "ws-1",
      "action-1",
      "running",
      expect.objectContaining({
        jobRef: { kind: "derivation", id: "deriv-1" },
      })
    );
  });

  it("maps failed with sanitized error", async () => {
    await syncAssistantActionFromJob({
      workspaceId: "ws-1",
      actionId: "action-1",
      status: "failed",
      safeError: "provider timeout",
    });

    expect(mockTransition).toHaveBeenCalledWith(
      "ws-1",
      "action-1",
      "failed",
      expect.objectContaining({ safeError: "provider timeout" })
    );
  });
});
