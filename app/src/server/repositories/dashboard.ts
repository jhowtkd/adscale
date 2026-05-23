import { getCampaigns as getCampaignsByWorkspace } from "./campaign";
import { getDerivationsByWorkspace } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";

export interface DashboardStats {
  totalCampaigns: number;
  campaignsChange: number;
  derivationsThisMonth: number;
  derivationsChange: number;
  approvalRate: number;
  approvalChange: number;
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

export async function getDashboardStats(workspaceId: string): Promise<DashboardStats> {
  const campaigns = await getCampaignsByWorkspace(workspaceId);
  const derivations = await getDerivationsByWorkspace(workspaceId);
  const creditGrants = await getAvailableCreditGrants(workspaceId);
  const subscription = await getActiveSubscriptionByWorkspace(workspaceId);

  const creditBalance = creditGrants.reduce((sum, grant) => sum + grant.remaining, 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const derivationsThisMonth = derivations.filter(
    (d) => d.createdAt >= startOfMonth
  ).length;

  const totalDerivations = derivations.length;
  const approvedDerivations = derivations.filter((d) => d.status === "approved").length;
  const approvalRate = totalDerivations > 0 ? Math.round((approvedDerivations / totalDerivations) * 100) : 0;

  const creditUsageSeries = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    used: Math.floor(Math.random() * 20),
    remaining: 100 - Math.floor(Math.random() * 20),
  }));

  const recentActivity = [
    {
      id: "1",
      type: "derivation_approved",
      description: "Derivação #3 aprovada em Verão 2025",
      metadata: {},
      createdAt: new Date(),
    },
  ];

  return {
    totalCampaigns: campaigns.length,
    campaignsChange: 0,
    derivationsThisMonth,
    derivationsChange: 0,
    approvalRate,
    approvalChange: 0,
    creditsRemaining: creditBalance,
    creditsUsedThisMonth: 0,
    creditsTotal: 1000,
    creditUsageSeries,
    recentCampaigns: campaigns.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      thumbnailUrl: null,
      pieceCount: 0,
      approvedCount: 0,
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
