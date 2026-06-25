import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAssistantTurn } from "./orchestrator";
import type { AssistantModelClient, AssistantStreamEvent } from "./model/client";

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  createAssistantMessage: vi.fn(),
}));

vi.mock("@/server/assistant/context/context-builder", () => ({
  buildAssistantContext: vi.fn(),
  toAssistantModelRequest: vi.fn(() => ({
    systemPrompt: "system",
    messages: [{ role: "user", content: "Hi" }],
    tools: [],
  })),
}));

vi.mock("@/server/assistant/tools/policy", () => ({
  evaluateToolCall: vi.fn(),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { createAssistantMessage } from "@/server/repositories/assistant-message";
import { buildAssistantContext } from "@/server/assistant/context/context-builder";
import { evaluateToolCall } from "@/server/assistant/tools/policy";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockCreateMessage = vi.mocked(createAssistantMessage);
const mockBuildContext = vi.mocked(buildAssistantContext);
const mockEvaluateTool = vi.mocked(evaluateToolCall);

function mockModelClient(events: AssistantStreamEvent[]): AssistantModelClient {
  return {
    async *stream() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  userId: "user-1",
  userMessage: "Hello",
};

describe("runAssistantTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockBuildContext.mockResolvedValue({
      thread: { name: "Main" },
      recentMessages: [],
    } as Awaited<ReturnType<typeof buildAssistantContext>>);
    mockCreateMessage.mockImplementation(async (_ws, input) => {
      if (input.type === "user") return { id: "user-msg" };
      if (input.type === "assistant") return { id: "assistant-msg" };
      return { id: "tool-msg" };
    });
  });

  it("persists user message then assistant message after stream", async () => {
    const events: AssistantStreamEvent[] = [
      { type: "text_delta", text: "Hi " },
      { type: "text_delta", text: "there" },
      { type: "done" },
    ];

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      turnEvents.push(event);
    }

    expect(mockCreateMessage).toHaveBeenCalledTimes(2);
    expect(mockCreateMessage).toHaveBeenNthCalledWith(1, "ws-1", {
      threadId: "thread-1",
      type: "user",
      content: "Hello",
    });
    expect(mockCreateMessage).toHaveBeenNthCalledWith(2, "ws-1", {
      threadId: "thread-1",
      type: "assistant",
      content: "Hi there",
    });
    expect(turnEvents.at(-1)).toEqual({
      type: "done",
      assistantMessageId: "assistant-msg",
    });
  });

  it("handles approved tool calls", async () => {
    mockEvaluateTool.mockResolvedValue({
      allowed: true,
      requiresConfirmation: true,
      sanitizedSummary: "Action proposed",
      actionRecordId: "action-1",
    });

    const events: AssistantStreamEvent[] = [
      { type: "text_delta", text: "Ok" },
      {
        type: "tool_call",
        id: "c1",
        name: "propose_action",
        argumentsJson: '{"actionType":"restyle","label":"Restyle"}',
      },
      { type: "done" },
    ];

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      turnEvents.push(event);
    }

    expect(turnEvents).toContainEqual({
      type: "tool_summary",
      toolName: "propose_action",
      summary: "Action proposed",
    });
    expect(turnEvents).toContainEqual({
      type: "action_card",
      actionRecordId: "action-1",
      status: "pending",
    });
  });

  it("yields error when tool policy denies", async () => {
    mockEvaluateTool.mockResolvedValue({
      allowed: false,
      requiresConfirmation: false,
      sanitizedSummary: "",
      denialReason: "unknown_tool",
    });

    const events: AssistantStreamEvent[] = [
      {
        type: "tool_call",
        id: "c1",
        name: "foo",
        argumentsJson: "{}",
      },
      { type: "done" },
    ];

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      turnEvents.push(event);
    }

    expect(turnEvents.some((e) => e.type === "error")).toBe(true);
  });
});
