import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { listCreativeInspirations } from "@/server/application/list-creative-inspirations";
import { instantiateVisualRecipe } from "@/server/application/instantiate-visual-recipe";
import { instantiateCommercialOffer } from "@/server/application/instantiate-commercial-offer";
import { listVisualRecipes } from "@/server/repositories/visual-recipe";
import { listActiveCommercialOffers } from "@/server/repositories/commercial-offer";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { parseCatalogPageSearchParams } from "@/lib/catalog-page";
import { listCanonicalWorksPage } from "@/server/creative-work/canonical/queries";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { listCreativeProduction } from "@/server/application/list-creative-production";
import { parseProductionSearchParams } from "@/server/repositories/creative-production";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createCreativeWorkDraftWithSource,
  getCreativeWork,
  getCreativeWorkByDraftKey,
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
import { threeFourCreationBlock } from "@/lib/studio/three-four-capability";
import { env } from "@/server/validation/env";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import { z } from "zod";

const instantiateRecipeSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  recipeId: z.string().uuid(),
  fields: socialPostCopySchema.partial().optional(),
}).strict();

const instantiateOfferSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  offerId: z.string().uuid(),
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
  // ICE-04B: 3:4 creation needs the switch plus a validated protocol.
  // Adaptation targets are new outputs — the same block applies to them.
  const creationBlock = threeFourCreationBlock({
    format: value.format,
    targetFormats: value.settings.targetFormats,
    intent: value.intent,
    creationSwitch: env.CREATIVE_WORK_34_CREATION_ENABLED,
  });
  if (creationBlock) {
    const isTarget = value.format !== creationBlock.format;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: isTarget ? ["settings", "targetFormats"] : ["format"],
      message: creationBlock.code === "format_creation_disabled" ? "formatCreationDisabled" : "formatProtocolUnsupported",
    });
  }
  const parsed = creativeWorkPreparationSchema.safeParse(value);
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue(issue));
});

const createBodySchema = z.union([instantiateRecipeSchema, instantiateOfferSchema, createDraftSchema, createCreativeWorkSchema]);

/**
 * List workspace canonical works (Phase 5 / item 37 — history on complete).
 */
export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "draftByKey") {
      const parsed = z.string().uuid().safeParse(searchParams.get("draftKey"));
      if (!parsed.success) {
        return apiError("invalidInput", 400, parsed.error.flatten());
      }
      const work = await getCreativeWorkByDraftKey(workspace.id, user.id, parsed.data);
      if (!work) return apiError("notFound", 404);
      return NextResponse.json({ work });
    }
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
    if (searchParams.get("view") === "offers") {
      const parsedClientProfileId = z.string().uuid().safeParse(searchParams.get("clientProfileId"));
      if (!parsedClientProfileId.success) {
        return apiError("invalidInput", 400, parsedClientProfileId.error.flatten());
      }
      const page = parseCatalogPageSearchParams(searchParams);
      if (page.error) {
        return apiError("invalidInput", 400, { page: page.error });
      }
      const offers = await listActiveCommercialOffers(workspace.id, parsedClientProfileId.data, new Date(), {
        limit: page.limit,
        cursor: page.cursor,
      });
      return NextResponse.json({
        offers: offers.items,
        nextCursor: offers.nextCursor,
      });
    }
    const page = parseCatalogPageSearchParams(searchParams);
    if (page.error) {
      return apiError("invalidInput", 400, { page: page.error });
    }
    const works = await listCanonicalWorksPage(workspace.id, {
      limit: page.limit,
      cursor: page.cursor,
    });
    return NextResponse.json({ works: works.items, nextCursor: works.nextCursor });
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

    if ("offerId" in parsed.data) {
      const instantiated = await instantiateCommercialOffer({
        workspaceId: workspace.id,
        userId: user.id,
        clientProfileId: parsed.data.clientProfileId,
        draftKey: parsed.data.draftKey,
        offerId: parsed.data.offerId,
      });
      if (!instantiated.ok) {
        if (instantiated.error.code === "offer_not_found") return apiError("commercialOfferNotFound", 404);
        if (instantiated.error.code === "brand_mismatch") return apiError("commercialOfferBrandMismatch", 409);
        if (instantiated.error.code === "expired" || instantiated.error.code === "not_yet_valid") {
          return apiError("commercialOfferExpired", 409);
        }
        return apiError("clientProfileNotFound", 404);
      }
      return NextResponse.json({
        work: instantiated.value.work,
        canonical: projectCreativeWorkAsCanonicalWork(instantiated.value.work, []),
        offerVersion: instantiated.value.offerVersion,
      }, { status: 201 });
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
        if (
          instantiated.error.code === "format_creation_disabled" ||
          instantiated.error.code === "format_protocol_unsupported"
        ) {
          return apiError("invalidRequest", 400, {
            code: instantiated.error.code,
            format: instantiated.error.format,
          });
        }
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
      // Defense in depth (the schema enforces the same block): keep the
      // machine-readable code so callers can tell disabled creation from
      // an unvalidated protocol.
      return apiError("invalidRequest", 400, {
        code: result.error.code,
        format: result.error.format,
      });
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
