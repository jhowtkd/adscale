import { PERSISTENCE_DENYLIST } from "@/server/repositories/assistant-types";

const DENIED_KEYS = new Set<string>([
  ...PERSISTENCE_DENYLIST,
  "signedUrl",
  "apiKey",
  "secret",
  "internalEvidence",
  "rawArgs",
]);

const SIGNED_URL_PATTERNS = [
  /X-Amz-Signature/i,
  /r2\.cloudflarestorage/i,
  /signedUrl/i,
  /[?&]X-Amz-/i,
];

const MAX_STRING_LENGTH = 4096;

export function containsSignedUrl(value: unknown): boolean {
  if (typeof value === "string") {
    return SIGNED_URL_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      return value.some((item) => containsSignedUrl(item));
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "signedUrl" || containsSignedUrl(nested)) {
        return true;
      }
    }
  }
  return false;
}

export function stripDeniedFields(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripDeniedFields(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (DENIED_KEYS.has(key)) continue;
    result[key] = stripDeniedFields(nested);
  }
  return result;
}

export class ContextScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextScopeError";
  }
}

function redactUrls(text: string): string {
  if (containsSignedUrl(text)) {
    return "[redacted-url]";
  }
  return text.length > MAX_STRING_LENGTH
    ? `${text.slice(0, MAX_STRING_LENGTH)}...`
    : text;
}

export function sanitizeContextValue(
  value: unknown,
  expectedClientProfileId?: string
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactUrls(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContextValue(item, expectedClientProfileId));
  }

  const obj = value as Record<string, unknown>;

  if (
    expectedClientProfileId &&
    typeof obj.clientProfileId === "string" &&
    obj.clientProfileId !== expectedClientProfileId
  ) {
    throw new ContextScopeError(
      "Cross-profile data detected in context payload"
    );
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(obj)) {
    if (DENIED_KEYS.has(key)) continue;
    if (key === "signedUrl") continue;

    if (typeof nested === "string") {
      result[key] = redactUrls(nested);
    } else {
      result[key] = sanitizeContextValue(nested, expectedClientProfileId);
    }
  }

  return result;
}
