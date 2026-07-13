import type { WorkspaceState } from "@/lib/hooks/use-campaign-workspace";

export type WorkspaceV6BadgeVariant = "success" | "warning" | "info" | "neutral";

export type WorkspaceV6BriefingSlider = {
  label: string;
  value: number;
};

export type WorkspaceV6DerivationCard = {
  id: string;
  art: string;
  title: string;
  variations: string;
  version: string;
  score: number | null;
  status: string;
  statusVariant: WorkspaceV6BadgeVariant;
  gradient: string;
  href?: string;
};

/** Deep-link tab keys for clickable stage navigation (1–4). Phase 6 / item 47. */
export type WorkspaceStageNavTab = "briefing" | "generate" | "review" | "export";

export type CampaignWorkspaceV6ViewModel = {
  name: string;
  status: string;
  statusVariant: WorkspaceV6BadgeVariant;
  meta: string;
  currentStage: number;
  stages: string[];
  /** Parallel to `stages`: which deep-link each phase scrolls to. */
  stageTabs?: WorkspaceStageNavTab[];
  briefingSliders: WorkspaceV6BriefingSlider[];
  briefingRules: string[];
  derivations: WorkspaceV6DerivationCard[];
};

export type CampaignWorkspaceV6Labels = {
  backToCampaigns: string;
  sendFeedback: string;
  deleteCampaign: string;
  stagesAria: string;
  briefingTitle: string;
  briefingVersion: string;
  rulesTitle: string;
  derivationsTitle: string;
  viewAllDerivations: string;
  openDerivation: string;
  moreOptionsFor: (title: string) => string;
};

export type WorkspaceV6StageContext = {
  workspaceState: WorkspaceState;
  derivationCount: number;
  reviewCount: number;
  approvedCount: number;
  /**
   * True while derivations are actively being generated (queued/processing).
   * During generation nothing is reviewable yet, so the stage stays on Derive.
   */
  isGenerating?: boolean;
};
