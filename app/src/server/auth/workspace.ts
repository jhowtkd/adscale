import { getSession, getSessionFromHeaders } from "./session";
import { getWorkspaceForUser } from "../repositories/workspace";

export const AUTH_ERROR_CODES = {
  unauthorized: "unauthorized",
  noWorkspace: "no_workspace",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export class WorkspaceAuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkspaceAuthError";
  }
}

export function isWorkspaceAuthError(error: unknown): error is WorkspaceAuthError {
  return error instanceof WorkspaceAuthError;
}

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
