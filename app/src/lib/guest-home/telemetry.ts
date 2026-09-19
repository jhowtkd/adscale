/**
 * Guest telemetry: fail-closed allowlist over the existing authenticated
 * analytics channel. The public journey records nothing remotely before
 * auth — there is no visitor collector — and the single allowed event is
 * emitted only after a verified import, from the authenticated entry.
 * Payloads carry aggregates (ids, origin, counts) exclusively; request
 * text, file names, e-mails and bytes can never reach the payload because
 * the builder picks a fixed set of scalar fields.
 */

export const GUEST_EVENT_ALLOWLIST = ['guest_draft_imported'] as const;

export type GuestEventKey = (typeof GUEST_EVENT_ALLOWLIST)[number];

const GUEST_ORIGIN = 'public_home';
const EMITTED_STORAGE_KEY = 'adscale.guest.imported-events.v1';

export function isAllowedGuestEvent(eventKey: string): eventKey is GuestEventKey {
  return (GUEST_EVENT_ALLOWLIST as readonly string[]).includes(eventKey);
}

export type GuestImportTelemetryInput = {
  workId: string;
  referenceCount: number;
};

export function buildGuestEventPayload(input: GuestImportTelemetryInput): {
  eventKey: GuestEventKey;
  properties: { creativeWorkId: string; origin: string; outputCount: number };
} {
  if (!isAllowedGuestEvent('guest_draft_imported')) throw new Error('Evento fora da allowlist.');
  if (typeof input.workId !== 'string' || input.workId.length === 0) {
    throw new Error('Evento fora da allowlist.');
  }
  if (!Number.isInteger(input.referenceCount) || input.referenceCount < 0) {
    throw new Error('Evento fora da allowlist.');
  }
  return {
    eventKey: 'guest_draft_imported',
    properties: {
      creativeWorkId: input.workId,
      origin: GUEST_ORIGIN,
      outputCount: input.referenceCount,
    },
  };
}

function loadEmittedWorkIds(): Set<string> {
  try {
    const raw = localStorage.getItem(EMITTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function markWorkIdEmitted(workId: string): void {
  try {
    const emitted = loadEmittedWorkIds();
    emitted.add(workId);
    localStorage.setItem(EMITTED_STORAGE_KEY, JSON.stringify([...emitted]));
  } catch {
    // Telemetry storage is best-effort; never blocks the import.
  }
}

/**
 * Fire-and-forget import event over POST /api/analytics/events (the
 * existing authenticated channel — visitors get 401, which is dropped).
 * Deduplicated per work id across retries and reloads; never throws and
 * never awaits, so analytics can neither block nor duplicate the import.
 */
export function recordGuestDraftImported(input: GuestImportTelemetryInput): void {
  let payload: ReturnType<typeof buildGuestEventPayload>;
  try {
    payload = buildGuestEventPayload(input);
  } catch {
    return;
  }
  try {
    if (loadEmittedWorkIds().has(payload.properties.creativeWorkId)) return;
    markWorkIdEmitted(payload.properties.creativeWorkId);
  } catch {
    return;
  }
  try {
    void fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    // Synchronous fetch failures (e.g. CSP) are dropped like async ones.
  }
}
