import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { listCreativeInspirations } from "@/server/application/list-creative-inspirations";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listCanonicalWorks } from "@/server/creative-work/canonical/queries";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import {
  createCreativeWorkDraftWithSource,
  getCreativeWork,
  updateCreativeWorkSourceIfUnchanged,
} from "@/server/repositories/creative-work";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  createCreativeWorkSchema,
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
  quoteCreativeWork,
} from "@/server/creative-work/contracts";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import { z } from "zod";

const createDraftSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  request: z.string().trim(),
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
  assetId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  usage: z.enum(["content", "style", "both"]).optional(),
}).strict().superRefine((value, context) => {
  const sourceCount = Number(Boolean(value.assetId)) + Number(Boolean(value.templateId));
  if (!value.request && sourceCount === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["request"], message: "requestOrAssetRequired" });
  }
  if (sourceCount > 1 || Boolean(sourceCount) !== Boolean(value.usage)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["usage"], message: "sourceAndUsageRequired" });
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
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "inspirations") {
      const rawClientProfileId = searchParams.get("clientProfileId");
      const parsedClientProfileId = rawClientProfileId
        ? z.string().uuid().safeParse(rawClientProfileId)
        : null;

      if (parsedClientProfileId && !parsedClientProfileId.success) {
        return apiError(
          "invalidInput",
          400,
          parsedClientProfileId.error.flatten(),
        );
      }

      const inspirations = await listCreativeInspirations({
        workspaceId: workspace.id,
        clientProfileId: parsedClientProfileId?.data ?? null,
      });
      return NextResponse.json({ inspirations });
    }
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

    if ("draftKey" in parsed.data && (parsed.data.assetId || parsed.data.templateId)) {
      const created = await createCreativeWorkDraftWithSource({
        workspaceId: workspace.id,
        clientProfileId: parsed.data.clientProfileId,
        createdByUserId: user.id,
        draftKey: parsed.data.draftKey,
        intent: parsed.data.intent,
        title: deriveCreativeWorkTitle(parsed.data.request),
        request: parsed.data.request,
        format: parsed.data.format,
        settings: parsed.data.settings,
        usage: parsed.data.usage!,
        ...(parsed.data.assetId
          ? { assetId: parsed.data.assetId }
          : { templateId: parsed.data.templateId! }),
      });
      if (!created) return apiError("invalidInput", 400);
      if ("limitReached" in created) return apiError("creativeWorkPieceReferenceLimit", 409);
      if (!("source" in created)) return apiError("invalidInput", 400);

      let source = created.source;
      if (created.claimedForAnalysis && source.templateId) {
        try {
          const analyzed = await analyzeCreativeWorkSource({
            workspaceId: workspace.id,
            workItemId: created.work.id,
            sourceId: source.id,
          });
          source = analyzed ?? (await getCreativeWork(workspace.id, created.work.id))?.sources
            .find((candidate) => candidate.id === source.id) ?? source;
        } catch {
          source = (await getCreativeWork(workspace.id, created.work.id))?.sources
            .find((candidate) => candidate.id === source.id) ?? source;
        }
      } else if (created.claimedForAnalysis) {
        try {
          await inngest.send({
            name: heavyImageEventName("creative-work.source.analyze"),
            data: { workspaceId: workspace.id, workItemId: created.work.id, sourceId: source.id },
          });
        } catch {
          source = await updateCreativeWorkSourceIfUnchanged(
            workspace.id,
            created.work.id,
            source.id,
            { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
            { status: "failed", failureCode: "dispatch_failed" },
          ) ?? source;
        }
      }

      const origin = "asset" in created ? created.asset! : created.template!;

      return NextResponse.json(
        {
          work: created.work,
          canonical: projectCreativeWorkAsCanonicalWork(created.work, []),
          quote: quoteCreativeWork({
            intent: created.work.toolKind,
            format: created.work.format,
            targetFormats: created.work.settings.targetFormats,
            directionPool: created.work.settings.directionPool,
          }),
          source: {
            ...source,
            name: origin.name,
            origin: "asset" in created
              ? (created.asset!.source === "creative_work" ? "approved_work" : "upload")
              : "template",
          },
        },
        { status: 201 },
      );
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

    // `work` kept for existing UI; `canonical` is the Phase 5 contract.
    return NextResponse.json(
      {
        work: result.value.work,
        canonical: result.value.canonical,
        quote: result.value.quote,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "creative-work.POST");
  }
}
