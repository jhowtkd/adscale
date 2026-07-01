/** Regex applied to object keys during deep telemetry sanitization. */
export const SENSITIVE_KEY_PATTERN =
  /token|password|secret|authorization|cookie|prompt|api[_-]?key/i;

/** Explicit key denylist for flat property bags (beta analytics). */
export const TELEMETRY_DENIED_KEY_NAMES = new Set([
  "prompt",
  "email",
  "message",
  "url",
  "assetUrl",
  "token",
  "authToken",
  "breadcrumbs",
  "diagnosticContext",
  "note",
  "freeText",
]);

export const MAX_STRING_LENGTH = 500;
export const MAX_BREADCRUMBS = 20;
export const MAX_BREADCRUMB_BYTES = 1024;
export const MAX_TELEMETRY_BYTES = 32 * 1024;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;
