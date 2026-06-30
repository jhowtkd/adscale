import type { UiCampaign } from "@/lib/hooks/use-campaigns";

export type CampaignV6BadgeVariant = "success" | "warning" | "info" | "neutral";

export type CampaignV6Row = {
  id: string;
  href: string;
  initials: string;
  name: string;
  variations: number;
  approved: number;
  status: string;
  statusVariant: CampaignV6BadgeVariant;
  updated: string;
  campaign: UiCampaign;
};

export type CampaignsV6Labels = {
  sectionLabel: string;
  versionBadge: string;
  title: string;
  subtitle: string;
  sortPrefix: string;
  newCampaign: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filtersAria: string;
  statusChipPrefix: string;
  platformChipPrefix: string;
  viewList: string;
  viewGrid: string;
  viewBoard: string;
  selectCampaign: (name: string) => string;
  actionsFor: (name: string) => string;
  openCampaign: string;
  duplicate: string;
  saveAsTemplate: string;
  archive: string;
  delete: string;
  variationsLabel: string;
  approvedLabel: string;
};
