import type { Derivation } from "@/lib/mock-data";
import type { WorkspaceState } from "@/lib/hooks/use-campaign-workspace";
import { scoreCappedForDisplay } from "@/lib/derivation-display";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";
import type {
  CampaignWorkspaceV6ViewModel,
  WorkspaceV6BadgeVariant,
  WorkspaceV6DerivationCard,
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

function derivationStatusToBadge(status: string): WorkspaceV6BadgeVariant {
  if (status === "completed" || status === "approved") return "success";
  if (status === "generating" || status === "processing" || status === "queued") return "warning";
  if (status === "active") return "info";
  return "neutral";
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

export function resolveWorkspaceStage({
  workspaceState,
  derivationCount,
  reviewCount,
  approvedCount,
  isGenerating,
}: WorkspaceV6StageContext): number {
  if (workspaceState === "setup") return 1;
  // While derivations are actively generating, nothing is reviewable yet —
  // keep the stage-pill on Derive (2) instead of advancing to Review.
  if (isGenerating) return 2;
  // In "trabalho", the stage is derived from derivation progress.
  if (reviewCount > 0) return 3;
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
  const approvedCount = derivations.filter((d) => d.status === "completed" || d.status === "approved").length;

  const stages = [
    tWorkspace("stagePilot"),
    tWorkspace("stageDerive"),
    tWorkspace("stageReview"),
    tWorkspace("stageApprove"),
    tWorkspace("stageDelivery"),
  ];

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

  const derivationCards: WorkspaceV6DerivationCard[] = derivations.slice(0, 8).map((derivation, index) => {
    const score = scoreCappedForDisplay(derivation.qualityScore, derivation.qualityVerdict);
    const statusKey = derivation.status;
    const knownStatuses = new Set(["draft", "active", "generating", "completed", "failed", "approved"]);
    const art = derivation.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 8) || "AD";

    return {
      id: derivation.id,
      art,
      title: derivation.name,
      variations: tWorkspace("derivationVariations", { count: 1 }),
      version: `v${(derivation.variantIndex ?? 0) + 1}`,
      score,
      status: tStatus(knownStatuses.has(statusKey) ? statusKey : "draft"),
      statusVariant: derivationStatusToBadge(derivation.status),
      gradient: pickSurfaceGradient(index),
      href: undefined,
    };
  });

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
      reviewCount,
      approvedCount,
      isGenerating,
    }),
    stages,
    briefingSliders,
    briefingRules,
    derivations: derivationCards,
  };
}
