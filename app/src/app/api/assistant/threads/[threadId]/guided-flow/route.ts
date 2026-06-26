import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  GuidedFlowValidationError,
  getGuidedFlowByThread,
  patchGuidedFlow,
  upsertGuidedFlow,
} from "@/server/repositories/guided-flow";

const guidedFlowPathSchema = z.enum([
  "existing_creative",
  "from_zero",
  "unclassified",
]);

const guidedFlowStatusSchema = z.enum([
  "active",
  "completed",
  "abandoned",
  "blocked",
]);

const upsertSchema = z.object({
  path: guidedFlowPathSchema,
  status: guidedFlowStatusSchema,
  currentStep: z.string().min(1),
  slots: z.record(z.unknown()).optional(),
  missingFields: z.array(z.string()).optional(),
  assetIds: z.array(z.string().uuid()).optional(),
  referenceIds: z.array(z.string().uuid()).optional(),
  campaignId: z.string().uuid().nullable().optional(),
});

const patchSchema = z.object({
  path: guidedFlowPathSchema.optional(),
  status: guidedFlowStatusSchema.optional(),
  currentStep: z.string().min(1).optional(),
  slots: z.record(z.unknown()).optional(),
  missingFields: z.array(z.string()).optional(),
  assetIds: z.array(z.string().uuid()).optional(),
  referenceIds: z.array(z.string().uuid()).optional(),
  campaignId: z.string().uuid().nullable().optional(),
  mode: z.enum(["upsert", "patch"]).optional(),
});

export async function GET(
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

    const guidedFlow = await getGuidedFlowByThread(workspace.id, threadId);
    if (!guidedFlow) {
      return apiError("guidedFlowNotFound", 404);
    }

    return NextResponse.json({ guidedFlow });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].guided-flow.GET");
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

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { mode, ...payload } = parsed.data;
    const existing = await getGuidedFlowByThread(workspace.id, threadId);

    let guidedFlow;
    if (mode === "patch" || (existing && mode !== "upsert")) {
      if (!existing && mode === "patch") {
        return apiError("guidedFlowNotFound", 404);
      }
      if (existing) {
        guidedFlow = await patchGuidedFlow(
          workspace.id,
          threadId,
          thread.clientProfileId,
          payload
        );
      } else {
        const upsertParsed = upsertSchema.safeParse(payload);
        if (!upsertParsed.success) {
          return apiError("invalidInput", 400, upsertParsed.error.flatten());
        }
        guidedFlow = await upsertGuidedFlow(
          workspace.id,
          threadId,
          thread.clientProfileId,
          upsertParsed.data
        );
      }
    } else {
      const upsertParsed = upsertSchema.safeParse(payload);
      if (!upsertParsed.success) {
        return apiError("invalidInput", 400, upsertParsed.error.flatten());
      }
      guidedFlow = await upsertGuidedFlow(
        workspace.id,
        threadId,
        thread.clientProfileId,
        upsertParsed.data
      );
    }

    return NextResponse.json({ guidedFlow });
  } catch (error) {
    if (error instanceof GuidedFlowValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.[threadId].guided-flow.PATCH");
  }
}
