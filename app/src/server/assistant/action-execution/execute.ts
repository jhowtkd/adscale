import { resumeGuidedFlowAfterActionFailure } from "@/server/assistant/guided-paths/action-integration";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import {
  getAssistantActionById,
  transitionAssistantAction,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getUserLocale } from "@/server/repositories/user";
import {
  executeQuickFormatAdapt,
  executeQuickPackage,
} from "./handlers/quick-derivation-jobs";
import {
  executeQuickRegenerate,
  executeQuickReview,
} from "./handlers/quick-regenerate-review";
import { executeQuickRestyle } from "./handlers/quick-restyle";
import { executeQuickSaveReference } from "./handlers/quick-save-reference";
import { executeStartCompleteCampaign } from "./handlers/start-complete-campaign";
import type { ActionExecutionContext, ActionExecutionResult } from "./types";
import { AssistantActionExecutionError } from "./types";

export { AssistantActionExecutionError } from "./types";

type Handler = (ctx: ActionExecutionContext) => Promise<ActionExecutionResult>;

const HANDLERS: Record<string, Handler> = {
  quick_restyle: executeQuickRestyle,
  quick_format_adapt: executeQuickFormatAdapt,
  quick_regenerate: executeQuickRegenerate,
  quick_review: executeQuickReview,
  quick_save_reference: executeQuickSaveReference,
  quick_package: executeQuickPackage,
  start_complete_campaign: executeStartCompleteCampaign,
};

export async function executeConfirmedAssistantAction(
  workspaceId: string,
  actionId: string,
  userId: string,
  locale?: string
) {
  const action = await getAssistantActionById(workspaceId, actionId);
  if (!action) {
    throw new AssistantActionExecutionError("Action not found", "action_not_found");
  }
  if (action.status !== "confirmed") {
    throw new AssistantActionExecutionError(
      "Action must be confirmed before execution",
      "execution_failed"
    );
  }

  const message = await getAssistantMessageById(workspaceId, action.messageId);
  const display = (message?.payload ?? {}) as Record<string, unknown>;
  const displayMeta = display.display as Record<string, unknown> | undefined;
  const actionType = displayMeta?.actionType;

  if (typeof actionType !== "string" || !actionType.trim()) {
    throw new AssistantActionExecutionError("Unknown action type", "unknown_action_type");
  }

  const contract = getActionContract(actionType);
  if (!contract) {
    throw new AssistantActionExecutionError("Unknown action type", "unknown_action_type");
  }

  const handler = HANDLERS[actionType];
  if (!handler) {
    return action;
  }

  const thread = await getAssistantThreadById(workspaceId, action.threadId);
  if (!thread) {
    throw new AssistantActionExecutionError("Thread not found", "scope_mismatch");
  }

  const resolvedLocale = locale ?? (await getUserLocale(userId));

  const ctx: ActionExecutionContext = {
    workspaceId,
    actionId,
    threadId: action.threadId,
    clientProfileId: thread.clientProfileId,
    userId,
    locale: resolvedLocale,
    actionType,
    inputSnapshot: action.inputSnapshot as Record<string, unknown>,
  };

  await transitionAssistantAction(workspaceId, actionId, "running");

  try {
    const result = await handler(ctx);

    if (result.mode === "sync") {
      return transitionAssistantAction(workspaceId, actionId, "completed", {
        jobRef: result.jobRef,
        display: { executionSummary: result.resultSummary },
      });
    }

    return transitionAssistantAction(workspaceId, actionId, "running", {
      jobRef: result.jobRef,
      display: { executionSummary: result.resultSummary },
    });
  } catch (error) {
    const safeError =
      error instanceof AssistantActionExecutionError
        ? error.message
        : "Não foi possível executar esta ação.";

    await transitionAssistantAction(workspaceId, actionId, "failed", {
      safeError,
    });

    await resumeGuidedFlowAfterActionFailure({
      workspaceId,
      threadId: action.threadId,
      clientProfileId: thread.clientProfileId,
      safeError,
    }).catch(() => null);

    throw error;
  }
}
