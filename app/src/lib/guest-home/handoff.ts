import { UUID_PATTERN } from '@/components/guest-home/guest-core.mjs';

export type GuestHandoff =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'guest'; id: string }
  | { kind: 'conflict'; id: string };

/**
 * Public navigation parser for the authenticated entry (#442). Reads only
 * the opaque draft UUID from the URL — never workspace or brand identity.
 * A guest draft combined with an open work, template, or campaign is an
 * explicit conflict, never an automatic overlay. The persisted snapshot's
 * intent stays authoritative for import; the URL intent is only a
 * navigation hint. The existing intent/fresh/compose/legacy-work parser is
 * untouched.
 */
export function parseGuestHandoff(
  params: Record<string, string | string[] | undefined>,
): GuestHandoff {
  if (params.guestDraft === undefined) return { kind: 'none' };
  if (typeof params.guestDraft !== 'string' || !UUID_PATTERN.test(params.guestDraft)) {
    return { kind: 'invalid' };
  }
  if (['workId', 'templateId', 'campaignId'].some((key) => params[key] !== undefined)) {
    return { kind: 'conflict', id: params.guestDraft };
  }
  return { kind: 'guest', id: params.guestDraft };
}
