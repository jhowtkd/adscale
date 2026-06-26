import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { revalidateOnConfirm } from "@/server/assistant/action-contracts/validate";
import {
  executeConfirmedAssistantAction,
  AssistantActionExecutionError,
} from "@/server/assistant/action-execution/execute";
import { emitGuidedFlowActionConfirmed } from "@/server/assistant/guided-flow-telemetry-lifecycle";
import {
  confirmAssistantAction,
  InvalidActionTransitionError,
  AssistantActionValidationError,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { getUserLocale } from "@/server/repositories/user";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const [{ workspace, user }, { actionId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    await revalidateOnConfirm(workspace.id, actionId);

    const action = await confirmAssistantAction(workspace.id, actionId);
    if (!action) {
      return apiError("actionNotFound", 404);
    }

    const [guidedFlow, message] = await Promise.all([
      getGuidedFlowByThread(workspace.id, action.threadId),
      getAssistantMessageById(workspace.id, action.messageId),
    ]);
    const display = (message?.payload ?? {}) as Record<string, unknown>;
    const displayMeta = display.display as Record<string, unknown> | undefined;
    const actionType =
      typeof displayMeta?.actionType === "string" ? displayMeta.actionType : "unknown";

    if (guidedFlow && guidedFlow.path !== "unclassified") {
      emitGuidedFlowActionConfirmed({
        workspaceId: workspace.id,
        clientProfileId: guidedFlow.clientProfileId,
        threadId: action.threadId,
        guidedFlowId: guidedFlow.id,
        path: guidedFlow.path,
        step: guidedFlow.currentStep,
        actionRecordId: actionId,
        campaignId: guidedFlow.campaignId,
        actionType,
      });
    }

    const locale = await getUserLocale(user.id);
    const executed = await executeConfirmedAssistantAction(
      workspace.id,
      actionId,
      user.id,
      locale
    );

    return NextResponse.json({ action: executed });
  } catch (error) {
    if (error instanceof InvalidActionTransitionError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    if (error instanceof AssistantActionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    if (error instanceof AssistantActionExecutionError) {
      if (error.code === "credit_blocked") {
        return apiError("insufficientCredits", 402);
      }
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.actions.[actionId].confirm.POST");
  }
}
