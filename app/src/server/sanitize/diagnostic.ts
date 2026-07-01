import {
  MAX_BREADCRUMB_BYTES,
  MAX_BREADCRUMBS,
  MAX_TELEMETRY_BYTES,
} from "./constants";
import { enforcePayloadSize, sanitizeDeepValue } from "./core";

export function sanitizeDiagnosticContext(input: unknown): Record<string, unknown> {
  const sanitized = sanitizeDeepValue(input ?? {});
  const bounded = enforcePayloadSize(sanitized, MAX_TELEMETRY_BYTES);
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
      const sanitized = sanitizeDeepValue(entry);
      const json = JSON.stringify(sanitized);
      if (json.length <= MAX_BREADCRUMB_BYTES) {
        return sanitized;
      }
      return { type: "truncated", size: json.length };
    })
    .filter((entry) => entry !== undefined);
}
