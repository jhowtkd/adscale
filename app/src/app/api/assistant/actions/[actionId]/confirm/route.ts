import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { revalidateOnConfirm } from "@/server/assistant/action-contracts/validate";
import {
  confirmAssistantAction,
  InvalidActionTransitionError,
  AssistantActionValidationError,
} from "@/server/repositories/assistant-action";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const [{ workspace }, { actionId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    await revalidateOnConfirm(workspace.id, actionId);

    const action = await confirmAssistantAction(workspace.id, actionId);
    if (!action) {
      return apiError("actionNotFound", 404);
    }

    return NextResponse.json({ action });
  } catch (error) {
    if (error instanceof InvalidActionTransitionError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    if (error instanceof AssistantActionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.actions.[actionId].confirm.POST");
  }
}
