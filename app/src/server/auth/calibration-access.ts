import { getSessionFromHeaders } from "./session";
import { isPlatformOwnerEmail } from "./platform-owner";
import { getWorkspaceForUser } from "../repositories/workspace";
import { requireRole, AUTH_ERROR_CODES, WorkspaceAuthError } from "./workspace";

export type CalibrationAccessScope = "platform-owner" | "workspace-admin";

export interface CalibrationAccessResult {
  user: { id: string; email: string; name?: string | null; image?: string | null };
  scope: CalibrationAccessScope;
  workspaceId?: string;
}

export async function requireCalibrationAccess(
  request: Request,
  requestedWorkspaceId?: string | null
): Promise<CalibrationAccessResult> {
  const session = await getSessionFromHeaders(request.headers);

  if (!session?.user?.email) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
  }

  if (isPlatformOwnerEmail(session.user.email)) {
    return { user: session.user, scope: "platform-owner" };
  }

  const workspaceId =
    requestedWorkspaceId ?? (await getWorkspaceForUser(session.user.id))?.id;

  if (!workspaceId) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden");
  }

  await requireRole(workspaceId, session.user.id, ["owner", "admin"]);

  return {
    user: session.user,
    scope: "workspace-admin",
    workspaceId,
  };
}
