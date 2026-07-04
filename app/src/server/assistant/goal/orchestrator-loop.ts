import {
  GOAL_AGENT_MAX_STEPS,
  buildGoalAgentSystemPrompt,
} from "./system-prompt";
import { listToolsForProvider } from "@/server/assistant/tools/registry";
import { evaluateToolCall } from "@/server/assistant/tools/policy";
import { buildAssistantContext } from "@/server/assistant/context/context-builder";
import { createMiniMaxModelAdapter } from "@/server/assistant/model/minimax-adapter";
import { createAssistantMessage } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import {
  assertNoReasoningInText,
  stripThinkBlocks,
} from "@/server/assistant/model/reasoning-sanitizer";
import type {
  AssistantModelClient,
  AssistantModelMessage,
  AssistantModelToolCall,
} from "@/server/assistant/model/client";

export interface GoalAgentTurnInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
  userMessage: string;
  modelClient?: AssistantModelClient;
}

export type GoalAgentTurnEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_summary"; toolName: string; summary: string }
  | { type: "action_card"; actionRecordId: string; status: "pending" }
  | { type: "goal_state" }
  | { type: "done"; assistantMessageId: string }
  | { type: "error"; message: string };

export class AssistantGoalStepLimitError extends Error {
  constructor() {
    super("Goal agent exceeded the maximum number of provider steps");
    this.name = "AssistantGoalStepLimitError";
  }
}

/**
 * Bounded MiniMax-M3 agent loop for the goal-agent pilot. Unlike the classic
 * single-pass orchestrator, this loop appends assistant tool calls and the
 * sanitized tool results back to the request so the model can ground its next
 * step. The loop is hard-capped at `GOAL_AGENT_MAX_STEPS` so a chatty model
 * cannot spin forever on a single user turn. Only this pilot path uses the loop;
 * classic threads continue through the existing guided orchestrator.
 */
export async function* runGoalAgentTurn(
  input: GoalAgentTurnInput,
): AsyncGenerator<GoalAgentTurnEvent> {
  const thread = await getAssistantThreadById(input.workspaceId, input.threadId);
  if (!thread || thread.clientProfileId !== input.clientProfileId) {
    yield { type: "error", message: "Thread not found or scope mismatch" };
    return;
  }

  await createAssistantMessage(input.workspaceId, {
    threadId: input.threadId,
    type: "user",
    content: input.userMessage.trim(),
  });

  const context = await buildAssistantContext({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
  });

  const modelClient = input.modelClient ?? createMiniMaxModelAdapter();
  const tools = listToolsForProvider();

  // Seed the conversation with the scoped context + the user turn. The system
  // prompt encodes the senior creative-director behavior; the context block
  // carries the durable goal state (stage, brief, plan, blockers, scope ids).
  const baseMessages: AssistantModelMessage[] = [
    ...context.recentMessages.map((m) => ({
      role: "user" as const,
      content: m.content,
    })),
    { role: "user", content: input.userMessage },
  ];

  const request = {
    systemPrompt: buildGoalAgentSystemPrompt(),
    messages: baseMessages,
    tools,
  };

  let finalText = "";

  for (let stepIndex = 0; stepIndex < GOAL_AGENT_MAX_STEPS; stepIndex += 1) {
    const toolCalls: AssistantModelToolCall[] = [];
    let stepText = "";

    for await (const event of modelClient.stream(request)) {
      if (event.type === "text_delta") {
        stepText += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "tool_call") {
        toolCalls.push({
          id: event.id,
          name: event.name,
          argumentsJson: event.argumentsJson,
        });
      }
    }

    // No tool calls means the model produced a final answer for this turn.
    if (toolCalls.length === 0) {
      finalText = stepText;
      break;
    }

    // Append the assistant turn (with tool calls) so the next provider step can
    // see what it asked for, then append each sanitized tool result.
    request.messages.push({
      role: "assistant",
      content: stepText || null,
      toolCalls,
    });

    for (const call of toolCalls) {
      const policyResult = await evaluateToolCall(
        {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          threadId: input.threadId,
          userId: input.userId,
        },
        { name: call.name, argumentsJson: call.argumentsJson },
      );

      const toolContent = policyResult.allowed
        ? policyResult.sanitizedSummary
        : `Denied: ${policyResult.denialReason ?? "tool_denied"}`;

      request.messages.push({
        role: "tool",
        toolCallId: call.id,
        content: toolContent,
      });

      if (policyResult.allowed) {
        await createAssistantMessage(input.workspaceId, {
          threadId: input.threadId,
          type: "tool",
          content: policyResult.sanitizedSummary,
          payload: { toolName: call.name, summary: policyResult.sanitizedSummary },
        });

        yield {
          type: "tool_summary",
          toolName: call.name,
          summary: policyResult.sanitizedSummary,
        };

        if (policyResult.actionRecordId) {
          yield {
            type: "action_card",
            actionRecordId: policyResult.actionRecordId,
            status: "pending",
          };
        }

        // A successful plan update is a durable state change: tell the client to
        // refresh its goal projection.
        if (call.name === "update_goal_plan") {
          yield { type: "goal_state" };
        }
      } else {
        yield {
          type: "error",
          message: policyResult.denialReason ?? "tool_denied",
        };
      }
    }

    // If this was the last allowed step and the model is still calling tools,
    // surface the step-limit error rather than silently truncating.
    if (stepIndex === GOAL_AGENT_MAX_STEPS - 1) {
      yield {
        type: "error",
        message: new AssistantGoalStepLimitError().message,
      };
    }
  }

  if (containsDeniedPersistenceKeys({ content: finalText })) {
    yield { type: "error", message: "Assistant output contains denied keys" };
    return;
  }

  assertNoReasoningInText(finalText);
  const sanitized = stripThinkBlocks(finalText) || finalText;

  const assistantMessage = await createAssistantMessage(input.workspaceId, {
    threadId: input.threadId,
    type: "assistant",
    content: sanitized,
  });

  yield { type: "done", assistantMessageId: assistantMessage.id };
}
