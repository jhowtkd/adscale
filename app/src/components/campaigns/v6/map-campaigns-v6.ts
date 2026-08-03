import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import type { CampaignV6BadgeVariant, CampaignV6Row } from "./campaigns-v6-types";

export function getCampaignInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function statusToBadgeVariant(status: UiCampaign["status"]): CampaignV6BadgeVariant {
  if (status === "completed") return "success";
  if (status === "generating") return "warning";
  if (status === "failed") return "danger";
  if (status === "active") return "info";
  return "neutral";
}

export function mapCampaignToV6Row({
  campaign,
  tStatus,
  formatUpdated,
}: {
  campaign: UiCampaign;
  tStatus: (key: string) => string;
  formatUpdated: (date: Date) => string;
}): CampaignV6Row {
  return {
    id: campaign.id,
    href: `/campaigns/${campaign.id}`,
    initials: getCampaignInitials(campaign.name),
    name: campaign.name,
    variations: campaign.variations || campaign.totalDerivations,
    approved: campaign.completedDerivations,
    status: tStatus(campaign.status),
    statusVariant: statusToBadgeVariant(campaign.status),
    updated: formatUpdated(campaign.lastModified),
    campaign,
    originKind: "campaign",
    originLabel: "Campaign",
  };
}
