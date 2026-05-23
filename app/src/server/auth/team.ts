import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { workspaceMembers, workspaceInvites, user } from "../db/schema";

export async function getWorkspaceMembers(workspaceId: string) {
  return db
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(desc(workspaceMembers.createdAt));
}

export async function removeMember(workspaceId: string, userId: string) {
  const result = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .returning();

  return result[0] ?? null;
}

export async function acceptInvite(token: string, userId: string, userEmail: string) {
  const invite = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (invite.length === 0) {
    throw new Error("Invite not found");
  }

  const existing = invite[0];

  if (existing.expiresAt < new Date()) {
    throw new Error("Invite expired");
  }

  if (existing.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new Error("Invite email mismatch");
  }

  const existingMember = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, existing.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (existingMember.length === 0) {
    await db.insert(workspaceMembers).values({
      workspaceId: existing.workspaceId,
      userId,
      role: existing.role,
    });
  }

  await db
    .delete(workspaceInvites)
    .where(eq(workspaceInvites.id, existing.id));

  return existing;
}
