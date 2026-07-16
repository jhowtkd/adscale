import type { Derivation } from "@/lib/mock-data";
import type { WorkspaceState } from "@/lib/hooks/use-campaign-workspace";
import type {
  CampaignWorkspaceV6ViewModel,
  WorkspaceV6BadgeVariant,
  WorkspaceV6StageContext,
} from "./campaign-workspace-v6-types";

type WorkspaceCampaignSource = {
  name: string;
  status: "draft" | "active" | "generating" | "completed" | "failed";
  client?: string | null;
  createdAt: Date;
  audience?: string | null;
  offer?: string | null;
  creativeLevel?: string | null;
  ctaVariants?: string[] | null;
  styleIntensity?: string | null;
  constraints?: string | null;
};

function statusToBadge(status: WorkspaceCampaignSource["status"]): { label: string; variant: WorkspaceV6BadgeVariant } {
  if (status === "completed") return { label: "completed", variant: "success" };
  if (status === "generating") return { label: "generating", variant: "warning" };
  if (status === "active") return { label: "active", variant: "info" };
  if (status === "failed") return { label: "failed", variant: "warning" };
  return { label: "draft", variant: "neutral" };
}

function creativeLevelValue(level?: string | null): number {
  switch (level) {
    case "conservative":
      return 42;
    case "balanced":
      return 62;
    case "bold":
      return 78;
    case "extreme":
      return 92;
    default:
      return 54;
  }
}

function styleIntensityValue(intensity?: string | null): number {
  switch (intensity) {
    case "soft":
      return 48;
    case "medium":
      return 68;
    case "strong":
      return 86;
    default:
      return 58;
  }
}

/**
 * Four user tasks (Phase 6 / item 47):
 * 1 Briefing · 2 Produzir · 3 Revisar · 4 Entregar
 */
export function resolveWorkspaceStage({
  workspaceState,
  derivationCount,
  approvedCount,
  isGenerating,
}: WorkspaceV6StageContext): number {
  if (workspaceState === "setup") return 1;
  if (isGenerating) return 2;
  if (approvedCount > 0) return 4;
  if (derivationCount > 0) return 3;
  return 2;
}

export function mapCampaignWorkspaceToV6View({
  campaign,
  derivations,
  workspaceState,
  isGenerating,
  tStatus,
  tWorkspace,
  formatDate,
}: {
  campaign: WorkspaceCampaignSource;
  derivations: Derivation[];
  workspaceState: WorkspaceState;
  isGenerating?: boolean;
  tStatus: (key: string) => string;
  tWorkspace: (key: string, values?: Record<string, string | number>) => string;
  formatDate: (date: Date) => string;
}): CampaignWorkspaceV6ViewModel {
  const badge = statusToBadge(campaign.status);
  const reviewCount = derivations.filter((d) => d.status === "active" || d.status === "generating").length;
  const approvedCount = derivations.filter((d) => d.status === "approved").length;

  const stages = [
    tWorkspace("stageBriefing"),
    tWorkspace("stageProduce"),
    tWorkspace("stageReview"),
    tWorkspace("stageDeliver"),
  ];
  // Deliver → mission-share (approval/package), not mission-export
  const stageTabs = ["briefing", "generate", "review", "share"] as const;

  const briefingRules = (campaign.constraints ?? "")
    .split(/\n|(?<=[.!?])\s+/)
    .map((rule) => rule.trim())
    .filter(Boolean)
    .slice(0, 4);

  const briefingSliders = [
    { label: tWorkspace("sliderAudience"), value: campaign.audience ? 78 : 42 },
    { label: tWorkspace("sliderOffer"), value: campaign.offer ? 80 : 50 },
    { label: tWorkspace("sliderLegibility"), value: creativeLevelValue(campaign.creativeLevel) },
    { label: tWorkspace("sliderUrgency"), value: campaign.ctaVariants?.length ? 72 : 48 },
    { label: tWorkspace("sliderProximity"), value: styleIntensityValue(campaign.styleIntensity) },
  ];

  return {
    name: campaign.name,
    status: tStatus(badge.label),
    statusVariant: badge.variant,
    meta: tWorkspace("meta", {
      date: formatDate(campaign.createdAt),
      client: campaign.client ?? "—",
      reviewCount,
    }),
    currentStage: resolveWorkspaceStage({
      workspaceState,
      derivationCount: derivations.length,
      approvedCount,
      isGenerating,
    }),
    stages,
    stageTabs: [...stageTabs],
    briefingSliders,
    briefingRules,
  };
}
