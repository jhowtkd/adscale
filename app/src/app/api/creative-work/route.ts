import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { listCreativeInspirations } from "@/server/application/list-creative-inspirations";
import { instantiateVisualRecipe } from "@/server/application/instantiate-visual-recipe";
import { listVisualRecipes } from "@/server/repositories/visual-recipe";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { parseCatalogPageSearchParams } from "@/lib/catalog-page";
import { listCanonicalWorks } from "@/server/creative-work/canonical/queries";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { listCreativeProduction } from "@/server/application/list-creative-production";
import { parseProductionSearchParams } from "@/server/repositories/creative-production";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCampaignById } from "@/server/repositories/campaign";
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
  socialPostCopySchema,
} from "@/server/creative-work/contracts";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import { z } from "zod";

const instantiateRecipeSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  recipeId: z.string().uuid(),
  fields: socialPostCopySchema.partial().optional(),
}).strict();

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

const createBodySchema = z.union([instantiateRecipeSchema, createDraftSchema, createCreativeWorkSchema]);

/**
 * List workspace canonical works (Phase 5 / item 37 — history on complete).
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "production") {
      const query = parseProductionSearchParams(searchParams);
      if (!query) return apiError("invalidInput", 400);
      const profile = await getClientProfile(workspace.id, query.clientProfileId);
      if (!profile) return apiError("clientProfileNotFound", 404);
      if (query.campaignId) {
        const campaign = await getCampaignById(query.campaignId, workspace.id);
        if (!campaign || campaign.clientProfileId !== query.clientProfileId) {
          return apiError("campaignNotFound", 404);
        }
      }
      return NextResponse.json(await listCreativeProduction({ ...query, workspaceId: workspace.id }));
    }
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

      const page = parseCatalogPageSearchParams(searchParams);
      if (page.error) {
        return apiError("invalidInput", 400, { page: page.error });
      }

      const inspirations = await listCreativeInspirations({
        workspaceId: workspace.id,
        clientProfileId: parsedClientProfileId?.data ?? null,
        limit: page.limit,
        cursor: page.cursor ? searchParams.get("cursor") : null,
      });
      return NextResponse.json({
        inspirations: inspirations.items,
        nextCursor: inspirations.nextCursor,
      });
    }
    if (searchParams.get("view") === "recipes") {
      const parsedClientProfileId = z.string().uuid().safeParse(searchParams.get("clientProfileId"));
      if (!parsedClientProfileId.success) {
        return apiError("invalidInput", 400, parsedClientProfileId.error.flatten());
      }
      const page = parseCatalogPageSearchParams(searchParams);
      if (page.error) {
        return apiError("invalidInput", 400, { page: page.error });
      }
      const recipes = await listVisualRecipes(workspace.id, parsedClientProfileId.data, {
        limit: page.limit,
        cursor: page.cursor,
      });
      return NextResponse.json({
        recipes: recipes.items,
        nextCursor: recipes.nextCursor,
      });
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

    if ("recipeId" in parsed.data) {
      const instantiated = await instantiateVisualRecipe({
        workspaceId: workspace.id,
        userId: user.id,
        clientProfileId: parsed.data.clientProfileId,
        draftKey: parsed.data.draftKey,
        recipeId: parsed.data.recipeId,
        fields: parsed.data.fields,
      });
      if (!instantiated.ok) {
        if (instantiated.error.code === "recipe_not_found") return apiError("visualRecipeNotFound", 404);
        if (instantiated.error.code === "brand_mismatch") return apiError("visualRecipeBrandMismatch", 409);
        return apiError("clientProfileNotFound", 404);
      }
      return NextResponse.json({
        work: instantiated.value.work,
        canonical: projectCreativeWorkAsCanonicalWork(instantiated.value.work, []),
        recipeVersion: instantiated.value.recipeVersion,
      }, { status: 201 });
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
      if ("limitReached" in created) {
        return apiError(
          created.reason === "carousel_reference_limit"
            ? "creativeWorkCarouselReferenceLimit"
            : "creativeWorkPieceReferenceLimit",
          409,
        );
      }
      if (!("source" in created)) return apiError("invalidInput", 400);

      let work = created.work;
      let source = created.source;
      if (created.claimedForAnalysis && source.templateId) {
        try {
          const analyzed = await analyzeCreativeWorkSource({
            workspaceId: workspace.id,
            workItemId: created.work.id,
            sourceId: source.id,
          });
          source = analyzed ?? source;
        } catch {
          // Reload the aggregate below: analysis may have persisted a failed
          // source and advanced the work revision even when the command threw.
        }
        const aggregate = await getCreativeWork(workspace.id, created.work.id);
        if (aggregate?.work?.id) work = aggregate.work;
        source = aggregate?.sources.find((candidate) => candidate.id === source.id) ?? source;
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
          const failed = await getCreativeWork(workspace.id, created.work.id);
          if (failed?.work?.id) work = failed.work;
        }
      }

      const origin = "asset" in created ? created.asset! : created.template!;

      return NextResponse.json(
        {
          work,
          canonical: projectCreativeWorkAsCanonicalWork(work, []),
          // Carousel drafts have no deck yet: the deck-size quote is applied
          // at generation confirmation (Task 5), never through the legacy quoter.
          quote: created.work.toolKind === "carousel"
            ? { plans: [], unitCount: 0, credits: 0 }
            : quoteCreativeWork({
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
