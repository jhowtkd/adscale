import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { getCampaignInitials } from "./map-campaigns-v6";
import type { CampaignV6BadgeVariant, CampaignV6Row } from "./campaigns-v6-types";

function stateToBadgeVariant(state: string): CampaignV6BadgeVariant {
  if (state === "approved" || state === "delivered") return "success";
  if (state === "generating") return "warning";
  if (state === "failed") return "danger";
  if (state === "reviewing") return "info";
  return "neutral";
}

/** Minimal UiCampaign so bulk actions work without the paginated page slice. */
export function stubCampaignFromCanonicalWork(
  work: CanonicalWorkSummary
): UiCampaign {
  const resultCount = work.resultCount ?? 0;
  return {
    id: work.originId,
    workspaceId: work.workspaceId,
    name: work.name,
    platforms: [],
    generationMode: "art_variation",
    status: "active",
    variations: resultCount,
    creditsUsed: 0,
    totalDerivations: resultCount,
    activeDerivations: 0,
    failedDerivations: 0,
    completedDerivations: 0,
    lastModified: new Date(work.updatedAt),
    createdAt: new Date(work.updatedAt),
  };
}

/**
 * Map a canonical work summary into the Trabalhos list row.
 * Campaign rows always get a campaign payload (enriched or stub) so actions stay operational.
 */
export function mapCanonicalWorkToV6Row({
  work,
  campaign,
  originLabel,
  formatUpdated,
  tState,
  formatProtocol,
  formatNextAction,
}: {
  work: CanonicalWorkSummary;
  campaign?: UiCampaign;
  originLabel: string;
  formatUpdated: (date: Date) => string;
  tState: (state: string) => string;
  formatProtocol?: (protocol: string | null | undefined) => string;
  formatNextAction?: (action: string | null | undefined) => string;
}): CampaignV6Row {
  const campaignPayload =
    work.originKind === "campaign"
      ? (campaign ?? stubCampaignFromCanonicalWork(work))
      : undefined;

  return {
    id: work.originId,
    href: work.resumeHref,
    initials: getCampaignInitials(work.name),
    name: work.name,
    variations:
      campaignPayload?.variations ?? work.resultCount ?? campaignPayload?.totalDerivations ?? 0,
    approved: campaignPayload?.completedDerivations ?? 0,
    status: tState(work.state),
    statusVariant: stateToBadgeVariant(work.state),
    updated: formatUpdated(new Date(work.updatedAt)),
    campaign: campaignPayload,
    originKind: work.originKind,
    originLabel,
    protocol: formatProtocol?.(work.protocol) ?? work.protocol ?? null,
    nextAction: formatNextAction?.(work.nextAction) ?? work.nextAction ?? null,
    resultCount: work.resultCount ?? 0,
    previewHref: work.previewHref ?? null,
    previewAlt: work.previewAlt ?? work.name,
  };
}
