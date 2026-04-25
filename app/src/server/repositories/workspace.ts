import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { workspaces, workspaceMembers } from "../db/schema";

export async function getWorkspaceForUser(userId: string) {
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
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
