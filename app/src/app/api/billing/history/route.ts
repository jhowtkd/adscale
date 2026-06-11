import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignsWithTransactions,
  getCreditTransactionsForWorkspace,
  getCreditTransactionSummary,
} from "@/server/repositories/credit-transactions";
import {
  getAvailableCreditGrants,
  getCreditGrantHistoryForWorkspace,
} from "@/server/repositories/billing";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const campaignId = searchParams.get("campaignId") ?? undefined;

    const filters = {
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
      campaignId,
    };

    const [transactions, summary, grants, grantHistory, campaigns] = await Promise.all([
      getCreditTransactionsForWorkspace(workspace.id, filters),
      getCreditTransactionSummary(workspace.id),
      getAvailableCreditGrants(workspace.id),
      getCreditGrantHistoryForWorkspace(workspace.id),
      getCampaignsWithTransactions(workspace.id),
    ]);

    const creditBalance = grants.reduce((total, grant) => total + grant.remaining, 0);

    const campaignsWithTransactions = campaigns.map((c) => ({
      id: c.campaignId,
      name: c.campaignName ?? "—",
    }));

    const averagePerCampaign =
      campaignsWithTransactions.length > 0
        ? Math.round(summary.totalSpent / campaignsWithTransactions.length)
        : 0;

    return NextResponse.json({
      grants: grantHistory.map((grant) => ({
        id: grant.id,
        source: grant.source,
        amount: grant.amount,
        remaining: grant.remaining,
        createdAt: grant.createdAt?.toISOString() ?? null,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        userId: t.userId,
        workspaceId: t.workspaceId,
        campaignId: t.campaignId,
        campaignName: t.campaignName ?? null,
        derivationId: t.derivationId,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt?.toISOString() ?? null,
      })),
      summary: {
        totalSpent: summary.totalSpent,
        remainingCredits: creditBalance,
        averagePerCampaign,
        transactionCount: summary.transactionCount,
      },
      campaigns: campaignsWithTransactions,
    });
  } catch (error) {
    return handleApiError(error, "billing.history.GET");
  }
}
