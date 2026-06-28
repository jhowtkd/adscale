import { transitionGuidedFlowAfterAction } from "@/server/assistant/guided-paths/action-integration";
import { emitGuidedFlowActionFailed } from "@/server/assistant/guided-flow-telemetry-lifecycle";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import {
  getAssistantActionById,
  transitionAssistantAction,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
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
import { executeCreateCreativePlan } from "./handlers/create-creative-plan";
import { executeReviseCreativePlan } from "./handlers/revise-creative-plan";
import { executeReviseCreative } from "./handlers/revise-creative";
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
  create_creative_plan: executeCreateCreativePlan,
  revise_creative_plan: executeReviseCreativePlan,
  revise_creative: executeReviseCreative,
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
      const completed = await transitionAssistantAction(workspaceId, actionId, "completed", {
        jobRef: result.jobRef,
        display: { executionSummary: result.resultSummary },
      });
      await transitionGuidedFlowAfterAction({
        workspaceId,
        threadId: action.threadId,
        clientProfileId: thread.clientProfileId,
        actionId,
        result: "completed",
        campaignId: result.campaignId,
      });
      return completed;
    }

    const running = await transitionAssistantAction(workspaceId, actionId, "running", {
      jobRef: result.jobRef,
      display: { executionSummary: result.resultSummary },
    });
    await transitionGuidedFlowAfterAction({
      workspaceId,
      threadId: action.threadId,
      clientProfileId: thread.clientProfileId,
      actionId,
      result: "running",
      campaignId: result.campaignId,
    });
    return running;
  } catch (error) {
    const safeError =
      error instanceof AssistantActionExecutionError
        ? error.message
        : "Não foi possível executar esta ação.";

    await transitionAssistantAction(workspaceId, actionId, "failed", {
      safeError,
    });

    const guidedFlow = await getGuidedFlowByThread(workspaceId, action.threadId);
    if (guidedFlow && guidedFlow.path !== "unclassified") {
      emitGuidedFlowActionFailed({
        workspaceId,
        clientProfileId: thread.clientProfileId,
        threadId: action.threadId,
        guidedFlowId: guidedFlow.id,
        path: guidedFlow.path,
        step: guidedFlow.currentStep,
        actionRecordId: actionId,
        campaignId: guidedFlow.campaignId,
        actionType,
        reasonCode:
          error instanceof AssistantActionExecutionError
            ? error.code
            : "action_execution_failed",
      });
    }

    await transitionGuidedFlowAfterAction({
      workspaceId,
      threadId: action.threadId,
      clientProfileId: thread.clientProfileId,
      actionId,
      result: "failed",
      safeError,
    }).catch(() => null);

    throw error;
  }
}
