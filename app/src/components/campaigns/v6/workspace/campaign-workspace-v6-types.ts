import type { WorkspaceState } from "@/lib/hooks/use-campaign-workspace";

export type WorkspaceV6BadgeVariant = "success" | "warning" | "info" | "neutral";

export type WorkspaceV6BriefingSlider = {
  label: string;
  value: number;
};

/** Deep-link tab keys for clickable stage navigation (1–4). Phase 6 / item 47. */
export type WorkspaceStageNavTab = "briefing" | "generate" | "review" | "share";

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
};

export type CampaignWorkspaceV6Labels = {
  backToCampaigns: string;
  deleteCampaign: string;
  stagesAria: string;
  briefingTitle: string;
  briefingVersion: string;
  rulesTitle: string;
};

export type WorkspaceV6StageContext = {
  workspaceState: WorkspaceState;
  derivationCount: number;
  approvedCount: number;
  /**
   * True while derivations are actively being generated (queued/processing).
   * During generation nothing is reviewable yet, so the stage stays on Derive.
   */
  isGenerating?: boolean;
};
