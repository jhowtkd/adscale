import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, creditTransactions } from "@/server/db/schema";

export async function createCreditTransaction(data: {
  userId: string;
  workspaceId: string;
  campaignId?: string | null;
  derivationId?: string | null;
  amount: number;
  type: "usage" | "refund" | "grant" | "purchase";
  description?: string | null;
}) {
  const rows = await db
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
  filters?: {
    from?: Date;
    to?: Date;
    campaignId?: string;
  }
) {
  const conditions = [eq(creditTransactions.workspaceId, workspaceId)];

  if (filters?.from) {
    conditions.push(gte(creditTransactions.createdAt, filters.from));
  }
  if (filters?.to) {
    conditions.push(lte(creditTransactions.createdAt, filters.to));
  }
  if (filters?.campaignId) {
    conditions.push(eq(creditTransactions.campaignId, filters.campaignId));
  }

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
    .where(and(...conditions))
    .orderBy(desc(creditTransactions.createdAt));
}

export async function getCreditTransactionSummary(workspaceId: string) {
  const result = await db
    .select({
      totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} < 0 THEN ABS(${creditTransactions.amount}) ELSE 0 END), 0)`,
      totalAdded: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} > 0 THEN ${creditTransactions.amount} ELSE 0 END), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(creditTransactions)
    .where(eq(creditTransactions.workspaceId, workspaceId));

  return result[0] ?? { totalSpent: 0, totalAdded: 0, transactionCount: 0 };
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
