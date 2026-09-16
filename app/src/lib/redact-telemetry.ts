/**
 * Shared telemetry redaction (trace-385).
 *
 * Browser-compatible by construction: this module has no Node-only imports
 * and no environment access, so server and client telemetry can share it.
 * Proven by the colocated test (runs in jsdom + asserts the source stays
 * free of `node:` imports).
 *
 * Rules:
 * - Never mutates the input; plain objects/arrays/Errors are rebuilt.
 * - Never throws: hostile inputs (cycles, throwing getters, bigint, deep
 *   nesting) degrade to markers instead of breaking the caller.
 * - Secret-bearing keys are redacted by name. `token` is NOT a generic veto:
 *   `inputTokens`/`outputTokens` (usage counters) pass through while
 *   `access_token`, cookies, keys and authorization material are redacted.
 */

export const REDACTED = "[REDACTED]";
export const CIRCULAR = "[Circular]";
export const TRUNCATED = "[Truncated]";
export const UNREADABLE = "[Unreadable]";

const MAX_DEPTH = 32;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const TOKEN_COUNT_ALLOWLIST = new Set(["inputtokens", "outputtokens"]);

const SENSITIVE_EXACT = new Set([
  "password",
  "passwd",
  "pwd",
  "pass",
  "secret",
  "clientsecret",
  "apisecret",
  "apikey",
  "accesskey",
  "secretkey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "sessiontoken",
  "token",
  "tokens",
  "authorization",
  "bearer",
  "cookie",
  "cookies",
  "setcookie",
  "privatekey",
  "passphrase",
  "sessionid",
  "signature",
  "sig",
]);

export function isSensitiveTelemetryKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized.length === 0) return false;
  if (TOKEN_COUNT_ALLOWLIST.has(normalized)) return false;
  if (SENSITIVE_EXACT.has(normalized)) return true;
  if (normalized.endsWith("token") || normalized.endsWith("tokens")) return true;
  if (normalized.endsWith("apikey") || normalized.endsWith("apisecret")) return true;
  if (normalized.includes("password") || normalized.includes("passwd")) return true;
  if (normalized.includes("secret")) return true;
  if (normalized.includes("privatekey")) return true;
  if (normalized.includes("cookie")) return true;
  if (normalized.includes("authoriz")) return true;
  if (normalized.includes("credential")) return true;
  if (normalized.includes("passphrase")) return true;
  return false;
}

const BEARER_RE = /(Bearer\s+)[A-Za-z0-9\-._~+/=]+/g;
const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const SECRET_ASSIGNMENT_RE =
  /\b(password|passwd|pwd|secret|client_secret|api[_-]?key|api[_-]?secret|access[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?token|token|authorization|bearer|private[_-]?key|passphrase|session[_-]?id|cookie)\b(\s*[:=]\s*)([^\s,;&"']+)/gi;

function redactUrlString(value: string): string {
  if (!value.includes("://")) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!url.search && !url.username && !url.password) return value;
  try {
    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = REDACTED;
    }
    for (const name of [...url.searchParams.keys()]) {
      if (isSensitiveTelemetryKey(name)) url.searchParams.set(name, REDACTED);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function redactString(value: string): string {
  const out = value
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(PRIVATE_KEY_RE, REDACTED)
    .replace(SECRET_ASSIGNMENT_RE, `$1$2${REDACTED}`);
  return redactUrlString(out);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type RedactedErrorShape = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  [key: string]: unknown;
};

function redactErrorToPlain(
  error: Error,
  seen: WeakMap<object, unknown>,
  depth: number
): RedactedErrorShape {
  const shape: RedactedErrorShape = {
    name: error.name,
    message: redactString(error.message),
  };
  seen.set(error, shape);
  if (typeof error.stack === "string") shape.stack = redactString(error.stack);
  if ("cause" in error && error.cause !== undefined) {
    shape.cause = redactValue(error.cause, seen, depth + 1);
  }
  const errorRecord = error as unknown as Record<string, unknown>;
  for (const key of Object.keys(error)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause") {
      continue;
    }
    let raw: unknown;
    try {
      raw = errorRecord[key];
    } catch {
      shape[key] = UNREADABLE;
      continue;
    }
    shape[key] = isSensitiveTelemetryKey(key)
      ? REDACTED
      : redactValue(raw, seen, depth + 1);
  }
  return shape;
}

function cloneErrorRedacted(
  error: Error,
  seen: WeakMap<object, unknown>,
  depth: number
): Error {
  const clone = new Error(redactString(error.message));
  seen.set(error, clone);
  clone.name = error.name;
  if (typeof error.stack === "string") clone.stack = redactString(error.stack);
  if ("cause" in error && error.cause !== undefined) {
    (clone as { cause?: unknown }).cause = redactConsoleValue(
      error.cause,
      seen,
      depth + 1
    );
  }
  const errorRecord = error as unknown as Record<string, unknown>;
  const cloneRecord = clone as unknown as Record<string, unknown>;
  for (const key of Object.keys(error)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause") {
      continue;
    }
    let raw: unknown;
    try {
      raw = errorRecord[key];
    } catch {
      cloneRecord[key] = UNREADABLE;
      continue;
    }
    cloneRecord[key] = isSensitiveTelemetryKey(key)
      ? REDACTED
      : redactConsoleValue(raw, seen, depth + 1);
  }
  return clone;
}

function redactValue(
  value: unknown,
  seen: WeakMap<object, unknown>,
  depth: number
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return value;
  if (depth >= MAX_DEPTH) return TRUNCATED;
  const container = value as object;
  if (seen.has(container)) return CIRCULAR;
  if (value instanceof Error) return redactErrorToPlain(value, seen, depth);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(container, out);
    for (const item of value) out.push(redactValue(item, seen, depth + 1));
    return out;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    seen.set(container, out);
    for (const key of Object.keys(value)) {
      let raw: unknown;
      try {
        raw = value[key];
      } catch {
        out[key] = UNREADABLE;
        continue;
      }
      out[key] = isSensitiveTelemetryKey(key)
        ? REDACTED
        : redactValue(raw, seen, depth + 1);
    }
    return out;
  }
  return value;
}

function redactConsoleValue(
  value: unknown,
  seen: WeakMap<object, unknown>,
  depth: number
): unknown {
  if (value instanceof Error) {
    if (seen.has(value)) return CIRCULAR;
    return cloneErrorRedacted(value, seen, depth);
  }
  return redactValue(value, seen, depth);
}

/**
 * Deep-redact `value` into JSON-serializable plain data. Errors become plain
 * `{ name, message, stack?, cause?, ...props }` shapes. Never mutates the
 * input and never throws.
 */
export function redactTelemetry(value: unknown): unknown {
  try {
    return redactValue(value, new WeakMap(), 0);
  } catch {
    return { redacted: true, error: "[redaction unavailable]" };
  }
}

/**
 * Redact a single console argument, preserving `Error` instances as redacted
 * clones so console output keeps native Error rendering. Never mutates the
 * input and never throws.
 */
export function redactConsoleArg(value: unknown): unknown {
  try {
    return redactConsoleValue(value, new WeakMap(), 0);
  } catch {
    return UNREADABLE;
  }
}
