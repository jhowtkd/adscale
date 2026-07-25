import { getSessionFromHeaders } from "./session";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "./errors";
import { isPlatformOwnerEmail } from "./platform-owner";

export async function requirePlatformOwner(request?: Request) {
  const session = request
    ? await getSessionFromHeaders(request.headers)
    : null;

  if (!session?.user?.email) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
  }

  if (!isPlatformOwnerEmail(session.user.email)) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden");
  }

  return { user: session.user };
}
