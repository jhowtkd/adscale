import {
  MAX_BREADCRUMBS,
  MAX_STRING_LENGTH,
  SENSITIVE_KEY_PATTERN,
  TELEMETRY_DENIED_KEY_NAMES,
} from "./constants";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function isDeniedFlatKey(key: string): boolean {
  return TELEMETRY_DENIED_KEY_NAMES.has(key);
}

export function findDeniedKeys(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter((key) => isDeniedFlatKey(key));
}

export function truncateString(value: string, max = MAX_STRING_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function sanitizeDeepValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return undefined;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_BREADCRUMBS)
      .map((item) => sanitizeDeepValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const sanitized = sanitizeDeepValue(childValue, childKey);
      if (sanitized !== undefined) {
        result[childKey] = sanitized;
      }
    }
    return result;
  }

  return value;
}

export function enforcePayloadSize(
  payload: unknown,
  maxBytes: number,
  options?: { breadcrumbsKey?: string }
): unknown {
  const json = JSON.stringify(payload);
  if (json.length <= maxBytes) {
    return payload;
  }

  const breadcrumbsKey = options?.breadcrumbsKey ?? "breadcrumbs";

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record[breadcrumbsKey])) {
      const trimmed = { ...record };
      let breadcrumbs = record[breadcrumbsKey] as unknown[];
      while (breadcrumbs.length > 0) {
        trimmed[breadcrumbsKey] = breadcrumbs;
        if (JSON.stringify(trimmed).length <= maxBytes) {
          return trimmed;
        }
        breadcrumbs = breadcrumbs.slice(0, -1);
      }
      return { ...record, [breadcrumbsKey]: [] };
    }
  }

  return { truncated: true };
}
