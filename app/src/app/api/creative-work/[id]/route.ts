import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import { prepareCreativeWork } from "@/server/application/prepare-creative-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { CREATIVE_WORK_INTENTS, socialPostCopySchema } from "@/server/creative-work/contracts";
import {
  failStaleCreativeWorkOutputs,
  getCreativeWork,
  refreshCreativeWorkStatus,
  updateCreativeWorkDraft,
} from "@/server/repositories/creative-work";

const GENERATION_LEASE_MS = 15 * 60 * 1000;

const confirmCreativeWorkSchema = z
  .object({
    // Legacy wizard body — mapped to CanonicalBriefing write inside the command.
    copy: socialPostCopySchema,
    // Empty is allowed: Create Post can lock a Brand-Kit-only identity
    // snapshot when the brand has no approved training references yet.
    selectedReferenceIds: z.array(z.string().uuid()).max(8),
  })
  .strict();

const autosaveSchema = z.object({
  action: z.literal("autosave"),
  request: z.string(),
  intent: z.enum(CREATIVE_WORK_INTENTS),
  format: z.enum(["1:1", "4:5", "9:16"]),
  settings: z.object({ targetFormats: z.array(z.enum(["1:1", "4:5", "9:16"])) }),
}).strict();
const prepareSchema = z.object({ action: z.literal("prepare") }).strict();
const patchCreativeWorkSchema = z.union([autosaveSchema, prepareSchema, confirmCreativeWorkSchema]);

/**
 * Standalone create-post detail. Attaches CanonicalCreativeWork projection
 * (Phase 5 / item 36).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const staleOutputs = await failStaleCreativeWorkOutputs(
      workspace.id,
      id,
      new Date(Date.now() - GENERATION_LEASE_MS),
    );
    if (staleOutputs.length > 0) {
      await refreshCreativeWorkStatus(workspace.id, id);
    }
    const result = await getCreativeWork(workspace.id, id);
    if (!result) {
      return apiError("creativeWorkNotFound", 404);
    }
    const canonical = projectCreativeWorkAsCanonicalWork(
      result.work,
      result.outputs
    );
    return NextResponse.json({
      work: result.work,
      outputs: result.outputs,
      canonical,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].GET");
  }
}

/**
 * Confirm the work: persist copy (via canonical briefing map) and lock
 * identity snapshot. Domain: confirmSocialPostWork (Phase 5 / item 36).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = patchCreativeWorkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    if ("action" in parsed.data && parsed.data.action === "autosave") {
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      const unchanged = aggregate.work.request === parsed.data.request &&
        aggregate.work.toolKind === parsed.data.intent &&
        aggregate.work.format === parsed.data.format &&
        JSON.stringify(aggregate.work.settings) === JSON.stringify(parsed.data.settings);
      const work = unchanged ? aggregate.work : await updateCreativeWorkDraft(workspace.id, id, {
        request: parsed.data.request,
        toolKind: parsed.data.intent,
        format: parsed.data.format,
        settings: parsed.data.settings,
        brief: null,
        copy: null,
        inputSnapshot: null,
      });
      if (!work) return apiError("creativeWorkNotFound", 404);
      return NextResponse.json({ work });
    }

    if ("action" in parsed.data && parsed.data.action === "prepare") {
      const prepared = await prepareCreativeWork({ workspaceId: workspace.id, workItemId: id });
      if (!prepared.ok) {
        if (prepared.error.code === "work_not_found") return apiError("creativeWorkNotFound", 404);
        if (prepared.error.code === "sources_not_ready") return apiError("creativeWorkSourcesNotReady", 409);
        return apiError("creativeWorkInputRequired", 422);
      }
      return NextResponse.json(prepared.value);
    }

    const result = await confirmSocialPostWork({
      workspaceId: workspace.id,
      workItemId: id,
      copy: parsed.data.copy,
      selectedReferenceIds: parsed.data.selectedReferenceIds,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "invalid_copy":
          return apiError("invalidInput", 400);
        case "identity_reference_not_approved":
          return apiError("identityReferenceNotApproved", 422, {
            referenceId: result.error.referenceId,
          });
        case "identity_reference_missing_alpha":
          return apiError("identityReferenceMissingAlpha", 422, {
            referenceId: result.error.referenceId,
            category: result.error.category,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({
      work: result.value.work,
      canonical: result.value.canonical,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].PATCH");
  }
}
