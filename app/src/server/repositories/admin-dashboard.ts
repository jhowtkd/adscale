import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
} from "drizzle-orm";
import { db } from "../db";
import {
  derivations,
  feedbackReports,
  humanQualityCorpusItems,
  session,
  user,
  workspaceMembers,
} from "../db/schema";
import { getWorkspaceBillingAccess } from "../billing/access";
import { getCorpusOperationsProgress } from "./human-quality-corpus";

export type AdminDashboardSummary = {
  activeUsers7d: number;
  pendingFeedbacks: number;
  corpusPending: number;
  failedDerivations24h: number;
  attention: {
    criticalFeedbacks: Array<{ id: string; message: string; createdAt: string }>;
    zeroCreditUsers: Array<{ userId: string; email: string; workspaceId: string }>;
    staleCorpusItems: Array<{ id: string; selectedAt: string }>;
  };
};

const ATTENTION_LIMIT = 5;
const ZERO_CREDIT_USER_SCAN_LIMIT = 200;

type MembershipRow = {
  userId: string;
  email: string;
  workspaceId: string;
  role: string;
  memberCreatedAt: Date;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export function pickPrimaryWorkspaceByUser(
  rows: MembershipRow[]
): Map<string, { userId: string; email: string; workspaceId: string }> {
  const rolePriority = (role: string) =>
    role === "owner" ? 0 : role === "admin" ? 1 : 2;

  const bestByUser = new Map<string, MembershipRow>();

  for (const row of rows) {
    const existing = bestByUser.get(row.userId);
    if (!existing) {
      bestByUser.set(row.userId, row);
      continue;
    }

    const rowPriority = rolePriority(row.role);
    const existingPriority = rolePriority(existing.role);

    if (
      rowPriority < existingPriority ||
      (rowPriority === existingPriority &&
        row.memberCreatedAt.getTime() < existing.memberCreatedAt.getTime())
    ) {
      bestByUser.set(row.userId, row);
    }
  }

  return new Map(
    [...bestByUser.values()].map((row) => [
      row.userId,
      { userId: row.userId, email: row.email, workspaceId: row.workspaceId },
    ])
  );
}

async function countActiveUsers7d(): Promise<number> {
  const sevenDaysAgo = daysAgo(7);
  const now = new Date();

  const [row] = await db
    .select({ value: countDistinct(session.userId) })
    .from(session)
    .where(or(gte(session.updatedAt, sevenDaysAgo), gte(session.expiresAt, now)));

  return Number(row?.value ?? 0);
}

async function countPendingFeedbacks(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(feedbackReports)
    .where(inArray(feedbackReports.status, ["new", "reviewing"]));

  return Number(row?.value ?? 0);
}

async function countCorpusPending(): Promise<number> {
  const progress = await getCorpusOperationsProgress(undefined);
  return progress.totalPending;
}

async function countFailedDerivations24h(): Promise<number> {
  const since = hoursAgo(24);

  const [row] = await db
    .select({ value: count() })
    .from(derivations)
    .where(and(eq(derivations.status, "failed"), gte(derivations.createdAt, since)));

  return Number(row?.value ?? 0);
}

async function listCriticalFeedbacks(): Promise<
  AdminDashboardSummary["attention"]["criticalFeedbacks"]
> {
  const rows = await db
    .select({
      id: feedbackReports.id,
      message: feedbackReports.message,
      createdAt: feedbackReports.createdAt,
    })
    .from(feedbackReports)
    .where(
      and(eq(feedbackReports.severity, "critical"), ne(feedbackReports.status, "archived"))
    )
    .orderBy(desc(feedbackReports.createdAt))
    .limit(ATTENTION_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function listStaleCorpusItems(): Promise<
  AdminDashboardSummary["attention"]["staleCorpusItems"]
> {
  const staleBefore = daysAgo(7);

  const rows = await db
    .select({
      id: humanQualityCorpusItems.id,
      selectedAt: humanQualityCorpusItems.selectedAt,
    })
    .from(humanQualityCorpusItems)
    .where(
      and(
        eq(humanQualityCorpusItems.status, "pending"),
        lt(humanQualityCorpusItems.selectedAt, staleBefore)
      )
    )
    .orderBy(asc(humanQualityCorpusItems.selectedAt))
    .limit(ATTENTION_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    selectedAt: row.selectedAt.toISOString(),
  }));
}

async function listZeroCreditUsers(): Promise<
  AdminDashboardSummary["attention"]["zeroCreditUsers"]
> {
  const memberships = await db
    .select({
      userId: user.id,
      email: user.email,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      memberCreatedAt: workspaceMembers.createdAt,
    })
    .from(user)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
    .orderBy(asc(user.createdAt))
    .limit(ZERO_CREDIT_USER_SCAN_LIMIT * 4);

  const primaryByUser = pickPrimaryWorkspaceByUser(memberships);
  const zeroCreditUsers: AdminDashboardSummary["attention"]["zeroCreditUsers"] = [];

  for (const entry of primaryByUser.values()) {
    if (zeroCreditUsers.length >= ATTENTION_LIMIT) {
      break;
    }

    const access = await getWorkspaceBillingAccess(entry.workspaceId);
    if (access.creditBalance === 0) {
      zeroCreditUsers.push(entry);
    }
  }

  return zeroCreditUsers;
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const [
    activeUsers7d,
    pendingFeedbacks,
    corpusPending,
    failedDerivations24h,
    criticalFeedbacks,
    zeroCreditUsers,
    staleCorpusItems,
  ] = await Promise.all([
    countActiveUsers7d(),
    countPendingFeedbacks(),
    countCorpusPending(),
    countFailedDerivations24h(),
    listCriticalFeedbacks(),
    listZeroCreditUsers(),
    listStaleCorpusItems(),
  ]);

  return {
    activeUsers7d,
    pendingFeedbacks,
    corpusPending,
    failedDerivations24h,
    attention: {
      criticalFeedbacks,
      zeroCreditUsers,
      staleCorpusItems,
    },
  };
}
