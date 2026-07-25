import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import {
  detectCreativeWorkDraftBrandConflict,
  prepareCreativeWork,
} from "@/server/application/prepare-creative-work";
import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { contentBriefSchema, styleBriefSchema } from "@/server/ai/image-analysis";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import {
  CREATIVE_SOURCE_USAGES,
  CREATIVE_WORK_BRAND_CHOICES,
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
  displayRequestForCreativeWork,
  socialPostCopySchema,
} from "@/server/creative-work/contracts";
import {
  failStaleCreativeWorkOutputs,
  failStaleCreativeWorkSources,
  createCreativeWorkSource,
  deleteCreativeWorkSource,
  getCreativeWork,
  linkCreativeWorkCampaign,
  refreshCreativeWorkStatus,
  updateCreativeWorkSource,
  updateCreativeWorkSourceIfUnchanged,
  updateCreativeWorkDraft,
} from "@/server/repositories/creative-work";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { getTemplateById } from "@/server/repositories/template";
import { inngest } from "@/server/jobs/client";
import type { CreativeWorkSource } from "@/server/db/schema";

const GENERATION_LEASE_MS = 15 * 60 * 1000;
const SOURCE_ANALYSIS_LEASE_MS = 5 * 60 * 1000;

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
// R-003: persists the restyle brand-conflict choice ("source" | "active") in
// CreativeWorkSettings so the same draft resumes without a new question.
const resolveBrandConflictSchema = z.object({
  action: z.literal("resolveBrandConflict"),
  choice: z.enum(CREATIVE_WORK_BRAND_CHOICES),
}).strict();
const linkCampaignSchema = z.object({ action: z.literal("linkCampaign"), campaignId: z.string().min(1).nullable() }).strict();
const sourceUsageSchema = z.enum(CREATIVE_SOURCE_USAGES);
const attachSourceSchema = z.union([
  z.object({ action: z.literal("attachSource"), assetId: z.string().min(1), usage: sourceUsageSchema }).strict(),
  z.object({ action: z.literal("attachSource"), templateId: z.string().min(1), usage: sourceUsageSchema }).strict(),
]);
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
  linkCampaignSchema, resolveBrandConflictSchema,
]);

function dispatchSourceAnalysis(workspaceId: string, workItemId: string, sourceId: string) {
  return inngest.send({ name: "creative-work.source.analyze", data: { workspaceId, workItemId, sourceId } });
}

async function dispatchSourceAnalysisOrFail(workspaceId: string, workItemId: string, source: CreativeWorkSource) {
  try {
    await dispatchSourceAnalysis(workspaceId, workItemId, source.id);
  } catch (error) {
    await updateCreativeWorkSourceIfUnchanged(
      workspaceId,
      workItemId,
      source.id,
      { status: "uploaded", usage: source.usage, updatedAt: source.updatedAt },
      { status: "failed", failureCode: "dispatch_failed" },
    );
    throw error;
  }
}

