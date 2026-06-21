import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  max,
  or,
} from "drizzle-orm";
import { db } from "../db";
import { session, user, workspaceMembers, workspaces } from "../db/schema";
import { getWorkspaceBillingAccess } from "../billing/access";
import { pickPrimaryWorkspaceByUser } from "./admin-dashboard";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  primaryWorkspace: {
    id: string;
    name: string;
    planKey: string | null;
    creditBalance: number;
  } | null;
};

export type AdminUserSearchParams = {
  search?: string;
  page?: number;
  pageSize?: number;
  active7d?: boolean;
  creditsZero?: boolean;
  onboardingIncomplete?: boolean;
  emailUnverified?: boolean;
};

export type AdminUserSearchResult = {
  users: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_CREDITS_ZERO_SCAN = 500;

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildUserWhereConditions(params: AdminUserSearchParams) {
  const conditions = [];
  const search = params.search?.trim();

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(user.email, pattern), ilike(user.name, pattern)));
  }

  if (params.onboardingIncomplete) {
    conditions.push(isNull(user.onboardingCompletedAt));
  }

  if (params.emailUnverified) {
    conditions.push(eq(user.emailVerified, false));
  }

  if (params.active7d) {
    const sevenDaysAgo = daysAgo(7);
    const now = new Date();
    conditions.push(
      exists(
        db
          .select({ one: session.id })
          .from(session)
          .where(
            and(
              eq(session.userId, user.id),
              or(gte(session.updatedAt, sevenDaysAgo), gte(session.expiresAt, now))
            )
          )
      )
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function fetchUserRows(
  whereClause: ReturnType<typeof and> | undefined,
  options?: { limit?: number; offset?: number }
) {
  let query = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      onboardingCompletedAt: user.onboardingCompletedAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .$dynamic();

  if (whereClause) {
    query = query.where(whereClause);
  }

  query = query.orderBy(desc(user.createdAt));

  if (options?.limit !== undefined) {
    query = query.limit(options.limit).offset(options.offset ?? 0);
  }

  return query;
}

async function enrichUsers(userRows: UserRow[]): Promise<AdminUserListItem[]> {
  if (userRows.length === 0) {
    return [];
  }

  const userIds = userRows.map((row) => row.id);

  const [activityRows, memberships] = await Promise.all([
    db
      .select({
        userId: session.userId,
        lastActivityAt: max(session.updatedAt),
      })
      .from(session)
      .where(inArray(session.userId, userIds))
      .groupBy(session.userId),
    db
      .select({
        userId: user.id,
        email: user.email,
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        memberCreatedAt: workspaceMembers.createdAt,
        workspaceName: workspaces.name,
      })
      .from(user)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(inArray(user.id, userIds)),
  ]);

  const activityByUser = new Map(
    activityRows.map((row) => [row.userId, row.lastActivityAt])
  );
  const primaryByUser = pickPrimaryWorkspaceByUser(memberships);
  const workspaceNameById = new Map(
    memberships.map((row) => [row.workspaceId, row.workspaceName])
  );

  const workspaceIds = [
    ...new Set([...primaryByUser.values()].map((entry) => entry.workspaceId)),
  ];
  const billingByWorkspace = new Map<
    string,
    Awaited<ReturnType<typeof getWorkspaceBillingAccess>>
  >();

  await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      billingByWorkspace.set(workspaceId, await getWorkspaceBillingAccess(workspaceId));
    })
  );

  return userRows.map((row) => {
    const primary = primaryByUser.get(row.id);
    let primaryWorkspace: AdminUserListItem["primaryWorkspace"] = null;

    if (primary) {
      const access = billingByWorkspace.get(primary.workspaceId);
      const planKey =
        access?.subscription?.planKey ?? access?.latestSubscription?.planKey ?? null;

      primaryWorkspace = {
        id: primary.workspaceId,
        name: workspaceNameById.get(primary.workspaceId) ?? "",
        planKey,
        creditBalance: access?.creditBalance ?? 0,
      };
    }

    const lastActivity = activityByUser.get(row.id);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      onboardingCompleted: row.onboardingCompletedAt !== null,
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      primaryWorkspace,
    };
  });
}

async function searchWithCreditsZeroFilter(
  params: AdminUserSearchParams,
  whereClause: ReturnType<typeof and> | undefined,
  page: number,
  pageSize: number
): Promise<AdminUserSearchResult> {
  const rows = await fetchUserRows(whereClause, { limit: MAX_CREDITS_ZERO_SCAN });
  const enriched = await enrichUsers(rows);
  const filtered = enriched.filter((item) => item.primaryWorkspace?.creditBalance === 0);
  const offset = (page - 1) * pageSize;

  return {
    users: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

export async function searchAdminUsers(
  params: AdminUserSearchParams = {}
): Promise<AdminUserSearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const whereClause = buildUserWhereConditions(params);

  if (params.creditsZero) {
    return searchWithCreditsZeroFilter(params, whereClause, page, pageSize);
  }

  const countQuery = db.select({ value: count() }).from(user);
  const [countRow] = whereClause
    ? await countQuery.where(whereClause)
    : await countQuery;
  const total = Number(countRow?.value ?? 0);
  const offset = (page - 1) * pageSize;

  const pageRows = await fetchUserRows(whereClause, {
    limit: pageSize,
    offset,
  });
  const users = await enrichUsers(pageRows);

  return {
    users,
    total,
    page,
    pageSize,
  };
}
