import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { materializeTemplateAsCampaign } from "@/server/application/materialize-template-as-campaign";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

/**
 * Materialize template → campaign CanonicalCreativeWork (Phase 5 / item 39).
 * HTTP adapter only; domain in materializeTemplateAsCampaign.
 */
const bodySchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1),
});

const templateIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { id: rawId } = await params;
    const idParsed = templateIdSchema.safeParse(rawId);
    if (!idParsed.success) {
      return apiError("notFound", 404);
    }

    const bodyParsed = bodySchema.safeParse(await request.json());
    if (!bodyParsed.success) {
      return apiError("invalidInput", 400, bodyParsed.error.flatten());
    }

    const result = await materializeTemplateAsCampaign({
      workspaceId: workspace.id,
      userId: user.id,
      templateId: idParsed.data,
      name: bodyParsed.data.name,
      client: bodyParsed.data.client,
    });

    if (!result.ok) {
      if (result.error.code === "template_not_found") {
        return apiError("notFound", 404);
      }
      return apiError("invalidRequest", 400);
    }

    const { campaign, canonical } = result.value;

    revalidateTag(`campaigns:${workspace.id}`, "default");
    revalidateTag("campaigns", "default");

    await recordBrandMemoryEvent({
      type: "campaign_created_or_updated",
      workspaceId: workspace.id,
      campaignId: campaign.id,
      occurredAt: campaign.createdAt,
      summary: `Campaign "${campaign.name}" was created from template for ${campaign.client ?? campaign.product ?? "an unspecified client/product"}.`,
      payload: {
        action: "created",
        source: "template",
        templateId: idParsed.data,
        campaign: {
          name: campaign.name,
          client: campaign.client,
          product: campaign.product,
          objective: campaign.objective,
          audience: campaign.audience,
          constraints: campaign.constraints,
          generationMode: campaign.generationMode,
          ctaVariants: campaign.ctaVariants,
          targetFormats: campaign.targetFormats,
          creativeLevel: campaign.creativeLevel,
          selectedReferenceIds: campaign.selectedReferenceIds,
        },
      },
    });

    return NextResponse.json({ campaign, canonical }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "templates.[id].materialize.POST");
  }
}
