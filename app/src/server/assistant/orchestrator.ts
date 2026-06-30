import { buildAssistantContext, toAssistantModelRequest } from "@/server/assistant/context/context-builder";
import { buildExistingCreativePromptAugment } from "@/server/assistant/guided-paths/existing-creative";
import { buildFromZeroPromptAugment } from "@/server/assistant/guided-paths/from-zero";
import { applyGuidedConversationCommand } from "@/server/assistant/guided-conversation/service";
import { journeyStateFromRow } from "@/server/assistant/guided-conversation/state";
import { presentJourneyState } from "@/server/assistant/guided-conversation/presenter";
import { allowedCommandsForState } from "@/server/assistant/guided-conversation/transition";
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
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { handlePlanRevisionMessage } from "@/server/assistant/plan-iteration/service";
import { classifyCreativeRevisionIntent } from "@/server/assistant/creative-iteration/intent";
import { handleCreativeRevisionMessage } from "@/server/assistant/creative-iteration/service";
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

  let activeFlow = existingFlow;

  if (!activeFlow || activeFlow.path === "unclassified") {
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
      const selected = await applyGuidedConversationCommand({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        clientProfileId: input.clientProfileId,
        envelope: {
          commandId: crypto.randomUUID(),
          expectedRevision: activeFlow?.revision ?? 0,
          command: { type: "select_path", path: guidedPathResult.path },
        },
      });
      activeFlow = selected.guidedFlow;
    }
  }

  if (activeFlow && activeFlow.path !== "unclassified") {
    const state = journeyStateFromRow(activeFlow);
    const presentation = presentJourneyState(state);
    const normalized = input.userMessage.trim().toLowerCase();
    let command:
      | { type: "back" | "restart" }
      | { type: "switch_path"; path: "existing_creative" | "from_zero" }
      | { type: "answer_brief"; field: string; value: string }
      | null = null;

    if (
      /^(voltar|volte|anterior)$/.test(normalized) &&
      allowedCommandsForState(state).includes("back")
    ) {
      command = { type: "back" };
    } else if (/^(reiniciar|recomeçar|recomecar)$/.test(normalized)) {
      command = { type: "restart" };
    } else if (normalized.includes("trocar") && normalized.includes("do zero")) {
      command = { type: "switch_path", path: "from_zero" };
    } else if (normalized.includes("trocar") && normalized.includes("peça")) {
      command = { type: "switch_path", path: "existing_creative" };
    } else if (
      activeFlow.path === "from_zero" &&
      activeFlow.currentStep === "collect_brief" &&
      presentation.prompt?.field &&
      input.userMessage.trim()
    ) {
      command = {
        type: "answer_brief",
        field: presentation.prompt.field,
        value: input.userMessage.trim(),
      };
    }

    if (command) {
      const result = await applyGuidedConversationCommand({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        clientProfileId: input.clientProfileId,
        envelope: {
          commandId: crypto.randomUUID(),
          expectedRevision: activeFlow.revision ?? 0,
          command,
        },
      });
      const assistantMessage = await createAssistantMessage(input.workspaceId, {
        threadId: input.threadId,
        type: "assistant",
        content: `Etapa atualizada: ${result.presentation.currentStep}.`,
      });
      yield { type: "done", assistantMessageId: assistantMessage.id };
      return;
    }
  }

  const intentResult = classifyUserIntent(input.userMessage);

  if (thread.campaignId) {
    const revisionIntent = classifyCreativeRevisionIntent(input.userMessage);

    if (revisionIntent.kind === "ambiguous") {
      const assistantMessage = await createAssistantMessage(input.workspaceId, {
        threadId: input.threadId,
        type: "assistant",
        content: "Você quer revisar o plano ou o criativo?",
      });
      yield { type: "done", assistantMessageId: assistantMessage.id };
      return;
    }

    if (revisionIntent.kind === "plan") {
      const planRevision = await handlePlanRevisionMessage({
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        threadId: input.threadId,
        userId: input.userId,
        scope: {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          campaignId: thread.campaignId,
          threadId: input.threadId,
        },
        userMessage: input.userMessage,
      });

      if (planRevision.kind === "assistant") {
        const assistantMessage = await createAssistantMessage(input.workspaceId, {
          threadId: input.threadId,
          type: "assistant",
          content: planRevision.content,
        });
        yield { type: "done", assistantMessageId: assistantMessage.id };
        return;
      }

      if (planRevision.kind === "action_card") {
        const assistantMessage = await createAssistantMessage(input.workspaceId, {
          threadId: input.threadId,
          type: "assistant",
          content: planRevision.content,
        });
        yield {
          type: "action_card",
          actionRecordId: planRevision.actionRecordId,
          status: "pending",
        };
        yield { type: "done", assistantMessageId: assistantMessage.id };
        return;
      }
    }

    if (revisionIntent.kind === "creative") {
      const creativeRevision = await handleCreativeRevisionMessage({
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        threadId: input.threadId,
        userId: input.userId,
        scope: {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          campaignId: thread.campaignId,
          threadId: input.threadId,
        },
        userMessage: input.userMessage,
        attachmentReferenceIds:
          input.attachments?.map((a) => a.assetId).filter(Boolean) ?? [],
      });

      if (creativeRevision.kind === "assistant") {
        const assistantMessage = await createAssistantMessage(input.workspaceId, {
          threadId: input.threadId,
          type: "assistant",
          content: creativeRevision.content,
        });
        yield { type: "done", assistantMessageId: assistantMessage.id };
        return;
      }

      if (creativeRevision.kind === "action_card") {
        const assistantMessage = await createAssistantMessage(input.workspaceId, {
          threadId: input.threadId,
          type: "assistant",
          content: creativeRevision.content,
        });
        yield {
          type: "action_card",
          actionRecordId: creativeRevision.actionRecordId,
          status: "pending",
        };
        yield { type: "done", assistantMessageId: assistantMessage.id };
        return;
      }
    }
  }

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
  const existingCreativeAugment =
    activeFlow?.path === "existing_creative"
      ? buildExistingCreativePromptAugment({
          currentStep: activeFlow.currentStep,
          slots: (activeFlow.slots ?? {}) as Record<string, unknown>,
          assetIds: (activeFlow.assetIds ?? []) as string[],
        })
      : null;

  const fromZeroAugment =
    activeFlow?.path === "from_zero"
      ? buildFromZeroPromptAugment({
          currentStep: activeFlow.currentStep,
          slots: (activeFlow.slots ?? {}) as Record<string, unknown>,
          referenceIds: (activeFlow.referenceIds ?? []) as string[],
        })
      : null;

  const augmentParts = [
    intentAugment,
    attachmentAugment,
    existingCreativeAugment,
    fromZeroAugment,
  ].filter(Boolean);
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
