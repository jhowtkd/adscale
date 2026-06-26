import { buildAssistantContext, toAssistantModelRequest } from "@/server/assistant/context/context-builder";
import {
  buildIntentPromptAugment,
  buildAttachmentPromptAugment,
  classifyGuidedPath,
  classifyUserIntent,
} from "@/server/assistant/action-contracts/intent-classifier";
import { createMiniMaxModelAdapter } from "@/server/assistant/model/minimax-adapter";
import type { AssistantModelClient } from "@/server/assistant/model/client";
import { assertNoReasoningInText, stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import { createAssistantMessage } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import {
  getGuidedFlowByThread,
  initialStepForPath,
  upsertGuidedFlow,
} from "@/server/repositories/guided-flow";
import { listToolsForProvider } from "@/server/assistant/tools/registry";
import { evaluateToolCall } from "@/server/assistant/tools/policy";

export interface AssistantChatAttachment {
  assetId: string;
  key: string;
  url?: string;
  type: string;
  name: string;
  size: number;
}

export interface AssistantTurnInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
  userMessage: string;
  attachments?: AssistantChatAttachment[];
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
    content:
      input.userMessage.trim() ||
      (input.attachments?.length
        ? `Imagem anexada: ${input.attachments.map((item) => item.name).join(", ")}`
        : ""),
    payload:
      input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : undefined,
  });

  const context = await buildAssistantContext({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
  });

  const existingFlow = await getGuidedFlowByThread(
    input.workspaceId,
    input.threadId
  );

  if (!existingFlow || existingFlow.path === "unclassified") {
    const guidedPathResult = classifyGuidedPath(input.userMessage);

    if (guidedPathResult.kind === "clarify") {
      const assistantMessage = await createAssistantMessage(input.workspaceId, {
        threadId: input.threadId,
        type: "assistant",
        content: guidedPathResult.question,
      });

      yield { type: "done", assistantMessageId: assistantMessage.id };
      return;
    }

    if (guidedPathResult.kind === "classified") {
      await upsertGuidedFlow(
        input.workspaceId,
        input.threadId,
        input.clientProfileId,
        {
          path: guidedPathResult.path,
          status: "active",
          currentStep: initialStepForPath(guidedPathResult.path),
        }
      );
    }
  }

  const intentResult = classifyUserIntent(input.userMessage);

  if (intentResult.kind === "clarify") {
    const assistantMessage = await createAssistantMessage(input.workspaceId, {
      threadId: input.threadId,
      type: "assistant",
      content: intentResult.question,
    });

    yield { type: "done", assistantMessageId: assistantMessage.id };
    return;
  }

  const modelClient = input.modelClient ?? createMiniMaxModelAdapter();
  const request = toAssistantModelRequest(
    context,
    input.userMessage,
    listToolsForProvider()
  );

  const intentAugment = buildIntentPromptAugment(intentResult);
  const attachmentAugment = buildAttachmentPromptAugment({
    attachments: input.attachments,
    hasCampaign: Boolean(thread.campaignId),
  });

  const augmentParts = [intentAugment, attachmentAugment].filter(Boolean);
  if (augmentParts.length > 0) {
    request.systemPrompt = `${request.systemPrompt}\n${augmentParts.join("\n")}`;
  }

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

  const sanitizedAssistantText = stripThinkBlocks(assistantText);

  const assistantMessage = await createAssistantMessage(input.workspaceId, {
    threadId: input.threadId,
    type: "assistant",
    content: sanitizedAssistantText,
  });

  yield { type: "done", assistantMessageId: assistantMessage.id };
}
