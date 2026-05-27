import { getCampaigns as getCampaignsByWorkspace } from "./campaign";
import { getDerivationsByWorkspace } from "./derivation";
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

export async function getDashboardStats(
  workspaceId: string,
  period: AnalyticsPeriod = "month"
): Promise<DashboardStats> {
  const campaigns = await getCampaignsByWorkspace(workspaceId);
  const derivations = await getDerivationsByWorkspace(workspaceId);
  const creditGrants = await getAvailableCreditGrants(workspaceId);
  const subscription = await getActiveSubscriptionByWorkspace(workspaceId);

  const creditBalance = creditGrants.reduce((sum, grant) => sum + grant.remaining, 0);
  const creditsTotal = creditGrants.reduce((sum, grant) => sum + grant.amount, 0);

  const now = new Date();
  const periodStart = getPeriodStart(period);
  const previousPeriodStart = getPreviousPeriodStart(period);

  // Derivations analytics
  const totalDerivations = derivations.length;
  const derivationsThisPeriod = derivations.filter((d) => d.createdAt >= periodStart);
  const derivationsThisMonth = derivationsThisPeriod.length;
  
  const derivationsPreviousPeriod = derivations.filter(
    (d) => d.createdAt >= previousPeriodStart && d.createdAt < periodStart
  );
  const derivationsChange = derivationsPreviousPeriod.length > 0
    ? Math.round(((derivationsThisPeriod.length - derivationsPreviousPeriod.length) / derivationsPreviousPeriod.length) * 100)
    : 0;

  // Approval analytics
  const approvedDerivations = derivations.filter((d) => d.status === "approved").length;
  const approvalRate = totalDerivations > 0 ? Math.round((approvedDerivations / totalDerivations) * 100) : 0;
  
  const approvedThisPeriod = derivationsThisPeriod.filter((d) => d.status === "approved").length;
  const approvedPreviousPeriod = derivationsPreviousPeriod.filter((d) => d.status === "approved").length;
  const approvalChange = derivationsPreviousPeriod.length > 0
    ? Math.round(((approvedThisPeriod / Math.max(derivationsThisPeriod.length, 1)) - (approvedPreviousPeriod / Math.max(derivationsPreviousPeriod.length, 1))) * 100)
    : 0;

  // Average generation time (for completed derivations)
  const completedDerivations = derivations.filter(
    (d) => d.status === "completed" || d.status === "approved"
  );
  const avgGenerationTimeSeconds = completedDerivations.length > 0
    ? Math.round(
        completedDerivations.reduce((sum, d) => {
          const duration = d.updatedAt.getTime() - d.createdAt.getTime();
          return sum + Math.max(0, duration);
        }, 0) / completedDerivations.length / 1000
      )
    : 0;

  // Campaign change
  const campaignsThisPeriod = campaigns.filter((c) => c.createdAt >= periodStart).length;
  const campaignsPreviousPeriod = campaigns.filter(
    (c) => c.createdAt >= previousPeriodStart && c.createdAt < periodStart
  ).length;
  const campaignsChange = campaignsPreviousPeriod > 0
    ? Math.round(((campaignsThisPeriod - campaignsPreviousPeriod) / campaignsPreviousPeriod) * 100)
    : 0;

  // Real credit usage data
  const creditTransactions = await getCreditTransactionsForWorkspace(workspaceId, {
    from: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    to: now,
  });

  const creditsUsedThisMonth = Math.abs(
    creditTransactions
      .filter((t) => t.createdAt >= periodStart && t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  );

  // Build daily credit usage series for last 7 days
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

  // Build recent activity from real data
  const recentActivity = creditTransactions
    .slice(0, 10)
    .map((t, index) => ({
      id: t.id ?? String(index),
      type: t.amount < 0 ? "credit_used" : "credit_added",
      description: t.description ?? (t.amount < 0 ? "Créditos utilizados" : "Créditos adicionados"),
      metadata: { amount: Math.abs(t.amount), campaignName: t.campaignName },
      createdAt: t.createdAt,
    }));

  return {
    totalCampaigns: campaigns.length,
    campaignsChange,
    totalDerivations,
    derivationsThisMonth,
    derivationsChange,
    approvedDerivations,
    approvalRate,
    approvalChange,
    avgGenerationTimeSeconds,
    creditsRemaining: creditBalance,
    creditsUsedThisMonth,
    creditsTotal,
    creditUsageSeries,
    recentCampaigns: campaigns.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      thumbnailUrl: null,
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
