import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { getCampaignInitials } from "./map-campaigns-v6";
import type { CampaignV6BadgeVariant, CampaignV6Row } from "./campaigns-v6-types";

function stateToBadgeVariant(state: string): CampaignV6BadgeVariant {
  if (state === "approved" || state === "delivered") return "success";
  if (state === "generating" || state === "failed") return "warning";
  if (state === "reviewing") return "info";
  return "neutral";
}

/**
 * Map a canonical work summary into the Trabalhos list row.
 * Campaign bulk actions only when `campaign` is provided.
 */
export function mapCanonicalWorkToV6Row({
  work,
  campaign,
  originLabel,
  formatUpdated,
  tState,
}: {
  work: CanonicalWorkSummary;
  campaign?: UiCampaign;
  originLabel: string;
  formatUpdated: (date: Date) => string;
  tState: (state: string) => string;
}): CampaignV6Row {
  return {
    id: work.originId,
    href: work.resumeHref,
    initials: getCampaignInitials(work.name),
    name: work.name,
    variations: campaign?.variations ?? campaign?.totalDerivations ?? 0,
    approved: campaign?.completedDerivations ?? 0,
    status: tState(work.state),
    statusVariant: stateToBadgeVariant(work.state),
    updated: formatUpdated(new Date(work.updatedAt)),
    campaign: work.originKind === "campaign" ? campaign : undefined,
    originKind: work.originKind,
    originLabel,
  };
}
