import { eq, and, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { workspaceInvites } from "@/server/db/schema";

const INVITE_EXPIRATION_DAYS = 7;

export async function createInvitation(data: {
  workspaceId: string;
  email: string;
  role: string;
  createdBy: string;
}) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRATION_DAYS);
  const token = crypto.randomUUID();

  const result = await db
    .insert(workspaceInvites)
    .values({
      workspaceId: data.workspaceId,
      email: data.email.toLowerCase().trim(),
      role: data.role,
      token,
      status: "pending",
      expiresAt,
      createdBy: data.createdBy,
    })
    .returning();

  return result[0];
}

export async function getPendingInvitations(workspaceId: string) {
  return db
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.status, "pending")
      )
    )
    .orderBy(desc(workspaceInvites.createdAt));
}

export async function getInvitationByToken(token: string) {
  const result = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  return result[0] ?? null;
}

export async function cancelInvitation(inviteId: string, workspaceId: string) {
  const result = await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspaceId)
      )
    )
    .returning();

  return result[0] ?? null;
}

export async function markInvitationAccepted(inviteId: string) {
  const result = await db
    .update(workspaceInvites)
    .set({ status: "accepted" })
    .where(eq(workspaceInvites.id, inviteId))
    .returning();

  return result[0] ?? null;
}
