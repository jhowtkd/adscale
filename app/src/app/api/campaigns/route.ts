import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createCampaign,
  getCampaignsPage,
} from "@/server/repositories/campaign";
import {
  getClientProfile,
  getClientReferencesByIds,
} from "@/server/repositories/client-reference";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { filterFixtureCampaigns, shouldAllowFixtures } from "@/lib/demo-gating";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1),
  product: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  offer: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
  generationMode: z.enum(["art_variation", "format_adaptation", "restyling"]).optional(),
  ctaVariants: z.array(z.string()).max(3).optional(),
  targetFormats: z.array(z.string()).max(5).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold", "extreme"]).optional().default("balanced"),
  styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
  clientProfileId: z.string().uuid().nullable().optional(),
  selectedReferenceIds: z.array(z.string().uuid()).max(20).optional(),
});

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const { workspace, user } = await requireWorkspaceAccess(request);
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("q") ?? undefined;
    const statusFilter = (url.searchParams.get("status") ?? "all") as
      | "all"
      | "draft"
      | "active"
      | "generating"
      | "completed"
      | "failed";
    const platformFilter = (url.searchParams.get("platform") ?? "all") as
      | "all"
      | "Meta"
      | "TikTok"
      | "Google";
    const sortOption = (url.searchParams.get("sort") ?? "newest") as
      | "newest"
      | "oldest"
      | "name-asc"
      | "name-desc"
      | "variations";
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parsePositiveInt(limitParam, 10) : undefined;
    const offset = limit && page > 1 ? (page - 1) * limit : 0;

    const cachedPage = unstable_cache(
      async (opts: Parameters<typeof getCampaignsPage>[1]) =>
        getCampaignsPage(workspace.id, opts),
      ["campaigns-page", workspace.id],
      {
        revalidate: 60,
        tags: [`campaigns:${workspace.id}`, "campaigns", "campaigns-page"],
      }
    );
    const result = await cachedPage({
      searchQuery,
      statusFilter,
      platformFilter,
      sortOption,
      limit,
      offset,
    });
    const allowFixtures = shouldAllowFixtures(workspace, user);
    const visibleCampaigns = filterFixtureCampaigns(result.campaigns, { allowFixtures });
    return NextResponse.json({ ...result, campaigns: visibleCampaigns });
  } catch (error) {
    return handleApiError(error, "campaigns.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { clientProfileId, selectedReferenceIds } = parsed.data;

    if (clientProfileId) {
      const profile = await getClientProfile(workspace.id, clientProfileId);
      if (!profile) {
        return apiError("clientProfileNotFound", 404);
      }
    }

    if (selectedReferenceIds?.length) {
      const references = await getClientReferencesByIds(
        workspace.id,
        selectedReferenceIds
      );
      if (references.length !== selectedReferenceIds.length) {
        return apiError("clientReferenceNotFound", 404);
      }
      if (clientProfileId) {
        const mismatched = references.some(
          (reference) => reference.clientProfileId !== clientProfileId
        );
        if (mismatched) {
          return apiError("invalidInput", 400);
        }
      }
    }

    const campaign = await createCampaign(workspace.id, {
      ...parsed.data,
      status: "draft",
    });

    revalidateTag(`campaigns:${workspace.id}`, "default");
    revalidateTag("campaigns", "default");

    await recordBrandMemoryEvent({
      type: "campaign_created_or_updated",
      workspaceId: workspace.id,
      campaignId: campaign.id,
      occurredAt: campaign.createdAt,
      summary: `Campaign "${campaign.name}" was created for ${campaign.client ?? campaign.product ?? "an unspecified client/product"}.`,
      payload: {
        action: "created",
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

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.POST");
  }
}
