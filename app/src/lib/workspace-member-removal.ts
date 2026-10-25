/** Which target roles each caller role may remove; mirrors the invite rule (admins only manage members). */
const REMOVABLE_ROLES = {
  owner: ["owner", "admin", "member"],
  admin: ["member"],
  member: [],
} as const satisfies Record<string, readonly string[]>;

export function removableRoles(actorRole: string): readonly string[] {
  return Object.hasOwn(REMOVABLE_ROLES, actorRole)
    ? REMOVABLE_ROLES[actorRole as keyof typeof REMOVABLE_ROLES]
    : [];
}
