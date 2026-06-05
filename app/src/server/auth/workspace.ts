import { eq, and } from "drizzle-orm";
import { getSession, getSessionFromHeaders } from "./session";
import { getWorkspaceForUser } from "../repositories/workspace";
import { db } from "../db";
import { workspaceMembers } from "../db/schema";

export { AUTH_ERROR_CODES, WorkspaceAuthError, isWorkspaceAuthError } from "./errors";
export type { AuthErrorCode } from "./errors";

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "./errors";

export type WorkspaceMemberRole = "owner" | "admin" | "member";

export async function requireWorkspaceAccess(request?: Request) {
  const session = request
    ? await getSessionFromHeaders(request.headers)
    : await getSession();

  if (!session) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
  }

  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.noWorkspace, "No workspace");
  }

  return { user: session.user, workspace };
}

export async function requireRole(
  workspaceId: string,
  userId: string,
  allowedRoles: WorkspaceMemberRole[]
) {
  const membership = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  const userRole = membership[0]?.role;
  if (!userRole || !allowedRoles.includes(userRole as WorkspaceMemberRole)) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden");
  }

  return { role: userRole as WorkspaceMemberRole };
}
