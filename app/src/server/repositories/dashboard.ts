import {
  getCampaigns as getCampaignsByWorkspace,
  getWorkspaceCampaignCount,
  getCampaignPeriodCounts,
} from "./campaign";
import { getDerivationDashboardAnalytics } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";

export type AnalyticsPeriod = "week" | "month" | "quarter";

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
  period: AnalyticsPeriod = "month"
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
  const creditTransactions = await getCreditTransactionsForWorkspace(workspaceId, {
    from: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    to: now,
  });

  const creditsUsedThisMonth = Math.abs(
    creditTransactions
      .filter((t) => t.createdAt >= periodStart && t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const creditUsageSeries = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const used = Math.abs(
      creditTransactions
        .filter((t) => t.createdAt >= dayStart && t.createdAt < dayEnd && t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );

    return {
      date: dateStr,
      used,
      remaining: Math.max(0, creditBalance),
    };
  });

  const recentActivity = creditTransactions.slice(0, 10).map((t, index) => ({
    id: t.id ?? String(index),
    type: t.amount < 0 ? "credit_used" : "credit_added",
    description: t.description ?? (t.amount < 0 ? "Créditos utilizados" : "Créditos adicionados"),
    metadata: { amount: Math.abs(t.amount), campaignName: t.campaignName },
    createdAt: t.createdAt,
  }));

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
      thumbnailUrl: null,
      pieceCount: c.totalDerivations ?? 0,
      approvedCount: c.completedDerivations ?? 0,
      status: c.status,
      platforms: [],
      updatedAt: c.updatedAt,
    })),
    recentActivity,
    subscription: {
      planKey: subscription?.planKey ?? null,
      status: subscription?.status ?? "inactive",
    },
  };
}
