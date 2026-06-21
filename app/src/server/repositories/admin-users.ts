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
import {
  campaigns,
  derivations,
  session,
  user,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { getWorkspaceBillingAccess } from "../billing/access";
import { pickPrimaryWorkspaceByUser } from "./admin-dashboard";
import { recordAdminAuditLog } from "./admin-audit";

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

export type AdminUserDetail = {
  profile: {
    id: string;
    name: string;
    email: string;
    locale: string;
    emailVerified: boolean;
    onboardingCompleted: boolean;
    createdAt: string;
    updatedAt: string;
  };
  workspaces: Array<{
    id: string;
    name: string;
    role: string;
    joinedAt: string;
    billing: {
      planKey: string | null;
      creditBalance: number;
      remainingAds: number | null;
      kind: string;
      label: string;
      subscriptionStatus: string;
    };
  }>;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    workspaceId: string;
    createdAt: string;
  }>;
  recentDerivations: Array<{
    id: string;
    campaignId: string;
    campaignName: string;
    status: string;
    format: string | null;
    createdAt: string;
  }>;
  lastSessionAt: string | null;
};

export type AdminUserMirror = {
  user: { name: string; email: string };
  workspace: {
    id: string;
    name: string;
    creditBalance: number;
    remainingAds: number | null;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    derivationCount: number;
  }>;
};

export type AdminUserAction =
  | "verify_email"
  | "reset_onboarding"
  | "unlock_trial_notifications";

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const [profileRow] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      emailVerified: user.emailVerified,
      onboardingCompletedAt: user.onboardingCompletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!profileRow) {
    return null;
  }

  const memberships = await db
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
    .where(eq(user.id, userId));

  const workspaceIds = memberships.map((row) => row.workspaceId);
  const billingByWorkspace = new Map<
    string,
    Awaited<ReturnType<typeof getWorkspaceBillingAccess>>
  >();

  await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      billingByWorkspace.set(workspaceId, await getWorkspaceBillingAccess(workspaceId));
    })
  );

  const [lastSessionRow] = await db
    .select({ lastSessionAt: max(session.updatedAt) })
    .from(session)
    .where(eq(session.userId, userId));

  const recentCampaigns =
    workspaceIds.length === 0
      ? []
      : await db
          .select({
            id: campaigns.id,
            name: campaigns.name,
            status: campaigns.status,
            workspaceId: campaigns.workspaceId,
            createdAt: campaigns.createdAt,
          })
          .from(campaigns)
          .where(inArray(campaigns.workspaceId, workspaceIds))
          .orderBy(desc(campaigns.createdAt))
          .limit(10);

  const recentDerivations =
    workspaceIds.length === 0
      ? []
      : await db
          .select({
            id: derivations.id,
            campaignId: derivations.campaignId,
            campaignName: campaigns.name,
            status: derivations.status,
            format: derivations.format,
            createdAt: derivations.createdAt,
          })
          .from(derivations)
          .innerJoin(campaigns, eq(campaigns.id, derivations.campaignId))
          .where(inArray(derivations.workspaceId, workspaceIds))
          .orderBy(desc(derivations.createdAt))
          .limit(10);

  return {
    profile: {
      id: profileRow.id,
      name: profileRow.name,
      email: profileRow.email,
      locale: profileRow.locale,
      emailVerified: profileRow.emailVerified,
      onboardingCompleted: profileRow.onboardingCompletedAt !== null,
      createdAt: profileRow.createdAt.toISOString(),
      updatedAt: profileRow.updatedAt.toISOString(),
    },
    workspaces: memberships.map((row) => {
      const access = billingByWorkspace.get(row.workspaceId);
      const planKey =
        access?.subscription?.planKey ?? access?.latestSubscription?.planKey ?? null;

      return {
        id: row.workspaceId,
        name: row.workspaceName,
        role: row.role,
        joinedAt: row.memberCreatedAt.toISOString(),
        billing: {
          planKey,
          creditBalance: access?.creditBalance ?? 0,
          remainingAds: access?.remainingAds ?? null,
          kind: access?.kind ?? "none",
          label: access?.label ?? "",
          subscriptionStatus: access?.subscriptionStatus ?? "none",
        },
      };
    }),
    recentCampaigns: recentCampaigns.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      workspaceId: row.workspaceId,
      createdAt: row.createdAt.toISOString(),
    })),
    recentDerivations: recentDerivations.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      status: row.status,
      format: row.format,
      createdAt: row.createdAt.toISOString(),
    })),
    lastSessionAt: lastSessionRow?.lastSessionAt
      ? lastSessionRow.lastSessionAt.toISOString()
      : null,
  };
}

export async function getAdminUserMirror(userId: string): Promise<AdminUserMirror | null> {
  const [profileRow] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!profileRow) {
    return null;
  }

  const memberships = await db
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
    .where(eq(user.id, userId));

  const primary = pickPrimaryWorkspaceByUser(memberships).get(userId);
  if (!primary) {
    return {
      user: { name: profileRow.name, email: profileRow.email },
      workspace: {
        id: "",
        name: "",
        creditBalance: 0,
        remainingAds: null,
      },
      recentCampaigns: [],
    };
  }

  const access = await getWorkspaceBillingAccess(primary.workspaceId);
  const workspaceName =
    memberships.find((row) => row.workspaceId === primary.workspaceId)?.workspaceName ?? "";

  const campaignRows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, primary.workspaceId))
    .orderBy(desc(campaigns.createdAt))
    .limit(10);

  const campaignIds = campaignRows.map((row) => row.id);
  const derivationCounts =
    campaignIds.length === 0
      ? []
      : await db
          .select({
            campaignId: derivations.campaignId,
            value: count(),
          })
          .from(derivations)
          .where(inArray(derivations.campaignId, campaignIds))
          .groupBy(derivations.campaignId);

  const derivationCountByCampaign = new Map(
    derivationCounts.map((row) => [row.campaignId, Number(row.value)])
  );

  return {
    user: { name: profileRow.name, email: profileRow.email },
    workspace: {
      id: primary.workspaceId,
      name: workspaceName,
      creditBalance: access.creditBalance,
      remainingAds: access.remainingAds,
    },
    recentCampaigns: campaignRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      derivationCount: derivationCountByCampaign.get(row.id) ?? 0,
    })),
  };
}

export async function applyAdminUserAction(
  userId: string,
  action: AdminUserAction,
  reason: string,
  actorEmail: string
): Promise<void> {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!existing) {
    throw new Error("User not found");
  }

  const auditAction = `user.${action}`;

  try {
    const now = new Date();

    switch (action) {
      case "verify_email":
        await db
          .update(user)
          .set({ emailVerified: true, updatedAt: now })
          .where(eq(user.id, userId));
        break;
      case "reset_onboarding":
        await db
          .update(user)
          .set({ onboardingCompletedAt: null, updatedAt: now })
          .where(eq(user.id, userId));
        break;
      case "unlock_trial_notifications":
        await db
          .update(user)
          .set({
            lowCreditsNotifiedAt: null,
            trialExpiringNotifiedAt: null,
            updatedAt: now,
          })
          .where(eq(user.id, userId));
        break;
    }

    await recordAdminAuditLog({
      actorEmail,
      action: auditAction,
      targetType: "user",
      targetId: userId,
      reason,
      status: "success",
    });
  } catch (error) {
    await recordAdminAuditLog({
      actorEmail,
      action: auditAction,
      targetType: "user",
      targetId: userId,
      reason,
      status: "failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
