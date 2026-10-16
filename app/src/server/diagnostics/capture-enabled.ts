import { DIAGNOSTIC_FLAG_DEFAULTS } from "./contract";

/** Pure capture switch; emission hosts must not import the tracing bootstrap. */
export function isDiagnosticCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const value = env.OBSERVABILITY_ENABLED;
    return value === undefined ? DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED : value.trim().toLowerCase() === "true";
  } catch {
    return DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED;
  }
}
