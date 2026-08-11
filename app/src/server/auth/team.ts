import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { workspaceMembers, workspaceInvites, user } from "../db/schema";

export type InviteErrorCode =
  | "inviteNotFound"
  | "inviteRemoved"
  | "inviteAlreadyAccepted"
  | "inviteExpired"
  | "inviteEmailMismatch";

export class InviteStateError extends Error {
  constructor(readonly code: InviteErrorCode) {
    super(code);
    this.name = "InviteStateError";
  }
}

export function isInviteStateError(error: unknown): error is InviteStateError {
  return error instanceof InviteStateError;
}

export function assertInviteUsable(invite: { status: string; expiresAt: Date }) {
  if (invite.status === "revoked") throw new InviteStateError("inviteRemoved");
  if (invite.status === "accepted") throw new InviteStateError("inviteAlreadyAccepted");
  if (invite.expiresAt < new Date()) throw new InviteStateError("inviteExpired");
}

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
    throw new InviteStateError("inviteNotFound");
  }

  const existing = invite[0];

  assertInviteUsable(existing);

  if (existing.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new InviteStateError("inviteEmailMismatch");
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
    .update(workspaceInvites)
    .set({ status: "accepted" })
    .where(eq(workspaceInvites.id, existing.id));

  return existing;
}
