import { UUID_PATTERN } from '@/components/guest-home/guest-core.mjs';

export type GuestHandoff =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'guest'; id: string }
  | { kind: 'conflict'; id: string };

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
