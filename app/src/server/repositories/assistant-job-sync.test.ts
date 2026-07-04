import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./assistant-action", () => ({
  transitionAssistantAction: vi.fn(),
  sanitizeSafeError: vi.fn((value: string | null | undefined) => value ?? null),
  getAssistantActionById: vi.fn().mockResolvedValue(null),
}));

const rowsMock = vi.fn();
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: rowsMock,
      }),
    }),
  },
}));

vi.mock("./assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/guided-paths/action-integration", () => ({
  transitionGuidedFlowAfterAction: vi.fn(),
}));

import { getAssistantActionById, transitionAssistantAction } from "./assistant-action";
import { syncAssistantActionFromJob } from "./assistant-job-sync";

const mockTransition = vi.mocked(transitionAssistantAction);
const mockGetAction = vi.mocked(getAssistantActionById);

describe("assistant-job-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAction.mockResolvedValue({
      id: "action-1",
      threadId: "thread-1",
      jobRefs: [{ kind: "derivation", id: "deriv-1" }],
    } as Awaited<ReturnType<typeof getAssistantActionById>>);
    mockTransition.mockResolvedValue({ id: "action-1", status: "running" } as Awaited<
      ReturnType<typeof transitionAssistantAction>
    >);
  });

  it("keeps a multi-job action running when one child completes before its siblings", async () => {
    mockGetAction
      .mockResolvedValueOnce({
        id: "action-1",
        threadId: "thread-1",
        jobRefs: [
          { kind: "derivation", id: "deriv-1" },
          { kind: "derivation", id: "deriv-2" },
        ],
      } as Awaited<ReturnType<typeof getAssistantActionById>>)
      .mockResolvedValueOnce({ id: "action-1", status: "running" } as Awaited<
        ReturnType<typeof getAssistantActionById>
      >);
    rowsMock.mockResolvedValue([
      { id: "deriv-1", status: "completed" },
      { id: "deriv-2", status: "queued" },
    ]);

    await syncAssistantActionFromJob({
      workspaceId: "ws-1",
      actionId: "action-1",
      status: "completed",
      jobRef: { kind: "derivation", id: "deriv-1" },
    });

    expect(mockTransition).toHaveBeenCalledTimes(1);
    expect(mockTransition).toHaveBeenCalledWith(
      "ws-1",
      "action-1",
      "running",
      expect.objectContaining({
        jobRef: { kind: "derivation", id: "deriv-1" },
      })
    );
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
