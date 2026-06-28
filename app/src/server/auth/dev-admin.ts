import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { user, workspaceMembers } from "@/server/db/schema";

export const DEV_ADMIN_CREDIT_BALANCE = 999_999;

export function parseDevAdminEmails(): Set<string> {
  const raw = process.env.DEV_ADMIN_EMAIL ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isDevAdminEmail(email: string): boolean {
  const admins = parseDevAdminEmails();
  if (admins.size === 0) return false;
  return admins.has(email.trim().toLowerCase());
}

export async function repairDevAdminAccount(email: string): Promise<number> {
  if (!isDevAdminEmail(email)) return 0;

  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(trim(${user.email})) = ${normalized}`);

  if (rows.length === 0) return 0;

  await db.delete(user).where(inArray(user.id, rows.map((r) => r.id)));
  return rows.length;
}

export async function ensureDevAdminEmailVerified(email: string): Promise<void> {
  if (!isDevAdminEmail(email)) return;

  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ id: user.id, onboardingCompletedAt: user.onboardingCompletedAt })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);

  const account = rows[0];
  if (!account) return;

  await db
    .update(user)
    .set({
      emailVerified: true,
      onboardingCompletedAt: account.onboardingCompletedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, account.id));
}

export async function workspaceHasDevAdminOwner(workspaceId: string): Promise<boolean> {
  if (parseDevAdminEmails().size === 0) return false;

  const owners = await db
    .select({ email: user.email })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, "owner")
      )
    );

  return owners.some((owner) => isDevAdminEmail(owner.email));
}
