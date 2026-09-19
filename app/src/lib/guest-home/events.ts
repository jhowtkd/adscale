import { INTENTS, getExample } from '@/components/guest-home/guest-core.mjs';

export const PUBLIC_GUEST_EVENT_NAMES = [
  'home_viewed',
  'intent_selected',
  'example_selected',
  'auth_prompt_opened',
  'gallery_opened',
  'references_changed',
  'continue_prepared',
  'new_request',
] as const;

export type PublicGuestEventName = (typeof PUBLIC_GUEST_EVENT_NAMES)[number];

export type PublicGuestEventDetail = Record<string, string | number | boolean>;

const VALID_INTENTS = new Set(INTENTS.map((entry) => entry.id));

function cleanIntent(value: unknown): string | null {
  return typeof value === 'string' && VALID_INTENTS.has(value as (typeof INTENTS)[number]['id'])
    ? value
    : null;
}

function cleanExampleId(value: unknown): string | null {
  return typeof value === 'string' && getExample(value) ? value : null;
}

function cleanReferenceCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3
    ? value
    : null;
}

/**
 * Allowlist filter for public guest-home events. Unknown names are dropped
 * (null); the detail is rebuilt field by field and never copied whole, so
 * request text, file names/bytes, emails, and URLs cannot survive it.
 */
export function sanitizePublicGuestEvent(event: {
  name: string; detail: Record<string, unknown>;
}): { name: string; detail: PublicGuestEventDetail } | null {
  if (!event || typeof event !== 'object') return null;
  if (typeof event.name !== 'string'
    || !(PUBLIC_GUEST_EVENT_NAMES as readonly string[]).includes(event.name)) {
    return null;
  }
  const detail = event.detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const clean: PublicGuestEventDetail = {};
  const intent = cleanIntent(detail.intent);
  if (intent !== null) clean.intent = intent;
  const exampleId = cleanExampleId(detail.exampleId);
  if (exampleId !== null) clean.exampleId = exampleId;
  const referenceCount = cleanReferenceCount(detail.referenceCount);
  if (referenceCount !== null) clean.referenceCount = referenceCount;
  if (typeof detail.preview === 'boolean') clean.preview = detail.preview;
  return { name: event.name, detail: clean };
}
