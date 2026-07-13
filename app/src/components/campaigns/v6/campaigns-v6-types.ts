import type { UiCampaign } from "@/lib/hooks/use-campaigns";

export type CampaignV6BadgeVariant = "success" | "warning" | "info" | "neutral";

/** Origin grouping for Trabalhos (item 46): campaigns as filter, not synonym. */
export type WorkOriginFilter = "all" | "campaign" | "creative_work";

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
  /** Present only for campaign-origin rows (bulk actions / template). */
  campaign?: UiCampaign;
  originKind: "campaign" | "creative_work";
  originLabel: string;
};

export type CampaignsV6Labels = {
  sectionLabel: string;
  versionBadge: string;
  /** Interpolated title — always pass count (fixes IntlError on worksTitle). */
  formatTitle: (count: number) => string;
  subtitle: string;
  sortPrefix: string;
  newCampaign: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filtersAria: string;
  statusChipPrefix: string;
  platformChipPrefix: string;
  originAll: string;
  originCampaigns: string;
  originPosts: string;
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
