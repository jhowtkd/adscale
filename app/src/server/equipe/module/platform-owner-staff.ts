// Platform-owner bootstrap (#552): the platform owner holds every
// internal role by default in the pilot ("Global, gerida pelo dono da
// plataforma, que tem todos os papéis por padrão"). Nobody else can create
// equipe_staff rows — there is no staff-management UI — so without this no
// account could ever be opened in production.
//
// This system command (actor system, SYSTEM-only action) idempotently
// ensures three active staff rows for the given user — support, quality,
// operations — and reports what it did. A row that exists but was
// explicitly deactivated is NEVER reactivated: it is left alone and
// reported, so deactivation stays a working kill switch.
//
// Auditability: equipe_events is account-scoped (workspace + account FK),
// so a global bootstrap has no event stream to append to — the staff rows
// themselves (user, role, createdAt) plus the returned report are the
// audit trail, and every later command's events carry the real staff
// actor (actorId/actorRole) bound to these rows.

import { authorize, err, ok, type Actor, type Result, type StaffRole } from "../domain";
import type { EquipeModuleDeps } from "./ports";

/** The three internal roles the platform owner holds by default. */
export const PLATFORM_OWNER_STAFF_ROLES: StaffRole[] = ["support", "quality", "operations"];

export type EnsurePlatformOwnerStaffInput = {
  /** The platform owner's user id; one row per role is keyed on it. */
  userId: string;
  /** Display name for rows this call creates. */
  displayName: string;
};

export type EnsurePlatformOwnerStaffReport = {
  /** Roles this call created (empty on a repeat call — nothing to do). */
  created: StaffRole[];
  /** Roles that already had an active row. */
  alreadyActive: StaffRole[];
  /** Roles with an inactive row: left alone, never reactivated. */
  deactivated: StaffRole[];
};

export async function ensurePlatformOwnerStaff(
  deps: EquipeModuleDeps,
  actor: Actor,
  input: EnsurePlatformOwnerStaffInput,
): Promise<Result<EnsurePlatformOwnerStaffReport>> {
  const authorized = authorize(actor, "ensure_platform_owner_staff");
  if (!authorized.ok) return authorized;
  if (!input.userId || !input.displayName) {
    return err("invalid_command", "ensure_platform_owner_staff requires userId and displayName");
  }
  return deps.uow.run(async (_repos, internal) => {
    const existing = (await internal.staff.list()).filter((row) => row.userId === input.userId);
    const report: EnsurePlatformOwnerStaffReport = { created: [], alreadyActive: [], deactivated: [] };
    for (const role of PLATFORM_OWNER_STAFF_ROLES) {
      const row = existing.find((candidate) => candidate.role === role);
      if (!row) {
        await internal.staff.create({
          userId: input.userId,
          role,
          displayName: input.displayName,
          active: true,
        });
        report.created.push(role);
      } else if (row.active) {
        report.alreadyActive.push(role);
      } else {
        report.deactivated.push(role);
      }
    }
    return ok(report);
  });
}
