import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import {
  getCampaignsWithTransactions,
  getCreditTransactionsForWorkspace,
  getCreditTransactionSummary,
  type CreditTransactionFilters,
} from "@/server/repositories/credit-transactions";
import { getCreditGrantHistoryForWorkspace } from "@/server/repositories/billing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Reject non-existent calendar dates instead of silently normalizing them.
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseInstantParam(value: string, isEnd: boolean): Date | null {
  if (DATE_ONLY_PATTERN.test(value)) {
    // Date-only stays on the strict calendar path: an impossible date is
    // invalid input, never a silently normalized neighbor day.
    const dateOnly = parseDateOnly(value);
    if (!dateOnly) return null;
    return isEnd
      ? new Date(Date.UTC(dateOnly.year, dateOnly.month - 1, dateOnly.day, 23, 59, 59, 999))
      : new Date(Date.UTC(dateOnly.year, dateOnly.month - 1, dateOnly.day, 0, 0, 0, 0));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const campaignId = searchParams.get("campaignId") ?? undefined;

    if (campaignId !== undefined && !UUID_PATTERN.test(campaignId)) {
      return apiError("invalidInput", 400);
    }

    const from = fromParam ? (parseInstantParam(fromParam, false) ?? "invalid") : undefined;
    const to = toParam ? (parseInstantParam(toParam, true) ?? "invalid") : undefined;
    if (from === "invalid" || to === "invalid") {
      return apiError("invalidInput", 400);
    }
    if (from && to && from > to) {
      return apiError("invalidInput", 400);
    }

    const filters: CreditTransactionFilters = { from, to, campaignId };

    const [transactions, summary, access, grantHistory, campaigns] = await Promise.all([
      getCreditTransactionsForWorkspace(workspace.id, filters),
      getCreditTransactionSummary(workspace.id, filters),
      getWorkspaceBillingAccess(workspace.id),
      getCreditGrantHistoryForWorkspace(workspace.id),
      getCampaignsWithTransactions(workspace.id),
    ]);

    const distinctCampaigns = Number(summary.distinctCampaignCount ?? 0);
    const averagePerCampaign =
      distinctCampaigns > 0 ? Math.round(Number(summary.totalSpent) / distinctCampaigns) : 0;

    const campaignsWithTransactions = campaigns.map((c) => ({
      id: c.campaignId,
      name: c.campaignName ?? "—",
    }));

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
        totalSpent: Number(summary.totalSpent),
        remainingCredits: access.creditBalance,
        averagePerCampaign,
        transactionCount: Number(summary.transactionCount),
      },
      campaigns: campaignsWithTransactions,
    });
  } catch (error) {
    return handleApiError(error, "billing.history.GET");
  }
}
