import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  keysetAfter,
  keysetSortAt,
  takeKeysetPage,
  type KeysetPageRequest,
} from "@/lib/keyset-page";
import { db } from "@/server/db";
import { campaigns, creditTransactions } from "@/server/db/schema";

export type CreditTransactionFilters = {
  from?: Date;
  to?: Date;
  campaignId?: string;
};

function transactionWhere(workspaceId: string, filters: CreditTransactionFilters = {}) {
  return and(
    eq(creditTransactions.workspaceId, workspaceId),
    filters.from ? gte(creditTransactions.createdAt, filters.from) : undefined,
    filters.to ? lte(creditTransactions.createdAt, filters.to) : undefined,
    filters.campaignId ? eq(creditTransactions.campaignId, filters.campaignId) : undefined
  );
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createCreditTransaction(
  data: {
    userId: string;
    workspaceId: string;
    campaignId?: string | null;
    derivationId?: string | null;
    amount: number;
    type: "usage" | "refund" | "grant" | "purchase";
    description?: string | null;
  },
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .insert(creditTransactions)
    .values({
      userId: data.userId,
      workspaceId: data.workspaceId,
      campaignId: data.campaignId ?? null,
      derivationId: data.derivationId ?? null,
      amount: data.amount,
      type: data.type,
      description: data.description ?? null,
    })
    .returning();
  return rows[0];
}

export async function getCreditTransactionsForWorkspace(
  workspaceId: string,
  filters: CreditTransactionFilters = {}
) {

  return db
    .select({
      id: creditTransactions.id,
      userId: creditTransactions.userId,
      workspaceId: creditTransactions.workspaceId,
      campaignId: creditTransactions.campaignId,
      derivationId: creditTransactions.derivationId,
      amount: creditTransactions.amount,
      type: creditTransactions.type,
      description: creditTransactions.description,
      createdAt: creditTransactions.createdAt,
      campaignName: campaigns.name,
    })
    .from(creditTransactions)
    .leftJoin(campaigns, eq(creditTransactions.campaignId, campaigns.id))
    .where(transactionWhere(workspaceId, filters))
    .orderBy(desc(creditTransactions.createdAt));
}

/**
 * One page of the ledger in `(created_at DESC, id DESC)` order, read with
 * `limit + 1` rows. Exposed as a query so the pg test can record its EXPLAIN.
 */
export function creditTransactionPageQuery(
  workspaceId: string,
  filters: CreditTransactionFilters,
  page: KeysetPageRequest
) {
  return db
    .select({
      id: creditTransactions.id,
      userId: creditTransactions.userId,
      workspaceId: creditTransactions.workspaceId,
      campaignId: creditTransactions.campaignId,
      derivationId: creditTransactions.derivationId,
      amount: creditTransactions.amount,
      type: creditTransactions.type,
      description: creditTransactions.description,
      createdAt: creditTransactions.createdAt,
      campaignName: campaigns.name,
      sortAt: keysetSortAt(creditTransactions.createdAt),
    })
    .from(creditTransactions)
    .leftJoin(campaigns, eq(creditTransactions.campaignId, campaigns.id))
    .where(
      and(
        transactionWhere(workspaceId, filters),
        keysetAfter(creditTransactions.createdAt, creditTransactions.id, page.cursor)
      )
    )
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
    .limit(page.limit + 1);
}

export async function getCreditTransactionPage(
  workspaceId: string,
  filters: CreditTransactionFilters,
  page: KeysetPageRequest
) {
  return takeKeysetPage(await creditTransactionPageQuery(workspaceId, filters, page), page.limit);
}

/**
 * Daily usage over the whole filtered set: debits of type `usage`, summed as
 * absolute values per UTC day (the rule the history chart used on the client).
 */
export async function getCreditUsageSeries(
  workspaceId: string,
  filters: CreditTransactionFilters = {}
) {
  const day = sql<string>`to_char(${creditTransactions.createdAt}, 'YYYY-MM-DD')`;
  return db
    .select({
      date: day,
      amount: sql<number>`SUM(ABS(${creditTransactions.amount}))`.mapWith(Number),
    })
    .from(creditTransactions)
    .where(
      and(
        transactionWhere(workspaceId, filters),
        eq(creditTransactions.type, "usage"),
        lt(creditTransactions.amount, 0)
      )
    )
    .groupBy(day)
    .orderBy(day);
}

export async function getCreditTransactionSummary(
  workspaceId: string,
  filters: CreditTransactionFilters = {}
) {
  const result = await db
    .select({
      totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} < 0 THEN ABS(${creditTransactions.amount}) ELSE 0 END), 0)`,
      totalAdded: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} > 0 THEN ${creditTransactions.amount} ELSE 0 END), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctCampaignCount: sql<number>`COUNT(DISTINCT ${creditTransactions.campaignId})`,
    })
    .from(creditTransactions)
    .where(transactionWhere(workspaceId, filters));

  return (
    result[0] ?? { totalSpent: 0, totalAdded: 0, transactionCount: 0, distinctCampaignCount: 0 }
  );
}

export async function getCampaignsWithTransactions(workspaceId: string) {
  const rows = await db
    .selectDistinct({
      campaignId: creditTransactions.campaignId,
      campaignName: campaigns.name,
    })
    .from(creditTransactions)
    .leftJoin(campaigns, eq(creditTransactions.campaignId, campaigns.id))
    .where(
      and(
        eq(creditTransactions.workspaceId, workspaceId),
        sql`${creditTransactions.campaignId} IS NOT NULL`
      )
    );

  return rows.filter((r) => r.campaignId !== null);
}
