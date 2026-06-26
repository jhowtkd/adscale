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
import {
  buildAssistantContext,
  toAssistantModelRequest,
} from "@/server/assistant/context/context-builder";
import { evaluateToolCall } from "@/server/assistant/tools/policy";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockCreateMessage = vi.mocked(createAssistantMessage);
const mockBuildContext = vi.mocked(buildAssistantContext);
const mockToAssistantModelRequest = vi.mocked(toAssistantModelRequest);
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

function capturingModelClient(
  events: AssistantStreamEvent[] = [{ type: "done" }]
) {
  let capturedRequest: Parameters<AssistantModelClient["stream"]>[0] | undefined;
  const client: AssistantModelClient = {
    async *stream(request) {
      capturedRequest = request;
      for (const event of events) {
        yield event;
      }
    },
  };
  return { client, getRequest: () => capturedRequest };
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
        argumentsJson:
          '{"actionType":"quick_restyle","label":"Restyle","baseCreativeId":"550e8400-e29b-41d4-a716-446655440000"}',
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

  it("short-circuits ambiguous intent with clarify message without streaming", async () => {
    const streamSpy = vi.fn();
    const throwingClient: AssistantModelClient = {
      async *stream() {
        streamSpy();
        throw new Error("model stream should not be called");
      },
    };

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      userMessage:
        "quero reestilizar e montar campanha completa para o lançamento",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(streamSpy).not.toHaveBeenCalled();
    expect(mockCreateMessage).toHaveBeenCalledWith("ws-1", {
      threadId: "thread-1",
      type: "assistant",
      content:
        "Você quer uma ação pontual ou montar uma campanha completa?",
    });
    expect(turnEvents).toEqual([
      { type: "done", assistantMessageId: "assistant-msg" },
    ]);
  });

  it("augments system prompt with quick_action when restyle keyword detected", async () => {
    const { client, getRequest } = capturingModelClient([
      { type: "text_delta", text: "Ok" },
      { type: "done" },
    ]);

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      userMessage: "quero reestilizar esse criativo",
      modelClient: client,
    })) {
      turnEvents.push(event);
    }

    expect(getRequest()?.systemPrompt).toContain("quick_action");
  });

  it("does not clarify on greeting and still streams model response", async () => {
    const streamSpy = vi.fn();
    const client: AssistantModelClient = {
      async *stream() {
        streamSpy();
        yield { type: "done" };
      },
    };

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      userMessage: "Olá",
      modelClient: client,
    })) {
      turnEvents.push(event);
    }

    expect(streamSpy).toHaveBeenCalled();
    expect(turnEvents.at(-1)).toEqual({
      type: "done",
      assistantMessageId: "assistant-msg",
    });
  });

  it("strips inline reasoning blocks before persisting the assistant message", async () => {
    const OPEN = "\u003Cthink\u003E";
    const CLOSE = "\u003C/think\u003E";
    const events: AssistantStreamEvent[] = [
      { type: "text_delta", text: `${OPEN}Contrary to the user's report, this is a bug.${CLOSE}` },
      { type: "text_delta", text: " Segue o plano: 5 variações." },
      { type: "done" },
    ];

    const persistedContents: string[] = [];
    mockCreateMessage.mockImplementation(async (_ws, input) => {
      if (input.type === "user") return { id: "user-msg" };
      if (input.type === "assistant") {
        persistedContents.push(input.content);
        return { id: "assistant-msg" };
      }
      return { id: "tool-msg" };
    });

    const turnEvents = [];
    for await (const event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      turnEvents.push(event);
    }

    expect(turnEvents.at(-1)).toEqual({
      type: "done",
      assistantMessageId: "assistant-msg",
    });
    expect(persistedContents).toHaveLength(1);
    const persisted = persistedContents[0];
    expect(persisted).not.toContain(OPEN);
    expect(persisted).not.toContain(CLOSE);
    expect(persisted).toBe("Segue o plano: 5 variações.");
  });

  it("strips a truncated unclosed reasoning block before persisting", async () => {
    const OPEN = "\u003Cthink\u003E";
    const events: AssistantStreamEvent[] = [
      { type: "text_delta", text: "Resposta visível" },
      { type: "text_delta", text: `${OPEN}drafting and never closes` },
      { type: "done" },
    ];

    const persistedContents: string[] = [];
    mockCreateMessage.mockImplementation(async (_ws, input) => {
      if (input.type === "user") return { id: "user-msg" };
      if (input.type === "assistant") {
        persistedContents.push(input.content);
        return { id: "assistant-msg" };
      }
      return { id: "tool-msg" };
    });

    for await (const _event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      // drain
    }

    expect(persistedContents).toHaveLength(1);
    expect(persistedContents[0]).toBe("Resposta visível");
    expect(persistedContents[0]).not.toContain(OPEN);
  });
});