async function projectSourceDto(workspaceId: string, source: CreativeWorkSource) {
  if (source.templateId) {
    const template = await getTemplateById(source.templateId, workspaceId);

    return {
      ...source,
      name: template?.name ?? "Template",
      previewUrl: null,
      origin: "template" as const,
    };
  }

  const asset = source.assetId
    ? await getWorkspaceAssetById(source.assetId, workspaceId)
    : null;

  return {
    ...source,
    name: asset?.name ?? "Arte",
    previewUrl: asset
      ? `/api/workspace/assets/${asset.id}/file`
      : null,
    origin: asset?.source === "creative_work"
      ? "approved_work" as const
      : "upload" as const,
  };
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
    const [staleOutputs] = await Promise.all([
      failStaleCreativeWorkOutputs(
        workspace.id,
        id,
        new Date(Date.now() - GENERATION_LEASE_MS),
      ),
      failStaleCreativeWorkSources(
        workspace.id,
        id,
        new Date(Date.now() - SOURCE_ANALYSIS_LEASE_MS),
      ),
    ]);
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
    const sources = await Promise.all((result.sources ?? []).map((source) => projectSourceDto(workspace.id, source)));
    return NextResponse.json({
      work: {
        ...result.work,
        request: displayRequestForCreativeWork(result.work),
      },
      outputs: result.outputs,
      sources,
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
        // R-002: copy that cannot be grounded in the fact pack is a 422 with
        // its violations payload preserved — never a bare 409.
        if (prepared.error.code === "invalid_context") return apiError("invalid_context", 422, prepared.error.details);
        // R-003: an explicit brand conflict is a 422 whose details carry the
        // two short choices (source/active) — billing stays blocked.
        if (prepared.error.code === "brand_conflict") return apiError("brand_conflict", 422, prepared.error.details);
        return apiError("creativeWorkNotReady", 409);
      }
      return NextResponse.json(prepared.value);
    }

    if ("action" in parsed.data && parsed.data.action === "resolveBrandConflict") {
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      // The brand choice exists only for restyle — the single new visible
      // decision of spec 11; other protocols never grow this wizard.
      if (aggregate.work.toolKind !== "restyle") return apiError("invalidInput", 400);
      // R-003: the choice is bound to the conflict it answers. It is only
      // accepted while that exact conflict is detectable in the current
      // draft — a draft without a detectable conflict has nothing to
      // resolve, and a different future conflict asks again.
      const conflict = await detectCreativeWorkDraftBrandConflict({
        workspaceId: workspace.id,
        work: aggregate.work,
        sources: aggregate.sources,
      });
      if (!conflict) return apiError("invalidInput", 400);
      const work = await updateCreativeWorkDraft(workspace.id, id, {
        settings: {
          ...aggregate.work.settings,
          brandConflictChoice: parsed.data.choice,
          brandConflictDetectedBrand: conflict.detectedBrand,
        },
        // The fact pack/copy depend on the resolved brand authority, so the
        // prepared blocks are rebuilt by the next prepare of the same draft.
        brief: null,
        copy: null,
        inputSnapshot: null,
      });
      if (!work) return apiError("creativeWorkNotFound", 404);
      return NextResponse.json({ work });
    }

    if ("action" in parsed.data && parsed.data.action === "linkCampaign") {
      const work = await linkCreativeWorkCampaign(workspace.id, id, parsed.data.campaignId);
      if (!work) return apiError("creativeWorkCampaignMismatch", 409);
      return NextResponse.json({ work });
    }

    if ("action" in parsed.data && parsed.data.action === "attachSource") {
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      const asset = "assetId" in parsed.data ? await getWorkspaceAssetById(parsed.data.assetId, workspace.id) : null;
      const template = "templateId" in parsed.data ? await getTemplateById(parsed.data.templateId, workspace.id) : null;
      if ("assetId" in parsed.data && (!asset || !asset.type.startsWith("image/"))) return apiError("invalidInput", 400);
      if ("templateId" in parsed.data && !template) return apiError("invalidInput", 400);
      const sourceClaim = await createCreativeWorkSource({
        workspaceId: workspace.id,
        workItemId: id,
        ...(asset ? { assetId: asset.id } : { templateId: template!.id }),
        usage: parsed.data.usage,
        usageConfirmed: aggregate.work.toolKind !== "single",
        status: "uploaded",
      });
      if (!sourceClaim) return apiError("invalidInput", 400);
      const source = sourceClaim.source;
      if (!sourceClaim.claimedForAnalysis) return NextResponse.json({ source });
      if (source.templateId) {
        const analyzed = await analyzeCreativeWorkSource({ workspaceId: workspace.id, workItemId: id, sourceId: source.id });
        const canonical = analyzed ?? (await getCreativeWork(workspace.id, id))?.sources
          .find((candidate) => candidate.id === source.id) ?? source;
        return NextResponse.json({ source: canonical });
      }
      await dispatchSourceAnalysisOrFail(workspace.id, id, source);
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
        const removed = await deleteCreativeWorkSource(workspace.id, id, source.id);
        if (!removed) return apiError("invalidInput", 409);
        return NextResponse.json({ removed: true });
      }
      if (parsed.data.action === "editSourceAnalysis") {
        const updated = await updateCreativeWorkSource(workspace.id, id, source.id, {
          contentAnalysis: source.usage === "style" ? null : parsed.data.content,
          styleAnalysis: source.usage === "content" ? null : parsed.data.style,
          status: "ready",
          failureCode: null,
        });
        if (!updated) return apiError("invalidInput", 409);
        await updateCreativeWorkDraft(workspace.id, id, { brief: null, copy: null, inputSnapshot: null });
        return NextResponse.json({ source: updated });
      }
      // Allow retry for failed (normal) and uploaded (stuck: Inngest never claimed).
      // Analyzing/ready must not re-dispatch — that races an in-flight job.
      if (parsed.data.action === "retrySource" && source.status !== "failed" && source.status !== "uploaded") {
        return apiError("invalidInput", 409);
      }
      const updated = parsed.data.action === "updateSource"
        ? await updateCreativeWorkSource(workspace.id, id, source.id, { usage: parsed.data.usage, usageConfirmed: true, status: "uploaded", failureCode: null })
        : await updateCreativeWorkSourceIfUnchanged(
          workspace.id,
          id,
          source.id,
          { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
          { status: "uploaded", failureCode: null },
        );
      if (!updated) return apiError("invalidInput", 409);
      if (updated.templateId) {
        const analyzed = await analyzeCreativeWorkSource({ workspaceId: workspace.id, workItemId: id, sourceId: source.id });
        return NextResponse.json({ source: analyzed });
      }
      await dispatchSourceAnalysisOrFail(workspace.id, id, updated);
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
