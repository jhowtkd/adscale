import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { workspaceMembers, workspaceInvites, user } from "../db/schema";
import { effectiveRole, removableRoles } from "@/lib/workspace-member-removal";

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

export type RemoveMemberResult = "removed" | "cannotRemoveSelf" | "memberNotFound" | "forbidden" | "conflict";

/** 55P03 (lock_timeout) and 57014 (statement_timeout): a concurrent removal held the rows past the timeouts. */
const LOCK_CONTENTION_SQLSTATES: ReadonlySet<unknown> = new Set(["55P03", "57014"]);

/** The installed Drizzle carries the SQLSTATE on the driver error (`cause`), some drivers on the error itself. */
function isLockContention(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; cause?: unknown };
  if (LOCK_CONTENTION_SQLSTATES.has(record.code)) return true;
  return typeof record.cause === "object" && record.cause !== null && LOCK_CONTENTION_SQLSTATES.has((record.cause as { code?: unknown }).code);
}

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

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '2s'`);
      await tx.execute(sql`set local statement_timeout = '5s'`);
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

      const actorRole = effectiveRole(rows.filter((row) => row.userId === actorUserId).map((row) => row.role));
      const targetRows = rows.filter((row) => row.userId === targetUserId);
      const removable = removableRoles(actorRole);
      if (removable.length === 0) return "forbidden";
      if (targetRows.length === 0) return "memberNotFound";
      if (!targetRows.every((row) => removable.includes(row.role))) return "forbidden";

      await tx.delete(workspaceMembers).where(inArray(workspaceMembers.id, targetRows.map((row) => row.id)));
      return "removed";
    });
  } catch (error) {
    if (isLockContention(error)) return "conflict";
    throw error;
  }
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
