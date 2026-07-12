import { formatCampaignPlatforms } from "@/lib/campaign-platforms";
import type { CampaignTemplate } from "@/lib/hooks/use-templates";
import type { DashboardStats } from "@/server/repositories/dashboard";
import { buildCreatePostQuickTool } from "@/components/dashboard/quick-tool-recipes";
import type {
  DashboardV6ActivityRow,
  DashboardV6Hero,
  DashboardV6Kpi,
  DashboardV6Recipe,
  DashboardV6ViewModel,
} from "./dashboard-v6-types";

type RelativeTimeLabels = {
  now: string;
  minutes: (count: number) => string;
  hours: (count: number) => string;
  oneDay: string;
  days: (count: number) => string;
};

type BriefingKeyLabels = {
  objective: string;
  audience: string;
  tone: string;
  platforms: string;
  cta: string;
  constraints: string;
};

function formatCredits(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function formatTrend(change: number, suffix: string): { trend: string; trendDir: "up" | "down" | "neutral" } {
  if (change > 0) {
    return { trend: `+${change}% ${suffix}`, trendDir: "up" };
  }
  if (change < 0) {
    return { trend: `${change}% ${suffix}`, trendDir: "down" };
  }
  return { trend: `0% ${suffix}`, trendDir: "neutral" };
}

function statusToClass(status: string): DashboardV6ActivityRow["statusClass"] {
  if (status === "generating" || status === "processing" || status === "queued") return "running";
  if (status === "active") return "review";
  if (status === "completed" || status === "approved") return "approved";
  return "draft";
}

function statusLabel(status: string, tStatus: (key: string) => string): string {
  const key = status as "draft" | "active" | "generating" | "completed" | "failed";
  if (key in { draft: 1, active: 1, generating: 1, completed: 1, failed: 1 }) {
    return tStatus(key);
  }
  return status;
}

function formatRelativeTime(date: Date | string, labels: RelativeTimeLabels, now = new Date()): string {
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return labels.now;
  if (diffMin < 60) return labels.minutes(diffMin);
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return labels.hours(diffH);
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? labels.oneDay : labels.days(diffD);
}

function pickHero(
  stats: DashboardStats,
  tStatus: (key: string) => string,
  tHero: (key: string, values?: Record<string, string | number>) => string,
): DashboardV6Hero | null {
  const candidate =
    stats.recentCampaigns.find((c) => c.status === "generating") ??
    stats.recentCampaigns.find((c) => c.status === "active") ??
    stats.recentCampaigns[0];

  if (!candidate) return null;

  const badgeClass =
    candidate.status === "generating"
      ? "warning"
      : candidate.status === "active"
        ? "info"
        : candidate.status === "completed"
          ? "success"
          : "neutral";

  const badge =
    candidate.status === "generating"
      ? tStatus("generating")
      : candidate.status === "active"
        ? tHero("heroInReview")
        : candidate.status === "completed"
          ? tStatus("completed")
          : tHero("heroPilot");

  const briefingProgress =
    candidate.pieceCount > 0 ? Math.min(100, Math.round((candidate.approvedCount / candidate.pieceCount) * 100)) : null;

  return {
    id: candidate.id,
    name: candidate.name,
    badge,
    badgeClass,
    description: tHero("heroDescription", {
      pieceCount: candidate.pieceCount,
      approvedCount: candidate.approvedCount,
    }),
    briefingProgress,
    variationsDone: candidate.approvedCount,
    variationsTotal: candidate.pieceCount,
    approved: candidate.approvedCount,
    credits: stats.creditsRemaining,
  };
}

export function mapDashboardToV6View({
  stats,
  firstName,
  templates,
  tKpi,
  tStatus,
  tHero,
  tBriefing,
  tRelative,
  authorName,
  templateFallback,
  varsCount,
}: {
  stats: DashboardStats;
  firstName: string;
  templates: CampaignTemplate[];
  tKpi: (key: string) => string;
  tStatus: (key: string) => string;
  tHero: (key: string, values?: Record<string, string | number>) => string;
  tBriefing: (key: keyof BriefingKeyLabels) => string;
  tRelative: RelativeTimeLabels;
  authorName: string;
  templateFallback: string;
  varsCount: (count: number) => string;
}): DashboardV6ViewModel {
  const campaignsTrend = formatTrend(stats.campaignsChange, tKpi("vsLastMonth"));
  const derivationsTrend = formatTrend(stats.derivationsChange, tKpi("vsLastMonth"));
  const approvalTrend = formatTrend(Math.round(stats.approvalChange), tKpi("vsLastMonth"));

  const kpis: DashboardV6Kpi[] = [
    {
      label: tKpi("campaigns"),
      value: String(stats.totalCampaigns),
      trend: campaignsTrend.trend,
      trendDir: campaignsTrend.trendDir,
    },
    {
      label: tKpi("totalDerivations"),
      value: String(stats.totalDerivations),
      trend: derivationsTrend.trend,
      trendDir: derivationsTrend.trendDir,
    },
    {
      label: tKpi("approval"),
      value: `${Math.round(stats.approvalRate)}%`,
      trend: approvalTrend.trend,
      trendDir: approvalTrend.trendDir,
    },
    {
      label: tKpi("credits"),
      value: formatCredits(stats.creditsRemaining),
      trend: tKpi("usedThisMonth"),
      trendDir: "neutral",
    },
  ];

  const inReviewCount = stats.recentCampaigns.filter((c) => c.status === "active").length;
  const readyToApproveCount = stats.recentCampaigns.reduce(
    (sum, c) => sum + Math.max(0, c.pieceCount - c.approvedCount),
    0,
  );

  const activity: DashboardV6ActivityRow[] = stats.recentCampaigns.slice(0, 6).map((campaign, index) => ({
    id: campaign.id,
    href: `/campaigns/${campaign.id}`,
    thumb: ["🌿", "🥤", "💊", "🎯", "✨", "📣"][index % 6],
    name: campaign.name,
    subtitle: `${authorName} · ${formatRelativeTime(campaign.updatedAt, tRelative)}`,
    status: statusLabel(campaign.status, tStatus),
    statusClass: statusToClass(campaign.status),
    platforms: formatCampaignPlatforms(campaign.platforms) ?? "—",
    variations: `${campaign.approvedCount} / ${campaign.pieceCount}`,
    updated: formatRelativeTime(campaign.updatedAt, tRelative),
  }));

  const createPost: DashboardV6Recipe = buildCreatePostQuickTool((key) => tHero(key));

  const recipes: DashboardV6Recipe[] = [createPost, ...templates.slice(0, 4).map((template) => ({
    id: template.id,
    icon: "🧪",
    name: template.name,
    desc: template.description ?? template.objective ?? template.audience ?? templateFallback,
    count: template.targetFormats?.length ? varsCount(template.targetFormats.length) : "—",
    href: `/templates`,
  }))].slice(0, 4);

  const hero = pickHero(stats, tStatus, tHero);
  const primaryTemplate = templates[0];
  const briefingRows = primaryTemplate
    ? [
        { key: tBriefing("objective"), value: primaryTemplate.objective ?? "—" },
        { key: tBriefing("audience"), value: primaryTemplate.audience ?? "—" },
        { key: tBriefing("tone"), value: primaryTemplate.tone ?? "—" },
        {
          key: tBriefing("platforms"),
          value: primaryTemplate.platforms?.length ? primaryTemplate.platforms.join(", ") : "—",
        },
        { key: tBriefing("cta"), value: primaryTemplate.offer ?? "—" },
        { key: tBriefing("constraints"), value: primaryTemplate.constraints ?? "—" },
      ]
    : [];

  return {
    firstName,
    inReviewCount,
    readyToApproveCount,
    kpis,
    hero,
    activity,
    recipes,
    briefingRows,
    activeBriefingCampaignId: hero?.id ?? null,
  };
}