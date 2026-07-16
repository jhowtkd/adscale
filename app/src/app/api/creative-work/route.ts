import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listCanonicalWorks } from "@/server/creative-work/canonical/queries";
import {
  createCreativeWorkSource,
  updateCreativeWorkSourceIfUnchanged,
} from "@/server/repositories/creative-work";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { inngest } from "@/server/jobs/client";
import {
  createCreativeWorkSchema,
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
} from "@/server/creative-work/contracts";
import { z } from "zod";

const createDraftSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  request: z.string().trim(),
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
  assetId: z.string().min(1).optional(),
  usage: z.enum(["content", "style", "both"]).optional(),
}).strict().superRefine((value, context) => {
  if (!value.request && !value.assetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["request"], message: "requestOrAssetRequired" });
  }
  if (Boolean(value.assetId) !== Boolean(value.usage)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["assetId"], message: "assetAndUsageRequired" });
  }
  const parsed = creativeWorkPreparationSchema.safeParse(value);
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue(issue));
});

const createBodySchema = z.union([createDraftSchema, createCreativeWorkSchema]);

/**
 * List workspace canonical works (Phase 5 / item 37 — history on complete).
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const works = await listCanonicalWorks(workspace.id);
    return NextResponse.json({ works });
  } catch (error) {
    return handleApiError(error, "creative-work.GET");
  }
}

/**
 * Criar Post create — HTTP adapter only (Phase 5 / items 34–35).
 * Domain: startSocialPostWork (intent social_post, no campaign).
 */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const parsed = createBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const initialAsset = "draftKey" in parsed.data && parsed.data.assetId
      ? await getWorkspaceAssetById(parsed.data.assetId, workspace.id)
      : null;
    if ("draftKey" in parsed.data && parsed.data.assetId && (!initialAsset || !initialAsset.type.startsWith("image/"))) {
      return apiError("invalidInput", 400);
    }

    const result = await startSocialPostWork("draftKey" in parsed.data
      ? {
          workspaceId: workspace.id,
          userId: user.id,
          clientProfileId: parsed.data.clientProfileId,
          draftKey: parsed.data.draftKey,
          request: parsed.data.request,
          intent: parsed.data.intent,
          format: parsed.data.format,
          settings: parsed.data.settings,
        }
      : {
          workspaceId: workspace.id,
          userId: user.id,
          clientProfileId: parsed.data.clientProfileId,
          format: parsed.data.format,
          brief: parsed.data.brief,
        });

    if (!result.ok) {
      if (result.error.code === "client_profile_not_found") {
        return apiError("clientProfileNotFound", 404);
      }
      return apiError("invalidRequest", 400);
    }

    let source;
    if (initialAsset && "draftKey" in parsed.data) {
      source = await createCreativeWorkSource({
        workspaceId: workspace.id,
        workItemId: result.value.work.id,
        assetId: initialAsset.id,
        usage: parsed.data.usage!,
        status: "uploaded",
      });
      if (!source) return apiError("invalidInput", 400);
      try {
        await inngest.send({
          name: "creative-work.source.analyze",
          data: { workspaceId: workspace.id, workItemId: result.value.work.id, sourceId: source.id },
        });
      } catch {
        source = await updateCreativeWorkSourceIfUnchanged(
          workspace.id,
          result.value.work.id,
          source.id,
          { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
          { status: "failed", failureCode: "dispatch_failed" },
        ) ?? source;
      }
    }

    // `work` kept for existing UI; `canonical` is the Phase 5 contract.
    return NextResponse.json(
      {
        work: result.value.work,
        canonical: result.value.canonical,
        quote: result.value.quote,
        ...(source && initialAsset ? {
          source: {
            ...source,
            name: initialAsset.name,
            origin: initialAsset.source === "creative_work" ? "approved_work" : "upload",
          },
        } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "creative-work.POST");
  }
}
