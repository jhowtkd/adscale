import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import { prepareCreativeWork } from "@/server/application/prepare-creative-work";
import { contentBriefSchema, styleBriefSchema } from "@/server/ai/image-analysis";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { CREATIVE_SOURCE_USAGES } from "@/server/creative-work/contracts";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import {
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
  socialPostCopySchema,
} from "@/server/creative-work/contracts";
import {
  failStaleCreativeWorkOutputs,
  createCreativeWorkSource,
  deleteCreativeWorkSource,
  getCreativeWork,
  refreshCreativeWorkStatus,
  updateCreativeWorkSource,
  updateCreativeWorkDraft,
} from "@/server/repositories/creative-work";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { inngest } from "@/server/jobs/client";

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
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
}).strict().superRefine((value, context) => {
  const parsed = creativeWorkPreparationSchema.safeParse(value);
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue(issue));
});
const prepareSchema = z.object({ action: z.literal("prepare") }).strict();
const sourceUsageSchema = z.enum(CREATIVE_SOURCE_USAGES);
const attachSourceSchema = z.object({ action: z.literal("attachSource"), assetId: z.string().min(1), usage: sourceUsageSchema }).strict();
const updateSourceSchema = z.object({ action: z.literal("updateSource"), sourceId: z.string().min(1), usage: sourceUsageSchema }).strict();
const retrySourceSchema = z.object({ action: z.literal("retrySource"), sourceId: z.string().min(1) }).strict();
const removeSourceSchema = z.object({ action: z.literal("removeSource"), sourceId: z.string().min(1) }).strict();
const editSourceAnalysisSchema = z.object({
  action: z.literal("editSourceAnalysis"),
  sourceId: z.string().min(1),
  content: contentBriefSchema.nullable(),
  style: styleBriefSchema.nullable(),
}).strict();
const patchCreativeWorkSchema = z.union([
  autosaveSchema, prepareSchema, attachSourceSchema, updateSourceSchema,
  retrySourceSchema, removeSourceSchema, editSourceAnalysisSchema, confirmCreativeWorkSchema,
]);

function dispatchSourceAnalysis(workspaceId: string, workItemId: string, sourceId: string) {
  return inngest.send({ name: "creative-work.source.analyze", data: { workspaceId, workItemId, sourceId } });
}

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
      sources: result.sources,
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
        if (prepared.error.code === "missing_input") return apiError("creativeWorkInputRequired", 422);
        return apiError("creativeWorkNotReady", 409);
      }
      return NextResponse.json(prepared.value);
    }

    if ("action" in parsed.data && parsed.data.action === "attachSource") {
      const [aggregate, asset] = await Promise.all([
        getCreativeWork(workspace.id, id),
        getWorkspaceAssetById(parsed.data.assetId, workspace.id),
      ]);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      if (!asset || !asset.type.startsWith("image/")) return apiError("invalidInput", 400);
      const source = await createCreativeWorkSource({
        workspaceId: workspace.id,
        workItemId: id,
        assetId: asset.id,
        usage: parsed.data.usage,
        status: "uploaded",
      });
      if (!source) return apiError("invalidInput", 400);
      await dispatchSourceAnalysis(workspace.id, id, source.id);
      return NextResponse.json({ source });
    }

    if ("sourceId" in parsed.data) {
      const sourceId = parsed.data.sourceId;
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      const source = aggregate.sources.find((candidate) => candidate.id === sourceId);
      if (!source) return apiError("invalidInput", 404);

      if (parsed.data.action === "removeSource") {
        await deleteCreativeWorkSource(workspace.id, id, source.id);
        return NextResponse.json({ removed: true });
      }
      if (parsed.data.action === "editSourceAnalysis") {
        const updated = await updateCreativeWorkSource(workspace.id, id, source.id, {
          contentAnalysis: source.usage === "style" ? null : parsed.data.content,
          styleAnalysis: source.usage === "content" ? null : parsed.data.style,
          status: "ready",
          failureCode: null,
        });
        await updateCreativeWorkDraft(workspace.id, id, { brief: null, copy: null, inputSnapshot: null });
        return NextResponse.json({ source: updated });
      }
      const updated = await updateCreativeWorkSource(workspace.id, id, source.id, parsed.data.action === "updateSource"
        ? { usage: parsed.data.usage, status: "uploaded", failureCode: null }
        : { status: "uploaded", failureCode: null });
      if (!updated) return apiError("invalidInput", 404);
      await dispatchSourceAnalysis(workspace.id, id, source.id);
      return NextResponse.json({ source: updated });
    }

    if ("action" in parsed.data) return apiError("invalidInput", 400);

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
