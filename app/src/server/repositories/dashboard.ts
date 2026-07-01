import {
  getCampaigns as getCampaignsByWorkspace,
  getWorkspaceCampaignCount,
  getCampaignPeriodCounts,
} from "./campaign";
import {
  getDerivationDashboardAnalytics,
  getLatestDerivationOutputKeysByCampaignIds,
} from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";

export type AnalyticsPeriod = "week" | "month" | "quarter";
export type CreditChartRange = "7" | "30" | "90";

const CREDIT_RANGE_DAYS: Record<CreditChartRange, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
};

export function parseCreditChartRange(value: string | null | undefined): CreditChartRange {
  if (value === "30" || value === "90") return value;
  return "7";
}

function buildCreditUsageSeries(
  creditTransactions: Awaited<ReturnType<typeof getCreditTransactionsForWorkspace>>,
  creditBalance: number,
  range: CreditChartRange,
  now: Date
): { date: string; used: number; remaining: number }[] {
  const sumUsageBetween = (start: Date, end: Date) =>
    Math.abs(
      creditTransactions
        .filter((t) => t.createdAt >= start && t.createdAt < end && t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );

  if (range === "90") {
    const weeks = 13;
    return Array.from({ length: weeks }, (_, i) => {
      const weekEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (weeks - 1 - i) * 7
      );
      const weekStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() - 6);
      const bucketEnd = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() + 1);

      return {
        date: weekStart.toISOString().split("T")[0],
        used: sumUsageBetween(weekStart, bucketEnd),
        remaining: Math.max(0, creditBalance),
      };
    });
  }

  const days = CREDIT_RANGE_DAYS[range];
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    return {
      date: dateStr,
      used: sumUsageBetween(dayStart, dayEnd),
      remaining: Math.max(0, creditBalance),
    };
  });
}

export interface DashboardStats {
  totalCampaigns: number;
  campaignsChange: number;
  totalDerivations: number;
  derivationsThisMonth: number;
  derivationsChange: number;
  approvedDerivations: number;
  approvalRate: number;
  approvalChange: number;
  avgGenerationTimeSeconds: number;
  creditsRemaining: number;
  creditsUsedThisMonth: number;
  creditsTotal: number;
  creditUsageSeries: { date: string; used: number; remaining: number }[];
  recentCampaigns: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    pieceCount: number;
    approvedCount: number;
    status: string;
    platforms: string[];
    updatedAt: Date;
  }[];
  recentActivity: {
    id: string;
    type: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }[];
  subscription: { planKey: string | null; status: string };
}

function getPeriodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  switch (period) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter":
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function getPreviousPeriodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  switch (period) {
    case "week":
      return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "quarter":
      return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }
}

function percentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getDashboardStats(
  workspaceId: string,
  period: AnalyticsPeriod = "month",
  creditRange: CreditChartRange = "7"
): Promise<DashboardStats> {
  const periodStart = getPeriodStart(period);
  const previousPeriodStart = getPreviousPeriodStart(period);

  const [
    totalCampaigns,
    campaignPeriods,
    derivationAnalytics,
    recentCampaignRows,
    creditGrants,
    subscription,
  ] = await Promise.all([
    getWorkspaceCampaignCount(workspaceId),
    getCampaignPeriodCounts(workspaceId, periodStart, previousPeriodStart),
    getDerivationDashboardAnalytics(workspaceId, periodStart, previousPeriodStart),
    getCampaignsByWorkspace(workspaceId, 5),
    getAvailableCreditGrants(workspaceId),
    getActiveSubscriptionByWorkspace(workspaceId),
  ]);

  const creditBalance = creditGrants.reduce((sum, grant) => sum + grant.remaining, 0);
  const creditsTotal = creditGrants.reduce((sum, grant) => sum + grant.amount, 0);

  const campaignsChange = percentChange(
    campaignPeriods.thisPeriod,
    campaignPeriods.previousPeriod
  );

  const derivationsChange = percentChange(
    derivationAnalytics.derivationsThisPeriod,
    derivationAnalytics.derivationsPreviousPeriod
  );

  const approvalRate =
    derivationAnalytics.totalDerivations > 0
      ? Math.round(
          (derivationAnalytics.approvedDerivations / derivationAnalytics.totalDerivations) * 100
        )
      : 0;

  const approvalRateThisPeriod =
    derivationAnalytics.derivationsThisPeriod > 0
      ? derivationAnalytics.approvedThisPeriod / derivationAnalytics.derivationsThisPeriod
      : 0;
  const approvalRatePreviousPeriod =
    derivationAnalytics.derivationsPreviousPeriod > 0
      ? derivationAnalytics.approvedPreviousPeriod / derivationAnalytics.derivationsPreviousPeriod
      : 0;
  const approvalChange =
    derivationAnalytics.derivationsPreviousPeriod > 0
      ? Math.round((approvalRateThisPeriod - approvalRatePreviousPeriod) * 100)
      : 0;

  const now = new Date();
  const resolvedCreditRange = parseCreditChartRange(creditRange);
  const creditLookbackDays = CREDIT_RANGE_DAYS[resolvedCreditRange];
  const creditTransactions = await getCreditTransactionsForWorkspace(workspaceId, {
    from: new Date(now.getTime() - (creditLookbackDays - 1) * 24 * 60 * 60 * 1000),
    to: now,
  });

  const creditsUsedThisMonth = Math.abs(
    creditTransactions
      .filter((t) => t.createdAt >= periodStart && t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const creditUsageSeries = buildCreditUsageSeries(
    creditTransactions,
    creditBalance,
    resolvedCreditRange,
    now
  );

  const recentActivity = creditTransactions.slice(0, 10).map((t, index) => ({
    id: t.id ?? String(index),
    type: t.amount < 0 ? "credit_used" : "credit_added",
    description: t.description ?? (t.amount < 0 ? "Créditos utilizados" : "Créditos adicionados"),
    metadata: { amount: Math.abs(t.amount), campaignName: t.campaignName },
    createdAt: t.createdAt,
  }));

  const campaignIds = recentCampaignRows.map((c) => c.id);
  const outputKeysByCampaign = await getLatestDerivationOutputKeysByCampaignIds(
    workspaceId,
    campaignIds
  );

  const thumbnailUrlByCampaign = new Map<string, string | null>();
  await Promise.all(
    campaignIds.map(async (campaignId) => {
      const outputKey = outputKeysByCampaign.get(campaignId);
      if (!outputKey) {
        thumbnailUrlByCampaign.set(campaignId, null);
        return;
      }
      try {
        thumbnailUrlByCampaign.set(campaignId, await objectStorage.signedDownloadUrl(outputKey));
      } catch (err) {
        logger.warn("[dashboard] thumbnail presign failed", { campaignId, error: err });
        thumbnailUrlByCampaign.set(campaignId, null);
      }
    })
  );

  return {
    totalCampaigns,
    campaignsChange,
    totalDerivations: derivationAnalytics.totalDerivations,
    derivationsThisMonth: derivationAnalytics.derivationsThisPeriod,
    derivationsChange,
    approvedDerivations: derivationAnalytics.approvedDerivations,
    approvalRate,
    approvalChange,
    avgGenerationTimeSeconds: derivationAnalytics.avgGenerationTimeSeconds,
    creditsRemaining: creditBalance,
    creditsUsedThisMonth,
    creditsTotal,
    creditUsageSeries,
    recentCampaigns: recentCampaignRows.map((c) => ({
      id: c.id,
      name: c.name,
      thumbnailUrl: thumbnailUrlByCampaign.get(c.id) ?? null,
      pieceCount: c.totalDerivations ?? 0,
      approvedCount: c.completedDerivations ?? 0,
      status: c.status,
      platforms: c.platforms ?? [],
      updatedAt: c.updatedAt,
    })),
    recentActivity,
    subscription: {
      planKey: subscription?.planKey ?? null,
      status: subscription?.status ?? "inactive",
    },
  };
}
