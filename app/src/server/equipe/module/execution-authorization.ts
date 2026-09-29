import type { AccountScope, EquipeEvent, EquipeRepositories } from "../data";
import { err, ok, type Result } from "../domain";

const BLOCKED_REASONS: Record<string, string> = {
  execution_suspended: "Account execution is suspended for security.",
  execution_delinquent: "Account execution is suspended for delinquency.",
  execution_closed: "Account is closed; new execution is not allowed.",
};

export const PROACTIVE_REMINDERS = [
  "implantation.reminder_day2", "implantation.reminder_day5", "batch.reminder_24h",
  "batch.reminder_item_4h", "escalation.client_reminder",
];

/** Shared by conversation projection and notification delivery. Human and
 * operational notices (pause, incident, support) remain available.
 */
export function requiresExecutionForMessage(event: EquipeEvent): boolean {
  if (event.actorType === "staff") return false;
  if (event.eventType.startsWith("support_exception.")) return false;
  const template = (event.payload as { templateKey?: string } | null)?.templateKey ?? "";
  if (/^(pause|global_stop|escalation|exception|post)\./.test(template) && !PROACTIVE_REMINDERS.includes(template)) return false;
  return event.actorType === "agent" || event.eventType === "batch.delivered"
    || (event.eventType === "notification.requested" && (template === "batch.delivered" || PROACTIVE_REMINDERS.includes(template)));
}

export function isExecutionBlocked(code: string | undefined): boolean {
  return code !== undefined && Object.hasOwn(BLOCKED_REASONS, code);
}

/** AI context, provider calls and new deliveries share this account gate.
 * Publication pauses do not stop production. Human reads/export, containment
 * and revocation do not use this gate. Transactional callers lock the account
 * against pause application; no lock is held during a model call.
 */
export async function authorizeAccountExecution(
  repos: EquipeRepositories,
  scope: AccountScope,
  options?: { forUpdate: boolean },
): Promise<Result<void>> {
  const account = await repos.accounts.get(scope.workspaceId, scope.accountId, options);
  if (!account) return err("unknown_account", `unknown account ${scope.accountId}`);
  const pauses = await repos.pauses.list(scope);
  const active = pauses.filter((pause) => pause.status === "active");
  const code = account.status === "closed" ? "execution_closed"
    : active.some((pause) => pause.level === "execution") ? "execution_suspended"
      : account.status === "suspended" || active.some((pause) => pause.level === "billing")
        ? "execution_delinquent" : null;
  return code ? err(code, BLOCKED_REASONS[code]!) : ok(undefined);
}

export async function assertAccountExecution(repos: EquipeRepositories, scope: AccountScope): Promise<void> {
  const allowed = await authorizeAccountExecution(repos, scope);
  if (!allowed.ok) throw new Error(allowed.error.code);
}
