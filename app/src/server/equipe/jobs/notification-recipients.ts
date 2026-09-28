// Notification recipient resolution (#549): recipient roles to reachable
// contacts. Client roles read the account people; staff roles read the
// global staff rows; `founder` resolves the platform-owner allowlist (the
// same PLATFORM_OWNER_EMAILS list `requirePlatformOwner` enforces) and
// falls back to the operations queue only when it matches nobody.
//
// This leaf module owns EQUIPE_NOTIFICATIONS_ID: the delivery module and
// the job log under the same tag, and importing it from here keeps the
// module graph acyclic.

import { logger } from "@/lib/logger";
import { parsePlatformOwnerEmails } from "@/server/auth/platform-owner";
import type {
  AccountScope,
  EquipeRepositories,
  EquipeStaffMember,
  InternalEquipeRepositories,
} from "../data";

export const EQUIPE_NOTIFICATIONS_ID = "equipe-notifications";

const CLIENT_RECIPIENT_ROLES = new Set(["approver", "substitute", "custodian", "member"]);
const STAFF_RECIPIENT_ROLES = new Set(["quality", "operations", "support"]);
const INTERNAL_RECIPIENT_ROLE = "strategist";
const FOUNDER_RECIPIENT_ROLE = "founder";

export type NotificationRecipient = {
  userId: string | null;
  /** Bare contact email (client people without a login). */
  email: string | null;
};

export type NotificationRecipientStores = {
  repos: EquipeRepositories;
  internal: InternalEquipeRepositories;
};

export type FounderResolution = {
  /** Staff-user email lookup; without it the allowlist cannot match. */
  users?: {
    get(userId: string): Promise<{ email: string } | null>;
  };
  /** Owner allowlist; defaults to the parsed PLATFORM_OWNER_EMAILS. */
  ownerEmails?: ReadonlySet<string>;
};

function staffRecipients(staff: EquipeStaffMember[], role: string): NotificationRecipient[] {
  return staff
    .filter((row) => row.role === role)
    .map((row) => ({ userId: row.userId, email: null }));
}

/**
 * Founder recipients: the active staff users whose login email is on the
 * platform-owner allowlist. In the pilot the founder is the platform
 * owner; when the allowlist matches nobody (empty env, owner without a
 * staff login) the breach pages the operations queue instead of being
 * dropped — and the fallback is logged.
 */
async function resolveFounderRecipients(
  stores: NotificationRecipientStores,
  scope: AccountScope,
  founder: FounderResolution,
): Promise<NotificationRecipient[]> {
  const staff = await stores.internal.staff.list({ active: true });
  const owners = founder.ownerEmails ?? parsePlatformOwnerEmails();
  if (founder.users && owners.size > 0) {
    const seen = new Set<string>();
    const matched: NotificationRecipient[] = [];
    for (const row of staff) {
      if (!row.userId || seen.has(row.userId)) continue;
      const account = await founder.users.get(row.userId);
      const email = account?.email.trim().toLowerCase();
      if (!email || !owners.has(email)) continue;
      seen.add(row.userId);
      matched.push({ userId: row.userId, email: null });
    }
    if (matched.length > 0) return matched;
  }
  logger.warn(
    `[${EQUIPE_NOTIFICATIONS_ID}] founder allowlist matched no staff user, falling back to operations`,
    { ...scope },
  );
  return staffRecipients(staff, "operations");
}

/**
 * Resolve a recipient role to reachable contacts. Client roles read the
 * account people; staff roles read the global staff rows; `founder`
 * resolves the platform-owner allowlist with an operations fallback (see
 * above); `strategist` is internal to the agent loop.
 */
export async function resolveNotificationRecipients(
  stores: NotificationRecipientStores,
  scope: AccountScope,
  recipientRole: string,
  founder: FounderResolution = {},
): Promise<NotificationRecipient[] | { internal: true } | { unknown: true }> {
  if (recipientRole === INTERNAL_RECIPIENT_ROLE) return { internal: true };
  if (CLIENT_RECIPIENT_ROLES.has(recipientRole)) {
    const people = await stores.repos.people.list(scope);
    return people
      .filter((person) => person.active && person.role === recipientRole)
      .map((person) => ({ userId: person.userId, email: person.email }));
  }
  if (STAFF_RECIPIENT_ROLES.has(recipientRole)) {
    const staff = await stores.internal.staff.list({ active: true });
    return staffRecipients(staff, recipientRole);
  }
  if (recipientRole === FOUNDER_RECIPIENT_ROLE) {
    return resolveFounderRecipients(stores, scope, founder);
  }
  return { unknown: true };
}
