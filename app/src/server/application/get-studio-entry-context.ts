import type { EntryContext } from "@/lib/studio/entry-types";
import {
  projectStudioEntryContext,
  type StudioEntryHistoryRow,
  type StudioEntryKit,
} from "@/server/creative-work/entry-facts";
import {
  resolveCreativeWorkInferredBriefing,
  type CreativeWorkBriefingOverrides,
  type CreativeWorkItem,
} from "@/server/creative-work/contracts";
import { listCampaignsForEntryContext } from "@/server/repositories/campaign";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  listCreativeWorksForEntryContext,
  STUDIO_ENTRY_HISTORY_LIMIT,
} from "@/server/repositories/creative-work";

export type GetStudioEntryContextResult =
  | { ok: true; context: EntryContext }
  | { ok: false; error: "profile_not_found" };

function briefingOverridesForWork(work: CreativeWorkItem): CreativeWorkBriefingOverrides | undefined {
  return work.settings?.briefingOverrides ?? work.inputSnapshot?.briefingOverrides;
}

function mapCreativeWorkToHistoryRow(work: CreativeWorkItem): StudioEntryHistoryRow {
  const inferredBriefing = resolveCreativeWorkInferredBriefing(work.inputSnapshot);
  const overrides = briefingOverridesForWork(work);

  return {
    origin: "creative_work",
    id: work.id,
    updatedAt: work.updatedAt,
    toolKind: work.toolKind,
    inferredOffer: inferredBriefing?.offer,
    inferredAudience: inferredBriefing?.audience,
    inferredTone: inferredBriefing?.tone,
    offerOverride: overrides?.offer,
    audienceOverride: overrides?.audience,
    toneOverride: overrides?.tone,
  };
}

function mapCampaignToHistoryRow(
  campaign: Awaited<ReturnType<typeof listCampaignsForEntryContext>>[number],
): StudioEntryHistoryRow {
  return {
    origin: "campaign",
    id: campaign.id,
    updatedAt: campaign.updatedAt,
    toolKind: null,
    product: campaign.product,
    offer: campaign.offer,
    audience: campaign.audience,
    tone: campaign.tone,
  };
}

function mapBrandKitToStudioKit(
  brandKit: Awaited<ReturnType<typeof getBrandKit>> | null,
): StudioEntryKit {
  if (!brandKit) {
    return { toneOfVoice: null, toneNotes: null, description: null };
  }

  return {
    toneOfVoice: brandKit.toneOfVoice ?? null,
    toneNotes: brandKit.toneNotes ?? null,
    description: brandKit.description ?? null,
  };
}

export async function getStudioEntryContext(input: {
  workspaceId: string;
  clientProfileId: string;
  carouselEnabled: boolean;
}): Promise<GetStudioEntryContextResult> {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    return { ok: false, error: "profile_not_found" };
  }

  const [works, campaigns, brandKit] = await Promise.all([
    listCreativeWorksForEntryContext(
      input.workspaceId,
      input.clientProfileId,
      STUDIO_ENTRY_HISTORY_LIMIT,
    ),
    listCampaignsForEntryContext(
      input.workspaceId,
      input.clientProfileId,
      STUDIO_ENTRY_HISTORY_LIMIT,
    ),
    getBrandKit(input.workspaceId, input.clientProfileId),
  ]);

  const rows = [
    ...works.map(mapCreativeWorkToHistoryRow),
    ...campaigns.map(mapCampaignToHistoryRow),
  ]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, STUDIO_ENTRY_HISTORY_LIMIT);

  const context = projectStudioEntryContext({
    rows,
    kit: mapBrandKitToStudioKit(brandKit),
    carouselEnabled: input.carouselEnabled,
  });

  return { ok: true, context };
}
