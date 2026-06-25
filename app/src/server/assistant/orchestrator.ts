import { buildAssistantContext, toAssistantModelRequest } from "@/server/assistant/context/context-builder";
import { createMiniMaxModelAdapter } from "@/server/assistant/model/minimax-adapter";
import type { AssistantModelClient } from "@/server/assistant/model/client";
import { assertNoReasoningInText } from "@/server/assistant/model/reasoning-sanitizer";
import { createAssistantMessage } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import { listToolsForProvider } from "@/server/assistant/tools/registry";
import { evaluateToolCall } from "@/server/assistant/tools/policy";

export interface AssistantTurnInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
  userMessage: string;
  modelClient?: AssistantModelClient;
}

export type AssistantTurnEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_summary"; toolName: string; summary: string }
  | { type: "action_card"; actionRecordId: string; status: "pending" }
  | { type: "done"; assistantMessageId: string }
  | { type: "error"; message: string };

export async function* runAssistantTurn(
  input: AssistantTurnInput
): AsyncGenerator<AssistantTurnEvent> {
  const thread = await getAssistantThreadById(input.workspaceId, input.threadId);
  if (!thread || thread.clientProfileId !== input.clientProfileId) {
    yield { type: "error", message: "Thread not found or scope mismatch" };
    return;
  }

  await createAssistantMessage(input.workspaceId, {
    threadId: input.threadId,
    type: "user",
    content: input.userMessage,
  });

  const context = await buildAssistantContext({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
  });

  const modelClient = input.modelClient ?? createMiniMaxModelAdapter();
  const request = toAssistantModelRequest(
    context,
    input.userMessage,
    listToolsForProvider()
  );

  let assistantText = "";

  for await (const event of modelClient.stream(request)) {
    if (event.type === "text_delta") {
      assistantText += event.text;
      yield { type: "text_delta", text: event.text };
      continue;
    }

    if (event.type === "tool_call") {
      const policyResult = await evaluateToolCall(
        {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          threadId: input.threadId,
          userId: input.userId,
        },
        { name: event.name, argumentsJson: event.argumentsJson }
      );

      if (!policyResult.allowed) {
        yield {
          type: "error",
          message: policyResult.denialReason ?? "tool_denied",
        };
        continue;
      }

      await createAssistantMessage(input.workspaceId, {
        threadId: input.threadId,
        type: "tool",
        content: policyResult.sanitizedSummary,
        payload: {
          toolName: event.name,
          summary: policyResult.sanitizedSummary,
        },
      });

      yield {
        type: "tool_summary",
        toolName: event.name,
        summary: policyResult.sanitizedSummary,
      };

      if (policyResult.actionRecordId) {
        yield {
          type: "action_card",
          actionRecordId: policyResult.actionRecordId,
          status: "pending",
        };
      }

      continue;
    }

    if (event.type === "done") {
      break;
    }
  }

  if (containsDeniedPersistenceKeys({ content: assistantText })) {
    yield { type: "error", message: "Assistant output contains denied keys" };
    return;
  }

  assertNoReasoningInText(assistantText);

  const assistantMessage = await createAssistantMessage(input.workspaceId, {
    threadId: input.threadId,
    type: "assistant",
    content: assistantText,
  });

  yield { type: "done", assistantMessageId: assistantMessage.id };
}
