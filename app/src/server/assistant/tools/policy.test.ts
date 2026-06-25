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

vi.mock("@/server/repositories/assistant-action", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/repositories/assistant-action")>();
  return {
    ...actual,
    createAssistantAction: vi.fn(() =>
      Promise.resolve({
        action: { id: "action-1" },
        message: { id: "msg-1" },
      })
    ),
  };
});

import { requireRole, WorkspaceAuthError } from "@/server/auth/workspace";
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

  it("denies propose_action with unregistered actionType", async () => {
    const result = await evaluateToolCall(ctx, {
      name: "propose_action",
      argumentsJson: JSON.stringify({
        actionType: "restyle",
        label: "Restyle creative",
      }),
    });
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("contract_validation_failed");
    expect(mockCreateAction).not.toHaveBeenCalled();
  });

  it("allows propose_action with valid quick_restyle and enriched display", async () => {
    const baseCreativeId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const result = await evaluateToolCall(ctx, {
      name: "propose_action",
      argumentsJson: JSON.stringify({
        actionType: "quick_restyle",
        label: "Restyle rápido",
        inputSnapshot: { baseCreativeId },
      }),
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actionRecordId).toBe("action-1");
    expect(mockCreateAction).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        display: expect.objectContaining({
          actionType: "quick_restyle",
          confirmationPolicy: "required",
          riskLabel: "medium",
        }),
      })
    );
  });

  it("denies propose_action when role is forbidden", async () => {
    mockRequireRole.mockRejectedValue(
      new WorkspaceAuthError("forbidden", "Forbidden")
    );

    const result = await evaluateToolCall(ctx, {
      name: "propose_action",
      argumentsJson: JSON.stringify({
        actionType: "quick_restyle",
        label: "Restyle rápido",
        inputSnapshot: {
          baseCreativeId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        },
      }),
    });
    expect(result.denialReason).toBe("forbidden");
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
