export {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  MAX_BREADCRUMB_BYTES,
  MAX_BREADCRUMBS,
  MAX_STRING_LENGTH,
  MAX_TELEMETRY_BYTES,
  SENSITIVE_KEY_PATTERN,
  TELEMETRY_DENIED_KEY_NAMES,
} from "./constants";

export {
  enforcePayloadSize,
  findDeniedKeys,
  isDeniedFlatKey,
  isSensitiveKey,
  sanitizeDeepValue,
  truncateString,
} from "./core";

export { sanitizeBreadcrumbs, sanitizeDiagnosticContext } from "./diagnostic";

export {
  sanitizeForTelemetry,
  type MissionInsightTelemetryInput,
  type TelemetrySanitizeKind,
  type TelemetrySanitizeOptions,
} from "./telemetry";
