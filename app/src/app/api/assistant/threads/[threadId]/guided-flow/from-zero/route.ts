import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  saveFromZeroBrief,
  saveFromZeroReferences,
} from "@/server/assistant/guided-paths/from-zero";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { GuidedFlowValidationError } from "@/server/repositories/guided-flow";

const briefSchema = z.object({
  answers: z
    .object({
      product: z.string().optional(),
      offer: z.string().optional(),
      audience: z.string().optional(),
      promise: z.string().optional(),
      objections: z.string().optional(),
      cta: z.string().optional(),
      platforms: z.string().optional(),
      constraints: z.string().optional(),
    })
    .strict(),
});

const referencesSchema = z.object({
  referenceIds: z.array(z.string().uuid()).min(3),
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

    if (body.kind === "brief") {
      const parsed = briefSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("invalidInput", 400, parsed.error.flatten());
      }

      try {
        const result = await saveFromZeroBrief({
          workspaceId: workspace.id,
          threadId,
          clientProfileId: thread.clientProfileId,
          answers: parsed.data.answers,
        });

        emitGuidedFlowTelemetry({
          workspaceId: workspace.id,
          clientProfileId: thread.clientProfileId,
          threadId,
          guidedFlowId: result.guidedFlow.id,
          path: result.guidedFlow.path,
          step: result.guidedFlow.currentStep,
          eventKey: "guided_input_supplied",
          metadata: { inputType: "brief" },
        });
        emitGuidedFlowTelemetry({
          workspaceId: workspace.id,
          clientProfileId: thread.clientProfileId,
          threadId,
          guidedFlowId: result.guidedFlow.id,
          path: result.guidedFlow.path,
          step: result.guidedFlow.currentStep,
          eventKey: "guided_step_viewed",
        });

        return NextResponse.json(result);
      } catch (error) {
        if (
          error instanceof GuidedFlowValidationError &&
          error.message.toLowerCase().includes("brief incomplete")
        ) {
          emitGuidedFlowTelemetry({
            workspaceId: workspace.id,
            clientProfileId: thread.clientProfileId,
            threadId,
            path: "from_zero",
            step: "collect_brief",
            eventKey: "guided_action_blocked",
            blockerCategory: "missing_brief_fields",
            metadata: { reasonCode: "brief_incomplete" },
          });
          return apiError("invalidInput", 400, { message: error.message });
        }
        throw error;
      }
    }

    if (body.kind === "references") {
      const parsed = referencesSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("invalidInput", 400, parsed.error.flatten());
      }

      try {
        const result = await saveFromZeroReferences({
          workspaceId: workspace.id,
          threadId,
          clientProfileId: thread.clientProfileId,
          referenceIds: parsed.data.referenceIds,
        });

        emitGuidedFlowTelemetry({
          workspaceId: workspace.id,
          clientProfileId: thread.clientProfileId,
          threadId,
          guidedFlowId: result.guidedFlow.id,
          path: result.guidedFlow.path,
          step: result.guidedFlow.currentStep,
          eventKey: "guided_input_supplied",
          metadata: {
            inputType: "references",
            referenceCount: result.referenceIds.length,
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
        });

        return NextResponse.json(result);
      } catch (error) {
        if (
          error instanceof GuidedFlowValidationError &&
          error.message.toLowerCase().includes("visual references")
        ) {
          emitGuidedFlowTelemetry({
            workspaceId: workspace.id,
            clientProfileId: thread.clientProfileId,
            threadId,
            path: "from_zero",
            step: "select_references",
            eventKey: "guided_action_blocked",
            blockerCategory: "missing_references",
            metadata: { reasonCode: "insufficient_references" },
          });
          return apiError("invalidInput", 400, { message: error.message });
        }
        throw error;
      }
    }

    return apiError("invalidInput", 400, { message: "Unknown kind" });
  } catch (error) {
    if (error instanceof GuidedFlowValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.from-zero.POST"
    );
  }
}
