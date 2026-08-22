import { formatCampaignPlatforms } from "@/lib/campaign-platforms";
import type { CampaignTemplate } from "@/lib/hooks/use-templates";
import type { DashboardStats } from "@/server/repositories/dashboard";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import { buildCreatePostQuickTool } from "@/components/dashboard/quick-tool-recipes";
import { getCampaignStatusTone } from "@/components/dashboard/campaign-status-config";
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
  return getCampaignStatusTone(status);
}

function statusLabel(status: string, tStatus: (key: string) => string): string {
  const key = status as "draft" | "active" | "generating" | "completed" | "failed";
  if (key in { draft: 1, active: 1, generating: 1, completed: 1, failed: 1 }) {
    return tStatus(key);
  }
  return status;
}

function dashboardStatusForCanonicalState(state: string): string {
  if (state === "briefing" || state === "reviewing") return "review";
  if (state === "intending") return "draft";
  if (state === "delivered") return "completed";
  return state;
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
  canonicalWorks: CanonicalWorkSummary[] | undefined,
  tStatus: (key: string) => string,
  tHero: (key: string, values?: Record<string, string | number>) => string,
): DashboardV6Hero | null {
  const canonicalCandidate =
    canonicalWorks?.find((work) => work.state === "generating") ??
    canonicalWorks?.find((work) => work.state === "reviewing") ??
    canonicalWorks?.[0];

  if (canonicalCandidate) {
    const resultCount = canonicalCandidate.resultCount ?? 0;
    const badge =
      canonicalCandidate.state === "generating"
        ? tStatus("generating")
        : canonicalCandidate.state === "failed"
          ? tStatus("failed")
          : canonicalCandidate.state === "reviewing"
            ? tHero("heroInReview")
            : canonicalCandidate.state === "approved"
              ? tStatus("approved")
              : canonicalCandidate.state === "delivered"
                ? tStatus("completed")
                : tHero("heroPilot");
    const briefingHref =
      canonicalCandidate.originKind === "campaign"
        ? `${canonicalCandidate.resumeHref}?tab=brief`
        : canonicalCandidate.resumeHref;

    return {
      id: canonicalCandidate.originId,
      href: canonicalCandidate.resumeHref,
      briefingHref,
      name: canonicalCandidate.name,
      badge,
      badgeClass: getCampaignStatusTone(dashboardStatusForCanonicalState(canonicalCandidate.state)),
      description: tHero("heroWorkDescription", { resultCount }),
      briefingProgress: null,
      variationsDone: resultCount,
      variationsTotal: resultCount,
      approved: null,
    };
  }
  return null;
}

export function mapDashboardToV6View({
  stats,
  canonicalWorks,
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
  canonicalWorks?: CanonicalWorkSummary[];
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
    platforms: formatCampaignPlatforms(campaign.platforms) ?? tHero("platformUnavailable"),
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

  const hero = pickHero(canonicalWorks, tStatus, tHero);
  const primaryTemplate = templates[0];
  const briefingRows = primaryTemplate
    ? [
        { key: tBriefing("objective"), value: primaryTemplate.objective },
        { key: tBriefing("audience"), value: primaryTemplate.audience },
        { key: tBriefing("tone"), value: primaryTemplate.tone },
        {
          key: tBriefing("platforms"),
          value: primaryTemplate.platforms?.join(", "),
        },
        { key: tBriefing("cta"), value: primaryTemplate.offer },
        { key: tBriefing("constraints"), value: primaryTemplate.constraints },
      ].flatMap(({ key, value }) => value?.trim() ? [{ key, value: value.trim() }] : [])
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
  };
}
