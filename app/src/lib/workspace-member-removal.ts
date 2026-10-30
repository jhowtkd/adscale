/** Which target roles each caller role may remove; mirrors the invite rule (admins only manage members). */
const REMOVABLE_ROLES = {
  owner: ["owner", "admin", "member"],
  admin: ["member"],
  member: [],
} as const satisfies Record<string, readonly string[]>;

/** Same precedence as `workspaceMembershipPriority` in repositories/workspace.ts. */
const ROLE_PRECEDENCE = ["owner", "admin", "member"] as const;

export function removableRoles(actorRole: string): readonly string[] {
  return Object.hasOwn(REMOVABLE_ROLES, actorRole)
    ? REMOVABLE_ROLES[actorRole as keyof typeof REMOVABLE_ROLES]
    : [];
}

/** `workspace_members` allows several rows per user; the highest-precedence one is the user's role. */
export function effectiveRole(roles: readonly string[]): string {
  return ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? "";
}
