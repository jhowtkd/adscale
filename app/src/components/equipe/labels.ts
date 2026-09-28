// Enum → translated label with a raw-value fallback (#554).
//
// The API owns the vocabularies; when it returns a value this build
// doesn't know yet, the UI shows the raw value instead of a key path.

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
