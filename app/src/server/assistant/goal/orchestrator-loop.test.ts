import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AssistantModelClient,
  AssistantModelRequest,
  AssistantStreamEvent,
} from "@/server/assistant/model/client";

vi.mock("@/server/repositories/assistant-message", () => ({
  createAssistantMessage: vi.fn(async (_ws: string, input: { content: string }) => ({
    id: `msg-${input.content.slice(0, 6)}`,
    content: input.content,
  })),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(async () => ({
    id: "thread-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
  })),
}));

vi.mock("@/server/assistant/context/context-builder", () => ({
  buildAssistantContext: vi.fn(async () => ({
    thread: { name: "t", campaignId: null },
    recentMessages: [],
    goal: null,
  })),
}));

vi.mock("@/server/assistant/tools/registry", () => ({
  listToolsForProvider: vi.fn(() => []),
}));

vi.mock("@/server/assistant/tools/policy", () => ({
  evaluateToolCall: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-types", () => ({
  containsDeniedPersistenceKeys: vi.fn(() => false),
}));

vi.mock("@/server/assistant/model/reasoning-sanitizer", () => ({
  assertNoReasoningInText: vi.fn(),
  stripThinkBlocks: vi.fn((text: string) => text),
}));

import { evaluateToolCall } from "@/server/assistant/tools/policy";
import { runGoalAgentTurn } from "./orchestrator-loop";

const mockEvaluateToolCall = vi.mocked(evaluateToolCall);

function makeModelClient(
  steps: AssistantStreamEvent[][],
): AssistantModelClient & { calls: AssistantModelRequest[] } {
  const calls: AssistantModelRequest[] = [];
  let stepIndex = 0;
  return {
    calls,
    stream(request: AssistantModelRequest) {
      calls.push(request);
      const events = steps[stepIndex++] ?? [{ type: "done" as const }];
      return (async function* () {
        for (const event of events) {
          yield event;
        }
      })();
    },
  };
}

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  userId: "user-1",
  userMessage: "Quero vender mais",
};

async function collectEvents(gen: AsyncIterable<{ type: string; [k: string]: unknown }>) {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe("runGoalAgentTurn bounded loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateToolCall.mockResolvedValue({
      allowed: true,
      requiresConfirmation: false,
      sanitizedSummary: "ok",
    });
  });

  it("runs at most six provider steps per user turn", async () => {
    // Every step returns a tool call, so the loop must cap at MAX_AGENT_STEPS.
    const toolCallStep: AssistantStreamEvent[] = [
      { type: "text_delta", text: "step" },
      {
        type: "tool_call",
        id: "call-1",
        name: "update_goal_plan",
        argumentsJson: "{}",
      },
    ];
    const model = makeModelClient([
      toolCallStep,
      toolCallStep,
      toolCallStep,
      toolCallStep,
      toolCallStep,
      toolCallStep,
      toolCallStep,
    ]);

    const events = await collectEvents(
      runGoalAgentTurn({ ...baseInput, modelClient: model }),
    );

    expect(model.calls.length).toBeLessThanOrEqual(6);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("serializes assistant tool calls and tool results back to the model", async () => {
    const model = makeModelClient([
      [
        { type: "text_delta", text: "Vou atualizar o plano" },
        {
          type: "tool_call",
          id: "call-1",
          name: "update_goal_plan",
          argumentsJson: "{}",
        },
      ],
      [{ type: "text_delta", text: "Pronto" }],
    ]);

    await collectEvents(
      runGoalAgentTurn({ ...baseInput, modelClient: model }),
    );

    // The second request must contain the assistant tool call + the tool result.
    const secondRequest = model.calls[1];
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          toolCalls: expect.arrayContaining([
            expect.objectContaining({ id: "call-1", name: "update_goal_plan" }),
          ]),
        }),
        expect.objectContaining({ role: "tool", toolCallId: "call-1" }),
      ]),
    );
  });

  it("terminates with final text when no tool calls are produced", async () => {
    const model = makeModelClient([
      [{ type: "text_delta", text: "Tudo certo." }],
    ]);

    const events = await collectEvents(
      runGoalAgentTurn({ ...baseInput, modelClient: model }),
    );

    expect(model.calls).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("emits a tool_summary and denies with a reason when a tool is not allowed", async () => {
    mockEvaluateToolCall.mockResolvedValue({
      allowed: false,
      requiresConfirmation: false,
      sanitizedSummary: "",
      denialReason: "invalid_arguments",
    });
    const model = makeModelClient([
      [
        {
          type: "tool_call",
          id: "call-1",
          name: "update_goal_plan",
          argumentsJson: "{}",
        },
      ],
      [{ type: "text_delta", text: "ok" }],
    ]);

    const events = await collectEvents(
      runGoalAgentTurn({ ...baseInput, modelClient: model }),
    );

    const secondMessages = model.calls[1].messages;
    expect(
      secondMessages.some(
        (m) => m.role === "tool" && m.content.startsWith("Denied:"),
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
