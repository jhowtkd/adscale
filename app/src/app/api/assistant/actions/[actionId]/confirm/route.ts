import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { creditBlockedApiError } from "@/server/billing/paywall";
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
  // Known once the caller is authorized: a blocked spend of a workspace on the free plan answers with its reason.
  let workspaceId: string | null = null;
  try {
    const [{ workspace, user }, { actionId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    workspaceId = workspace.id;

    await revalidateOnConfirm(workspace.id, actionId, user.id);

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
      // The pre-flight spend check of the free plan (ticket 11, part 2): its reason and CTA, not a validation error.
      if (error.message === "free_plan" && workspaceId) {
        return creditBlockedApiError(workspaceId, "insufficientCredits");
      }
      return apiError("invalidInput", 400, { message: error.message });
    }
    if (error instanceof AssistantActionExecutionError) {
      if (error.code === "credit_blocked") {
        return workspaceId
          ? creditBlockedApiError(workspaceId, "insufficientCredits")
          : apiError("insufficientCredits", 402);
      }
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.actions.[actionId].confirm.POST");
  }
}
