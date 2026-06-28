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

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/assistant/guided-conversation/service", () => ({
  applyGuidedConversationCommand: vi.fn(),
}));

vi.mock("@/server/assistant/plan-iteration/service", () => ({
  handlePlanRevisionMessage: vi.fn(),
}));

vi.mock("@/server/assistant/creative-iteration/intent", () => ({
  classifyCreativeRevisionIntent: vi.fn(),
}));

vi.mock("@/server/assistant/creative-iteration/service", () => ({
  handleCreativeRevisionMessage: vi.fn(),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { createAssistantMessage } from "@/server/repositories/assistant-message";
import {
  buildAssistantContext,
  toAssistantModelRequest,
} from "@/server/assistant/context/context-builder";
import { evaluateToolCall } from "@/server/assistant/tools/policy";
import { handlePlanRevisionMessage } from "@/server/assistant/plan-iteration/service";
import { classifyCreativeRevisionIntent } from "@/server/assistant/creative-iteration/intent";
import { handleCreativeRevisionMessage } from "@/server/assistant/creative-iteration/service";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockCreateMessage = vi.mocked(createAssistantMessage);
const mockBuildContext = vi.mocked(buildAssistantContext);
const mockToAssistantModelRequest = vi.mocked(toAssistantModelRequest);
const mockEvaluateTool = vi.mocked(evaluateToolCall);
const mockHandlePlanRevision = vi.mocked(handlePlanRevisionMessage);
const mockClassifyCreativeIntent = vi.mocked(classifyCreativeRevisionIntent);
const mockHandleCreativeRevision = vi.mocked(handleCreativeRevisionMessage);

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
    mockHandlePlanRevision.mockResolvedValue({ kind: "continue" });
    mockHandleCreativeRevision.mockResolvedValue({ kind: "continue" });
    mockClassifyCreativeIntent.mockReturnValue({ kind: "continue" });
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

  it("routes campaign-thread feedback through plan revision before generic LLM", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "plan" });
    mockHandlePlanRevision.mockResolvedValue({
      kind: "action_card",
      content: "Altera CTAs",
      actionRecordId: "action-plan-1",
    });

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
      userMessage: "Ajuste o CTA do plano",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(mockHandlePlanRevision).toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(turnEvents).toContainEqual({
      type: "action_card",
      actionRecordId: "action-plan-1",
      status: "pending",
    });
  });

  it("skips plan revision branch for non-campaign threads", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const events: AssistantStreamEvent[] = [{ type: "done" }];
    for await (const _event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      // drain
    }

    expect(mockHandlePlanRevision).not.toHaveBeenCalled();
  });

  it("routes campaign-thread creative feedback to creative handler with action_card", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "creative" });
    mockHandleCreativeRevision.mockResolvedValue({
      kind: "action_card",
      content: "Muda cor de fundo",
      actionRecordId: "action-creative-1",
    });

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
      userMessage: "muda a cor de fundo para azul",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(mockHandleCreativeRevision).toHaveBeenCalled();
    expect(mockHandlePlanRevision).not.toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(turnEvents).toContainEqual({
      type: "action_card",
      actionRecordId: "action-creative-1",
      status: "pending",
    });
    expect(turnEvents).toContainEqual({
      type: "done",
      assistantMessageId: "assistant-msg",
    });
  });

  it("routes campaign-thread plan feedback to plan handler (existing behavior)", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "plan" });
    mockHandlePlanRevision.mockResolvedValue({
      kind: "action_card",
      content: "Altera CTAs",
      actionRecordId: "action-plan-1",
    });

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
      userMessage: "ajusta o CTA do plano",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(mockClassifyCreativeIntent).toHaveBeenCalled();
    expect(mockHandlePlanRevision).toHaveBeenCalled();
    expect(mockHandleCreativeRevision).not.toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(turnEvents).toContainEqual({
      type: "action_card",
      actionRecordId: "action-plan-1",
      status: "pending",
    });
  });

  it("yields clarifying question for ambiguous creative/plan intent", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "ambiguous" });

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
      userMessage: "melhora isso",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(mockHandlePlanRevision).not.toHaveBeenCalled();
    expect(mockHandleCreativeRevision).not.toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(mockCreateMessage).toHaveBeenCalledWith("ws-1", {
      threadId: "thread-1",
      type: "assistant",
      content: "Você quer revisar o plano ou o criativo?",
    });
    expect(turnEvents).toEqual([
      { type: "done", assistantMessageId: "assistant-msg" },
    ]);
  });

  it("falls through to generic LLM when intent is continue", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "continue" });

    const streamSpy = vi.fn();
    const client: AssistantModelClient = {
      async *stream() {
        streamSpy();
        yield { type: "done" };
      },
    };

    for await (const _event of runAssistantTurn({
      ...baseInput,
      userMessage: "obrigado",
      modelClient: client,
    })) {
      // drain
    }

    expect(mockHandlePlanRevision).not.toHaveBeenCalled();
    expect(mockHandleCreativeRevision).not.toHaveBeenCalled();
    expect(streamSpy).toHaveBeenCalled();
  });

  it("yields creative assistant message when creative handler returns assistant kind", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "creative" });
    mockHandleCreativeRevision.mockResolvedValue({
      kind: "assistant",
      content: "Qual criativo você quer revisar?",
    });

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
      userMessage: "muda isso",
      modelClient: throwingClient,
    })) {
      turnEvents.push(event);
    }

    expect(mockCreateMessage).toHaveBeenCalledWith("ws-1", {
      threadId: "thread-1",
      type: "assistant",
      content: "Qual criativo você quer revisar?",
    });
    expect(streamSpy).not.toHaveBeenCalled();
    expect(turnEvents).toEqual([
      { type: "done", assistantMessageId: "assistant-msg" },
    ]);
  });

  it("passes attachment IDs to creative handler when intent is creative", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: "campaign-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "creative" });
    mockHandleCreativeRevision.mockResolvedValue({
      kind: "assistant",
      content: "ok",
    });

    const throwingClient: AssistantModelClient = {
      async *stream() {
        throw new Error("should not be called");
      },
    };

    for await (const _event of runAssistantTurn({
      ...baseInput,
      userMessage: "também quero ajustar isso",
      attachments: [
        { assetId: "att-1", key: "k1", type: "image/png", name: "img1.png", size: 100 },
        { assetId: "att-2", key: "k2", type: "image/png", name: "img2.png", size: 200 },
      ],
      modelClient: throwingClient,
    })) {
      // drain
    }

    expect(mockHandleCreativeRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentReferenceIds: ["att-1", "att-2"],
      })
    );
  });

  it("does not invoke creative handler for non-campaign threads", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockClassifyCreativeIntent.mockReturnValue({ kind: "creative" });

    const events: AssistantStreamEvent[] = [{ type: "done" }];
    for await (const _event of runAssistantTurn({
      ...baseInput,
      modelClient: mockModelClient(events),
    })) {
      // drain
    }

    expect(mockClassifyCreativeIntent).not.toHaveBeenCalled();
    expect(mockHandleCreativeRevision).not.toHaveBeenCalled();
    expect(mockHandlePlanRevision).not.toHaveBeenCalled();
  });
});
