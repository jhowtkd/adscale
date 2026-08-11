import { eq, and } from "drizzle-orm";
import { getSession, getSessionFromHeaders } from "./session";
import { cookies } from "next/headers";
import { getWorkspaceForUser, getWorkspaceForUserInWorkspace } from "../repositories/workspace";
import { db } from "../db";
import { workspaceMembers } from "../db/schema";

export { AUTH_ERROR_CODES, WorkspaceAuthError, isWorkspaceAuthError } from "./errors";
export type { AuthErrorCode } from "./errors";

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "./errors";

export type WorkspaceMemberRole = "owner" | "admin" | "member";

export const ACTIVE_WORKSPACE_COOKIE = "adscale_active_workspace";
export const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function getActiveWorkspaceCookie(request: Request) {
  const value = request.headers.get("cookie")
    ?.split(";")
    .map((entry) => entry.trim().split("=", 2))
    .find(([name]) => name === ACTIVE_WORKSPACE_COOKIE)?.[1];
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export async function requireWorkspaceAccess(request?: Request) {
  const session = request
    ? await getSessionFromHeaders(request.headers)
    : await getSession();

  if (!session) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
  }

  let activeWorkspaceId: string | undefined;
  if (request) {
    activeWorkspaceId = getActiveWorkspaceCookie(request);
  } else {
    try {
      activeWorkspaceId = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
    } catch {
      // Server-side unit callers may not have a request cookie store.
    }
  }
  const workspace = activeWorkspaceId
    ? (await getWorkspaceForUserInWorkspace(session.user.id, activeWorkspaceId))
      ?? (await getWorkspaceForUser(session.user.id))
    : await getWorkspaceForUser(session.user.id);
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
