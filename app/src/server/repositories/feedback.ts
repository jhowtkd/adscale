import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import { feedbackReports } from "../db/schema";
import type { FeedbackAssetRef } from "../feedback/validate-refs";

export type FeedbackStatus = "new" | "reviewing" | "resolved" | "archived";
export type FeedbackType = "bug" | "suggestion" | "question" | "other";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";
export type FeedbackCategory =
  | "ui"
  | "generation"
  | "billing"
  | "performance"
  | "mission"
  | "other";
export type FeedbackContextKind = "global" | "campaign" | "derivation";

export interface CreateFeedbackReportInput {
  workspaceId: string;
  userId: string;
  type: FeedbackType;
  severity: FeedbackSeverity;
  category: FeedbackCategory;
  message: string;
  followUpAllowed?: boolean;
  route?: string;
  contextKind?: FeedbackContextKind;
  campaignId?: string | null;
  derivationId?: string | null;
  assetRefs?: FeedbackAssetRef[];
  diagnosticContext?: Record<string, unknown>;
  sentryCorrelation?: Record<string, unknown>;
  contextCompleteness?: Record<string, unknown>;
}

export async function createFeedbackReport(input: CreateFeedbackReportInput) {
  const [report] = await db
    .insert(feedbackReports)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: "new",
      type: input.type,
      severity: input.severity,
      category: input.category,
      message: input.message,
      followUpAllowed: input.followUpAllowed ?? false,
      route: input.route,
      contextKind: input.contextKind ?? "global",
      campaignId: input.campaignId ?? null,
      derivationId: input.derivationId ?? null,
      assetRefs: input.assetRefs ?? [],
      diagnosticContext: input.diagnosticContext ?? {},
      sentryCorrelation: input.sentryCorrelation ?? {},
      contextCompleteness: input.contextCompleteness ?? {},
    })
    .returning();

  return report;
}

export async function getLatestOpenFeedbackReportForDerivation(
  workspaceId: string,
  derivationId: string
): Promise<{ category: FeedbackCategory } | null> {
  const [report] = await db
    .select({ category: feedbackReports.category })
    .from(feedbackReports)
    .where(
      and(
        eq(feedbackReports.workspaceId, workspaceId),
        eq(feedbackReports.derivationId, derivationId),
        inArray(feedbackReports.status, ["new", "reviewing"])
      )
    )
    .orderBy(desc(feedbackReports.createdAt))
    .limit(1);

  if (!report) return null;
  return { category: report.category as FeedbackCategory };
}

export async function getFeedbackReportById(
  workspaceId: string,
  reportId: string
) {
  const [report] = await db
    .select()
    .from(feedbackReports)
    .where(
      and(
        eq(feedbackReports.id, reportId),
        eq(feedbackReports.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return report ?? null;
}

export interface FeedbackListFilters {
  workspaceId?: string;
  status?: FeedbackStatus;
  type?: FeedbackType;
  severity?: FeedbackSeverity;
  category?: FeedbackCategory;
  route?: string;
  campaignId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function listFeedbackReports(filters: FeedbackListFilters = {}) {
  const conditions = [];

  if (filters.workspaceId) {
    conditions.push(eq(feedbackReports.workspaceId, filters.workspaceId));
  }
  if (filters.status) {
    conditions.push(eq(feedbackReports.status, filters.status));
  }
  if (filters.type) {
    conditions.push(eq(feedbackReports.type, filters.type));
  }
  if (filters.severity) {
    conditions.push(eq(feedbackReports.severity, filters.severity));
  }
  if (filters.category) {
    conditions.push(eq(feedbackReports.category, filters.category));
  }
  if (filters.route) {
    conditions.push(sql`${feedbackReports.route} ILIKE ${`%${filters.route}%`}`);
  }
  if (filters.campaignId) {
    conditions.push(eq(feedbackReports.campaignId, filters.campaignId));
  }
  if (filters.from) {
    conditions.push(gte(feedbackReports.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(feedbackReports.createdAt, filters.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(feedbackReports)
    .where(whereClause)
    .orderBy(desc(feedbackReports.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
}

export async function updateFeedbackReportStatus(
  workspaceId: string,
  reportId: string,
  status: FeedbackStatus,
  updates?: {
    internalNotes?: string | null;
    resolutionSummary?: string | null;
  }
) {
  const [report] = await db
    .update(feedbackReports)
    .set({
      status,
      internalNotes: updates?.internalNotes,
      resolutionSummary: updates?.resolutionSummary,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(feedbackReports.id, reportId),
        eq(feedbackReports.workspaceId, workspaceId)
      )
    )
    .returning();

  return report ?? null;
}
