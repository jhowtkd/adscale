import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateToolCall } from "./policy";

vi.mock("@/server/auth/workspace", () => ({
  requireRole: vi.fn(),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "WorkspaceAuthError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/context/context-builder", () => ({
  buildAssistantContext: vi.fn(() =>
    Promise.resolve({
      thread: { name: "Main" },
      recentMessages: [],
    })
  ),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  createAssistantAction: vi.fn(() =>
    Promise.resolve({
      action: { id: "action-1" },
      message: { id: "msg-1" },
    })
  ),
}));

import { requireRole } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { createAssistantAction } from "@/server/repositories/assistant-action";

const mockRequireRole = vi.mocked(requireRole);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockCreateAction = vi.mocked(createAssistantAction);

const ctx = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  userId: "user-1",
};

describe("evaluateToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ role: "member" });
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("denies unknown tools", async () => {
    const result = await evaluateToolCall(ctx, {
      name: "foo",
      argumentsJson: "{}",
    });
    expect(result).toEqual({
      allowed: false,
      requiresConfirmation: false,
      sanitizedSummary: "",
      denialReason: "unknown_tool",
    });
  });

  it("denies invalid JSON arguments", async () => {
    const result = await evaluateToolCall(ctx, {
      name: "get_thread_context",
      argumentsJson: "{bad",
    });
    expect(result.denialReason).toBe("invalid_arguments");
  });

  it("allows get_thread_context for member role", async () => {
    const result = await evaluateToolCall(ctx, {
      name: "get_thread_context",
      argumentsJson: "{}",
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.sanitizedSummary).toContain("thread");
  });

  it("denies scope mismatch", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "other",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const result = await evaluateToolCall(ctx, {
      name: "get_thread_context",
      argumentsJson: "{}",
    });
    expect(result.denialReason).toBe("scope_mismatch");
  });

  it("allows propose_action with requiresConfirmation", async () => {
    const result = await evaluateToolCall(ctx, {
      name: "propose_action",
      argumentsJson: JSON.stringify({
        actionType: "restyle",
        label: "Restyle creative",
      }),
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actionRecordId).toBe("action-1");
    expect(mockCreateAction).toHaveBeenCalled();
  });

  it("denies summaries containing denied substrings", async () => {
    const { buildAssistantContext } = await import(
      "@/server/assistant/context/context-builder"
    );
    vi.mocked(buildAssistantContext).mockResolvedValueOnce({
      thread: { name: "leak rawArgs here" },
      recentMessages: [],
    } as never);

    const result = await evaluateToolCall(ctx, {
      name: "get_thread_context",
      argumentsJson: "{}",
    });
    expect(result.denialReason).toBe("sanitization_failed");
  });
});
