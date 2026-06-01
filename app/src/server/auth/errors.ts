export const AUTH_ERROR_CODES = {
  unauthorized: "unauthorized",
  noWorkspace: "no_workspace",
  forbidden: "forbidden",
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
