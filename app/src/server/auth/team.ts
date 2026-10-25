import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import { workspaceMembers, workspaceInvites, user } from "../db/schema";
import type { WorkspaceMemberRole } from "./workspace";

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

/** Which target roles each caller role may remove; mirrors the invite rule (admins only manage members). */
const REMOVABLE_ROLES: Record<WorkspaceMemberRole, readonly string[]> = {
  owner: ["owner", "admin", "member"],
  admin: ["member"],
  member: [],
};

export type RemoveMemberResult = "removed" | "cannotRemoveSelf" | "memberNotFound" | "forbidden";

/**
 * Locks the caller's and the target's rows, so the caller's role is read after any concurrent removal commits.
 * Two owners removing each other therefore serialize: the second finds itself gone and gets `forbidden`, and the
 * workspace keeps an owner.
 */
export async function removeMember(
  workspaceId: string,
  actorUserId: string,
  targetUserId: string
): Promise<RemoveMemberResult> {
  if (actorUserId === targetUserId) return "cannotRemoveSelf";

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.userId, [actorUserId, targetUserId])
        )
      )
      .orderBy(asc(workspaceMembers.id))
      .for("update");

    const actor = rows.find((row) => row.userId === actorUserId);
    const target = rows.find((row) => row.userId === targetUserId);
    const removable = actor ? (REMOVABLE_ROLES[actor.role as WorkspaceMemberRole] ?? []) : [];
    if (removable.length === 0) return "forbidden";
    if (!target) return "memberNotFound";
    if (!removable.includes(target.role)) return "forbidden";

    await tx.delete(workspaceMembers).where(eq(workspaceMembers.id, target.id));
    return "removed";
  });
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
