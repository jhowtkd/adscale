// Guards for the /api/equipe routes (#552). The actor is always built here,
// on the server, from the session user plus stored rows — never from the
// request body. The module re-binds the actor inside the transaction.

import { getSessionFromHeaders } from "@/server/auth/session";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import type { EquipeAccount, EquipeAccountPerson, EquipeStaffMember } from "../data";
import type { ClientPersonRole, StaffRole } from "../domain";
import { isEquipeEnabledForWorkspace } from "../module/equipe-enabled";
import type { EquipeModuleDeps } from "../module/ports";
import { createEquipeRouteDeps } from "./deps";

export type EquipeClientContext = {
  user: { id: string };
  workspace: { id: string };
  deps: EquipeModuleDeps;
  /** Null on the account list (no account scope); set otherwise. */
  account: EquipeAccount | null;
  /**
   * The caller's row on this account, highest role first. Null on the
   * account list and for workspace members with no row — reads don't need
   * it (the module queries are actor-blind), commands 403 without it.
   */
  person: EquipeAccountPerson | null;
};

const PERSON_ROLE_RANK: Record<ClientPersonRole, number> = {
  approver: 0,
  substitute: 1,
  custodian: 2,
  member: 3,
};

/**
 * The caller's row on this account. One user may hold several rows (e.g.
 * approver + custodian); the highest-ranked row wins. That pick is safe
 * for the commands endpoint: no command-envelope action is exclusive to
 * a lower role (member/custodian-only actions are ANY_CLIENT, and
 * custodian-exclusive connect/reconnect have no command type), so when
 * the user may run a command under any held role, the top row may run
 * it too — and the module still authorizes + re-binds.
 */
export function pickClientPerson(
  rows: EquipeAccountPerson[],
  userId: string,
): EquipeAccountPerson | null {
  const mine = rows.filter((row) => row.userId === userId);
  if (mine.length === 0) return null;
  const rank = (role: string): number => PERSON_ROLE_RANK[role as ClientPersonRole] ?? 4;
  // Active rows first (an inactive row can never bind), then highest role.
  return [...mine].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      rank(a.role) - rank(b.role) ||
      a.id.localeCompare(b.id),
  )[0]!;
}

/**
 * Client guard: workspace access + Equipe pilot allowlist + the account
 * belonging to that workspace. Anything that would reveal the feature or
 * another account's existence collapses to `{ ok: false }` (the route
 * answers 404): disabled workspace, unknown account, account of another
 * workspace. Auth failures throw (401/403 via the house envelope).
 */
export async function equipeClientContext(
  request: Request,
  accountId?: string,
): Promise<{ ok: true; context: EquipeClientContext } | { ok: false }> {
  const { user, workspace } = await requireWorkspaceAccess(request);
  const deps = createEquipeRouteDeps(workspace.id);
  const enabled = deps.isEnabledForWorkspace?.(workspace.id) ?? isEquipeEnabledForWorkspace(workspace.id);
  if (!enabled) return { ok: false };
  if (!accountId) {
    return { ok: true, context: { user, workspace, deps, account: null, person: null } };
  }
  const account = await deps.uow.repos.accounts.get(workspace.id, accountId);
  if (!account) return { ok: false };
  const people = await deps.uow.repos.people.list({ workspaceId: workspace.id, accountId });
  return {
    ok: true,
    context: { user, workspace, deps, account, person: pickClientPerson(people, user.id) },
  };
}

export type EquipeStaffContext = {
  user: { id: string };
  deps: EquipeModuleDeps;
  /** The caller's active staff rows; empty for a bare platform owner. */
  staffRows: EquipeStaffMember[];
};

/**
 * Internal guard: the session user holds at least one active equipe_staff
 * row, or is a platform owner (which covers every internal route in the
 * pilot — nothing is seeded, the allowlist is just accepted). Role binding
 * still happens per action: quality reads and staff commands need a real
 * row holding the role, and the module refuses the rest.
 */
export async function equipeStaffContext(request: Request): Promise<EquipeStaffContext> {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) {
    throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
  }
  const deps = createEquipeRouteDeps();
  const rows = (await deps.uow.internal.staff.list({ active: true })).filter(
    (row) => row.userId === session.user.id,
  );
  if (rows.length > 0) {
    return { user: session.user, deps, staffRows: rows };
  }
  // Throws 403 unless the allowlist covers the user; nothing is seeded.
  await requirePlatformOwner(request);
  return { user: session.user, deps, staffRows: [] };
}

export type StaffActorResolution =
  | { ok: true; actor: { kind: "staff"; role: StaffRole; staffId: string } }
  | { ok: false; reason: "no_identity" | "role_not_held" | "role_required" };

/**
 * The staff actor for one command, from the caller's rows. An explicit
 * role wins when held; a single row is used as-is; several rows without
 * an explicit role are ambiguous (400, the caller says which role it
 * acts as). A bare platform owner has no identity to act as (403).
 */
export function resolveStaffActor(
  rows: EquipeStaffMember[],
  role?: StaffRole,
): StaffActorResolution {
  if (rows.length === 0) return { ok: false, reason: "no_identity" };
  if (role) {
    const row = rows.find((candidate) => candidate.role === role);
    if (!row) return { ok: false, reason: "role_not_held" };
    return { ok: true, actor: { kind: "staff", role, staffId: row.id } };
  }
  if (rows.length > 1) return { ok: false, reason: "role_required" };
  return {
    ok: true,
    actor: { kind: "staff", role: rows[0]!.role as StaffRole, staffId: rows[0]!.id },
  };
}
