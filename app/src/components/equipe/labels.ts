// Enum → translated label with a raw-value fallback (#554).
//
// The API owns the vocabularies; when it returns a value this build
// doesn't know yet, the UI shows the raw value instead of a key path.

import type { EquipeEventView } from "./types";

export function enumLabel(
  translate: (key: string) => string,
  key: string,
): string {
  try {
    const value = translate(key);
    if (typeof value !== "string" || value.length === 0) return key;
    return value;
  } catch {
    return key;
  }
}

// next-intl forbids "." in message keys, so event types ride the messages
// with dots escaped (`escalation.opened` → `eventType.escalation__opened`).
// The ONLY way to render an event type label — every lookup goes through
// here, and unknown types fall back to the raw value, never a key path.
export function eventTypeLabel(
  translate: (key: string) => string,
  eventType: string,
): string {
  try {
    const value = translate(`eventType.${eventType.replaceAll(".", "__")}`);
    if (typeof value !== "string" || value.length === 0) return eventType;
    return value;
  } catch {
    return eventType;
  }
}

// Mirrors of the module vocabularies these helpers translate (#571).
// Membership is checked BEFORE looking the message up, so a value the
// API adds tomorrow renders raw instead of leaking a key path.
const STAFF_ROLES = new Set(["support", "quality", "operations"]);
const AGENT_ROLES = new Set([
  "strategist",
  "research",
  "writer",
  "reviewer_text",
  "reviewer_visual",
  "measurement",
]);
const CAUSE_VALUES = new Set([
  "missing_source",
  "outdated_offer",
  "model_error",
  "connection",
  "client_request",
  "isolation",
  "other",
  "no_client_response",
]);
const EXIT_VALUES = new Set(["fix", "confirm_no_issue", "defer_to_client"]);
const CHANNEL_VALUES = new Set(["phone", "whatsapp", "in_person", "other"]);
const CLOSE_REASON_VALUES = new Set(["resolved", "commercial_forwarded", "client_no_response"]);
const CLASSIFICATION_VALUES = new Set(["fact", "brand", "taste"]);

/** Never print a full uuid in prose — the first 8 chars identify it. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Shortens uuids embedded in free text (pause reasons carry the full
 * escalation id, e.g. `escalation <uuid>: ...`).
 */
export function shortenUuids(text: string): string {
  UUID_PATTERN.lastIndex = 0;
  return text.replace(UUID_PATTERN, (match) => match.slice(0, 8));
}

/** Staff role → atendimento/qualidade/operação, raw when unknown. */
export function staffRoleLabel(
  translate: (key: string) => string,
  role: string,
): string {
  if (!STAFF_ROLES.has(role)) return role;
  return enumLabel(translate, `staffRole.${role}`);
}

/**
 * Who acted, in words: the AI and the system read bare ("IA",
 * "Sistema" — a system actorId is a job name, never shown); people read
 * as kind/role plus a short id, never a full uuid.
 */
export function actorLabel(
  translate: (key: string) => string,
  event: Pick<EquipeEventView, "actorType" | "actorRole" | "actorId">,
): string {
  if (event.actorType === "agent") return enumLabel(translate, "actorType.agent");
  if (event.actorType === "system") return enumLabel(translate, "actorType.system");
  if (event.actorType === "staff") {
    const role =
      event.actorRole && STAFF_ROLES.has(event.actorRole)
        ? enumLabel(translate, `staffRole.${event.actorRole}`)
        : enumLabel(translate, "actorType.staff");
    return [role, event.actorId ? shortId(event.actorId) : null]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }
  if (event.actorType === "client_person") {
    return [enumLabel(translate, "actorType.client_person"), event.actorId ? shortId(event.actorId) : null]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }
  return [event.actorType, event.actorId ? shortId(event.actorId) : null]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/**
 * Attempt author → words: a staff role reads as the role, an agent
 * role as the specialty ("redação"), a bare agent as "IA", the client
 * as "Cliente". Unknown values render raw.
 */
export function authorRoleLabel(
  translate: (key: string) => string,
  role: string,
): string {
  if (STAFF_ROLES.has(role)) return enumLabel(translate, `staffRole.${role}`);
  if (AGENT_ROLES.has(role)) return enumLabel(translate, `agentRole.${role}`);
  if (role === "agent" || role === "client_person" || role === "system") {
    return enumLabel(translate, `actorType.${role}`);
  }
  return role;
}

const PAYLOAD_KEYS = [
  "cause",
  "exit",
  "reason",
  "lessonCandidate",
  "summary",
  "note",
  "channel",
  "connectionId",
  "from",
  "to",
] as const;

function payloadValue(
  translate: (key: string) => string,
  key: (typeof PAYLOAD_KEYS)[number],
  value: unknown,
): string {
  if (key === "connectionId" && typeof value === "string") return shortId(value);
  if (typeof value === "string") {
    if (key === "cause" && CAUSE_VALUES.has(value)) {
      return enumLabel(translate, `cause.${value}`);
    }
    if (key === "exit" && EXIT_VALUES.has(value)) {
      return enumLabel(translate, `exit.${value}`);
    }
    if (key === "channel" && CHANNEL_VALUES.has(value)) {
      return enumLabel(translate, `channel.${value}`);
    }
    // `reason` doubles as free text and as the close-reason enum —
    // translate the exact enum hits, keep prose as prose.
    if (key === "reason" && CLOSE_REASON_VALUES.has(value)) {
      return enumLabel(translate, `closeReason.${value}`);
    }
    if ((key === "from" || key === "to") && CLASSIFICATION_VALUES.has(value)) {
      return enumLabel(translate, `classification.${value}`);
    }
    return shortenUuids(truncate(value));
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const rendered = JSON.stringify(value);
    return shortenUuids(truncate(rendered));
  } catch {
    return "…";
  }
}

function truncate(value: string): string {
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

/**
 * Event payload → readable sentences ("Motivo: alegação de saúde…").
 * Keys read translated, enum values read translated, ids read short.
 */
export function payloadFacts(
  translate: (key: string) => string,
  payload: unknown,
): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as Record<string, unknown>;
  const facts: string[] = [];
  for (const key of PAYLOAD_KEYS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    facts.push(`${enumLabel(translate, `payloadKey.${key}`)}: ${payloadValue(translate, key, value)}`);
  }
  return facts;
}
