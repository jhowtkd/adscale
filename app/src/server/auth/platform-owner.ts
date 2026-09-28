import { isDevAdminEmail, parseDevAdminEmails } from "./dev-admin";
import { getWorkspaceMembers } from "./team";

/**
 * The platform-owner allowlist: PLATFORM_OWNER_EMAILS plus the dev-admin
 * fallback (empty in production). Lowercased and trimmed; compare with a
 * normalized email, never the raw env string.
 */
export function parsePlatformOwnerEmails(): Set<string> {
  const raw = process.env.PLATFORM_OWNER_EMAILS ?? "";
  const platformOwners = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...platformOwners, ...parseDevAdminEmails()]);
}

export function isPlatformOwnerEmail(email: string): boolean {
  if (isDevAdminEmail(email)) return true;
  const owners = parsePlatformOwnerEmails();
  if (owners.size === 0) return false;
  return owners.has(email.trim().toLowerCase());
}

export async function workspaceHasPlatformOwnerMember(workspaceId: string): Promise<boolean> {
  if (parsePlatformOwnerEmails().size === 0) return false;
  const members = await getWorkspaceMembers(workspaceId);
  return members.some((member) => isPlatformOwnerEmail(member.email));
}
