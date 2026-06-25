import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { revalidateOnConfirm } from "@/server/assistant/action-contracts/validate";
import {
  executeConfirmedAssistantAction,
  AssistantActionExecutionError,
} from "@/server/assistant/action-execution/execute";
import {
  confirmAssistantAction,
  InvalidActionTransitionError,
  AssistantActionValidationError,
} from "@/server/repositories/assistant-action";
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
