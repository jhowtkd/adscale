import { eq, and, asc, desc, sql, ne } from "drizzle-orm";
import { db } from "../db";
import { workspaces, workspaceMembers } from "../db/schema";

export class WorkspaceSlugConflictError extends Error {
  constructor(message = "Workspace slug already exists") {
    super(message);
    this.name = "WorkspaceSlugConflictError";
  }
}

export interface WorkspaceSettingsRow {
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  website: string | null;
  timezone: string | null;
}

export interface UpdateWorkspaceSettingsInput {
  name?: string;
  slug?: string;
  description?: string;
  industry?: string;
  website?: string;
  timezone?: string;
}

export interface WorkspaceSettingsResponse {
  name: string;
  slug: string;
  description: string;
  industry: string;
  website: string;
  timezone: string;
}

export function toWorkspaceSettingsResponse(
  row: WorkspaceSettingsRow
): WorkspaceSettingsResponse {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    industry: row.industry ?? "",
    website: row.website ?? "",
    timezone: row.timezone ?? "",
  };
}

export async function getWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettingsRow | null> {
  const rows = await db
    .select({
      name: workspaces.name,
      slug: workspaces.slug,
      description: workspaces.description,
      industry: workspaces.industry,
      website: workspaces.website,
      timezone: workspaces.timezone,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  input: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettingsRow> {
  if (input.slug !== undefined) {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(eq(workspaces.slug, input.slug), ne(workspaces.id, workspaceId))
      )
      .limit(1);

    if (existing.length > 0) {
      throw new WorkspaceSlugConflictError();
    }
  }

  const rows = await db
    .update(workspaces)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId))
    .returning({
      name: workspaces.name,
      slug: workspaces.slug,
      description: workspaces.description,
      industry: workspaces.industry,
      website: workspaces.website,
      timezone: workspaces.timezone,
    });

  const updated = rows[0];
  if (!updated) {
    throw new Error("Workspace not found");
  }

  return updated;
}

/** Prefer the user's own (owner) workspace; fall back to admin/member memberships. */
const workspaceMembershipPriority = sql`CASE ${workspaceMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`;

export async function getWorkspaceForUser(userId: string) {
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembershipPriority, asc(workspaceMembers.createdAt))
    .limit(1);

  if (member.length === 0) return null;

  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, member[0].workspaceId))
    .limit(1);

  return workspace[0] ?? null;
}

export async function createWorkspace(data: {
  name: string;
  slug: string;
}) {
  const workspace = await db
    .insert(workspaces)
    .values(data)
    .returning();
  return workspace[0];
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: string = "member"
) {
  const member = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role })
    .returning();
  return member[0];
}

/** First workspace member — used as analytics actor for unauthenticated server events (e.g. share opens). */
export async function getWorkspaceActorUserId(
  workspaceId: string
): Promise<string | null> {
  const member = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(desc(workspaceMembers.createdAt))
    .limit(1);

  return member[0]?.userId ?? null;
}

export async function verifyMembership(workspaceId: string, userId: string) {
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  return member.length > 0;
}
