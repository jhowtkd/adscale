const SENSITIVE_KEY_PATTERN =
  /token|password|secret|authorization|cookie|prompt|api[_-]?key/i;
const MAX_STRING_LENGTH = 500;
const MAX_BREADCRUMBS = 20;
const MAX_BREADCRUMB_BYTES = 1024;
const MAX_DIAGNOSTIC_BYTES = 32 * 1024;

export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

function truncateString(value: string, max = MAX_STRING_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return undefined;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_BREADCRUMBS)
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const sanitized = sanitizeValue(childValue, childKey);
      if (sanitized !== undefined) {
        result[childKey] = sanitized;
      }
    }
    return result;
  }

  return value;
}

function enforceDiagnosticSize(payload: unknown): unknown {
  const json = JSON.stringify(payload);
  if (json.length <= MAX_DIAGNOSTIC_BYTES) {
    return payload;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.breadcrumbs)) {
      const trimmed = { ...record };
      let breadcrumbs = record.breadcrumbs as unknown[];
      while (breadcrumbs.length > 0) {
        trimmed.breadcrumbs = breadcrumbs;
        if (JSON.stringify(trimmed).length <= MAX_DIAGNOSTIC_BYTES) {
          return trimmed;
        }
        breadcrumbs = breadcrumbs.slice(0, -1);
      }
      return { ...record, breadcrumbs: [] };
    }
  }

  return { truncated: true };
}

export function sanitizeDiagnosticContext(input: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(input ?? {});
  const bounded = enforceDiagnosticSize(sanitized);
  if (bounded && typeof bounded === "object" && !Array.isArray(bounded)) {
    return bounded as Record<string, unknown>;
  }
  return {};
}

export function sanitizeBreadcrumbs(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];

  return input
    .slice(0, MAX_BREADCRUMBS)
    .map((entry) => {
      const sanitized = sanitizeValue(entry);
      const json = JSON.stringify(sanitized);
      if (json.length <= MAX_BREADCRUMB_BYTES) {
        return sanitized;
      }
      return { type: "truncated", size: json.length };
    })
    .filter((entry) => entry !== undefined);
}
