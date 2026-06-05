import { getSessionFromHeaders } from "./session";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "./errors";

function parseOwnerEmails(): Set<string> {
  const raw = process.env.PLATFORM_OWNER_EMAILS ?? process.env.DEV_ADMIN_EMAIL ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isPlatformOwnerEmail(email: string): boolean {
  const owners = parseOwnerEmails();
  if (owners.size === 0) return false;
  return owners.has(email.trim().toLowerCase());
}

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
