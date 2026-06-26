import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  acknowledgeExistingCreativeDiagnosis,
  selectExistingCreative,
} from "@/server/assistant/guided-paths/existing-creative";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { GuidedFlowValidationError } from "@/server/repositories/guided-flow";

const selectSchema = z.object({
  workspaceAssetId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ workspace }, { threadId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = selectSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await selectExistingCreative({
      workspaceId: workspace.id,
      threadId,
      clientProfileId: thread.clientProfileId,
      workspaceAssetId: parsed.data.workspaceAssetId,
      locale: request.headers.get("accept-language")?.split(",")[0] ?? undefined,
    });

    emitGuidedFlowTelemetry({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      guidedFlowId: result.guidedFlow.id,
      path: result.guidedFlow.path,
      step: result.guidedFlow.currentStep,
      eventKey: "guided_input_supplied",
      campaignId: result.campaignId,
      metadata: {
        inputType: "asset",
        assetCount: result.guidedFlow.assetIds?.length ?? 1,
        hadCampaign: true,
      },
    });

    emitGuidedFlowTelemetry({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      guidedFlowId: result.guidedFlow.id,
      path: result.guidedFlow.path,
      step: result.guidedFlow.currentStep,
      eventKey: "guided_step_viewed",
      campaignId: result.campaignId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GuidedFlowValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.select-creative.POST"
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ workspace }, { threadId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const result = await acknowledgeExistingCreativeDiagnosis({
      workspaceId: workspace.id,
      threadId,
      clientProfileId: thread.clientProfileId,
    });

    emitGuidedFlowTelemetry({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      guidedFlowId: result.guidedFlow.id,
      path: result.guidedFlow.path,
      step: result.guidedFlow.currentStep,
      eventKey: "guided_step_viewed",
      campaignId: result.guidedFlow.campaignId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GuidedFlowValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.select-creative.PATCH"
    );
  }
}
