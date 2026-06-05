import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  getClientProfile,
  getClientReferencesByIds,
} from "@/server/repositories/client-reference";
import { objectStorage } from "@/server/storage";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { createDeleteHandler } from "./handler";

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  client: z.string().optional(),
  product: z.string().optional(),
  offer: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
  generationMode: z.enum(["art_variation", "format_adaptation", "restyling"]).optional(),
  ctaVariants: z.array(z.string()).max(3).optional(),
  targetFormats: z.array(z.string()).max(5).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold", "extreme"]).optional(),
  styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
  status: z.enum(["draft", "active", "generating", "completed", "failed"]).optional(),
})
.refine(
  (data) => {
    const mode = data.generationMode ?? "art_variation";
    if (mode !== "format_adaptation") return true;
    const count = data.targetFormats?.length ?? 0;
    return count >= 1 && count <= 3;
  },
  {
    message: "format_adaptation requires 1 to 3 targetFormats",
    path: ["targetFormats"],
  }
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const campaign = await getCampaignById(id, workspace.id);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const campaign = await updateCampaign(id, workspace.id, parsed.data);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    await recordBrandMemoryEvent({
      type: "campaign_created_or_updated",
      workspaceId: workspace.id,
      campaignId: campaign.id,
      occurredAt: campaign.updatedAt,
      summary: `Campaign "${campaign.name}" was updated for ${campaign.client ?? campaign.product ?? "an unspecified client/product"}.`,
      payload: {
        action: "updated",
        updatedFields: Object.keys(parsed.data),
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
        },
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].PATCH");
  }
}

export const DELETE = createDeleteHandler({ storage: objectStorage });
