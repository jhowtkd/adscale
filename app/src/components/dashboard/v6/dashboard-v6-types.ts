export type DashboardV6Kpi = {
  label: string;
  value: string;
  trend: string;
  trendDir: "up" | "down" | "neutral";
};

export type DashboardV6Hero = {
  id: string;
  name: string;
  badge: string;
  badgeClass: DashboardStatusTone;
  description: string;
  briefingProgress: number | null;
  variationsDone: number;
  variationsTotal: number;
  approved: number;
  credits: number;
};

export type DashboardV6ActivityRow = {
  id: string;
  href: string;
  thumb: string;
  name: string;
  subtitle: string;
  status: string;
  statusClass: DashboardStatusTone;
  platforms: string;
  variations: string;
  updated: string;
};

export type DashboardV6Recipe = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  count: string;
  href: string;
};

export type DashboardV6BriefingRow = {
  key: string;
  value: string;
};

export type DashboardV6ViewModel = {
  firstName: string;
  inReviewCount: number;
  readyToApproveCount: number;
  kpis: DashboardV6Kpi[];
  hero: DashboardV6Hero | null;
  activity: DashboardV6ActivityRow[];
  recipes: DashboardV6Recipe[];
  briefingRows: DashboardV6BriefingRow[];
  activeBriefingCampaignId: string | null;
};

export type DashboardV6Labels = {
  greeting: string;
  kpisAria: string;
  heroProduction: string;
  openCampaign: string;
  viewBriefing: string;
  metaBriefing: string;
  metaVariations: string;
  metaApproved: string;
  metaCredits: string;
  activityTitle: string;
  activitySubtitle: string;
  viewAll: string;
  tableCampaign: string;
  tableStatus: string;
  tablePlatform: string;
  tableVariations: string;
  tableUpdated: string;
  recipesTitle: string;
  recipesSubtitle: string;
  briefingTitle: string;
  editBriefing: string;
  goToActions: string;
  activityEmptyTitle: string;
  activityEmptyDescription: string;
  activityEmptyAction: string;
  recipesEmptyTitle: string;
  recipesEmptyDescription: string;
  recipesEmptyAction: string;
  templatesLink: string;
  briefingEmptyTitle: string;
  briefingEmptyDescription: string;
  briefingEmptyAction: string;
};
import type { DashboardStatusTone } from "../campaign-status-config";
