import { redactConsoleArg, redactTelemetry } from "./redact-telemetry";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLogLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error"
  ) {
    return configured;
  }
  return "info";
}

const MIN_LOG_LEVEL = resolveMinLogLevel();

const RATE_LIMIT_SENTRY_WINDOW_MS = 60_000;
const RATE_LIMIT_SENTRY_MAX_PER_WINDOW = 3;
const rateLimitSentryBuckets = new Map<string, { count: number; windowStart: number }>();

function allowBurst(
  buckets: Map<string, { count: number; windowStart: number }>,
  key: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= maxPerWindow;
}

function shouldForwardRateLimitWarnToSentry(message: string): boolean {
  if (!message.includes("Rate limit")) return true;
  return allowBurst(
    rateLimitSentryBuckets,
    message,
    RATE_LIMIT_SENTRY_MAX_PER_WINDOW,
    RATE_LIMIT_SENTRY_WINDOW_MS
  );
}

const EMERGENCY_WINDOW_MS = 60_000;
const EMERGENCY_MAX_PER_WINDOW = 3;
const emergencyBuckets = new Map<string, { count: number; windowStart: number }>();
let inEmergencyLog = false;

function emergencyLogFailure(): void {
  if (inEmergencyLog) return;
  inEmergencyLog = true;
  try {
    if (allowBurst(emergencyBuckets, "logger-failure", EMERGENCY_MAX_PER_WINDOW, EMERGENCY_WINDOW_MS)) {
      console.error("[logger] internal failure; original payload dropped");
    }
  } catch {
    // The emergency path must never throw either.
  } finally {
    inEmergencyLog = false;
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[MIN_LOG_LEVEL];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStructuredEventPayload(
  value: unknown
): value is Record<string, unknown> & { event: string } {
  return (
    isPlainRecord(value) && "event" in value && typeof value.event === "string"
  );
}

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (namespace: string) => Logger;
}

/**
 * Single normalization shared by console output and explicit capture
 * (trace-385). Every supported log shape — strings, plain-object context,
 * top-level Errors, nested Errors — becomes one record so both destinations
 * agree on message, context and incident identity.
 */
interface NormalizedLogRecord {
  level: LogLevel;
  /** Joined string args ("" when the call carries no strings). */
  message: string;
  /** Merged plain-object args; later args win on key conflicts. */
  context: Record<string, unknown>;
  /** First top-level Error, else the first Error nested one level in context. */
  error: Error | undefined;
  /** `event` field when the context carries one. */
  event: string | undefined;
  /** True for the single structured `{ event, ... }` call shape. */
  structured: boolean;
  /** Headline used for Sentry messages and alert throttling. */
  headline: string;
}

function findNestedError(context: Record<string, unknown>): Error | undefined {
  for (const value of Object.values(context)) {
    if (value instanceof Error) return value;
  }
  return undefined;
}

function normalizeLogRecord(level: LogLevel, args: unknown[]): NormalizedLogRecord {
  const strings = args.filter((a): a is string => typeof a === "string");
  const message = strings.join(" ");
  const topLevelError = args.find((a): a is Error => a instanceof Error);
  const context: Record<string, unknown> = {};
  for (const arg of args) {
    if (isPlainRecord(arg)) Object.assign(context, arg);
  }
  const error = topLevelError ?? findNestedError(context);
  const event = typeof context.event === "string" ? context.event : undefined;
  const structured = args.length === 1 && isStructuredEventPayload(args[0]);
  const contextMessage =
    typeof context.message === "string" ? context.message : "";
  const headline = message || contextMessage || event || "";
  return { level, message, context, error, event, structured, headline };
}

let sentryModule: typeof import("@sentry/nextjs") | null | undefined;

async function loadSentry(): Promise<typeof import("@sentry/nextjs") | null> {
  if (!process.env.SENTRY_DSN) return null;
  if (sentryModule !== undefined) return sentryModule;
  try {
    sentryModule = await import("@sentry/nextjs");
  } catch {
    sentryModule = null;
  }
  return sentryModule;
}

/**
 * Identity of exceptions already captured in this process. Dedup is by
 * object identity: re-logging the SAME exception never creates a second
 * incident, while distinct attempts (distinct Error objects, even with
 * identical messages) stay distinct.
 */
const capturedErrors = new WeakSet<object>();

function markCaptured(error: object): void {
  capturedErrors.add(error);
}

function wasCaptured(error: object): boolean {
  return capturedErrors.has(error);
}

type CaptureTags = Record<string, string | number | boolean>;

function redactedExtra(
  context: Record<string, unknown>,
  skipValue: unknown,
  namespace?: string,
  logMessage?: string
): Record<string, unknown> {
  const entries = Object.entries(context).filter(([, value]) => value !== skipValue);
  const redacted = redactTelemetry(Object.fromEntries(entries));
  const extra: Record<string, unknown> =
    typeof redacted === "object" && redacted !== null
      ? (redacted as Record<string, unknown>)
      : {};
  if (namespace) extra.namespace = namespace;
  if (logMessage) extra.logMessage = logMessage;
  return extra;
}

/**
 * Explicit single capture (trace-385). Captures `error` at most once per
 * object identity no matter how many boundaries observe it, with redacted
 * context. Never throws; SDK failures are swallowed.
 */
export function captureExceptionOnce(
  error: unknown,
  context?: Record<string, unknown>,
  tags?: CaptureTags
): void {
  try {
    if (!process.env.SENTRY_DSN) return;
    if (typeof window !== "undefined") return;
    if (typeof error === "object" && error !== null) {
      if (wasCaptured(error)) return;
      markCaptured(error);
    }
    void loadSentry()
      .then((Sentry) => {
        if (!Sentry) return;
        try {
          Sentry.captureException(
            error,
            context || tags
              ? {
                  ...(tags ? { tags } : {}),
                  extra: redactedExtra(context ?? {}, undefined),
                }
              : undefined
          );
        } catch {
          // SDK failures must never break callers.
        }
      })
      .catch(() => {
        // loadSentry never rejects, but never let capture float an error.
      });
  } catch {
    // Explicit capture must never throw.
  }
}

function forwardToSentry(
  record: NormalizedLogRecord,
  namespace?: string
): void {
  try {
    if (record.level !== "error" && record.level !== "warn") return;
    if (!process.env.SENTRY_DSN) return;
    if (typeof window !== "undefined") return;

    if (record.level === "warn" && record.headline && !shouldForwardRateLimitWarnToSentry(record.headline)) {
      return;
    }
    if (record.headline === "[api-error]") {
      return;
    }

    if (record.error) {
      // No-duplicate rule: an Error-bearing call captures the exception only,
      // never exception-plus-message; an already-captured exception (the
      // capture-plus-log pair) stays console-only.
      if (wasCaptured(record.error)) return;
      markCaptured(record.error);
      const error = record.error;
      const extra = redactedExtra(record.context, error, namespace, record.message || undefined);
      void loadSentry()
        .then((Sentry) => {
          if (!Sentry) return;
          try {
            Sentry.captureException(error, { extra });
          } catch {
            // SDK failures must never break callers.
          }
        })
        .catch(() => {});
      return;
    }

    if (!record.headline) return;
    const message = record.headline;
    const extra = redactedExtra(record.context, undefined, namespace);
    const sentryLevel = record.level === "error" ? "error" : "warning";
    void loadSentry()
      .then((Sentry) => {
        if (!Sentry) return;
        try {
          Sentry.captureMessage(message, { level: sentryLevel, extra });
        } catch {
          // SDK failures must never break callers.
        }
      })
      .catch(() => {});
  } catch {
    // Forwarding must never break logging.
  }
}

function safeStringify(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      event: "logger_serialization_failed",
      level: payload.level,
      timestamp: payload.timestamp,
    });
  }
}

function createLogger(namespace?: string): Logger {
  const prefix = namespace ? `[${namespace}]` : "";

  function write(level: LogLevel, ...args: unknown[]): void {
    if (level === "error") {
      console.error(...args);
    } else if (level === "warn") {
      console.warn(...args);
    } else if (level === "debug") {
      console.debug(...args);
    } else {
      console.info(...args);
    }
  }

  function log(level: LogLevel, ...args: unknown[]) {
    try {
      if (!shouldLog(level)) return;
      const record = normalizeLogRecord(level, args);
      forwardToSentry(record, namespace);
      const timestamp = new Date().toISOString();
      if (record.structured) {
        const redacted = redactTelemetry(record.context);
        const payload = safeStringify({
          ...((typeof redacted === "object" && redacted !== null
            ? redacted
            : {}) as Record<string, unknown>),
          timestamp,
          level,
          ...(namespace ? { namespace } : {}),
        });
        write(level, payload);
        return;
      }
      const label = `${timestamp} ${level.toUpperCase().padStart(5)} ${prefix}`;
      write(
        level,
        label,
        ...args.map((arg) => {
          try {
            return redactConsoleArg(arg);
          } catch {
            return "[Unreadable]";
          }
        })
      );
    } catch {
      emergencyLogFailure();
    }
  }

  return {
    debug: (...args: unknown[]) => log("debug", ...args),
    info: (...args: unknown[]) => log("info", ...args),
    warn: (...args: unknown[]) => log("warn", ...args),
    error: (...args: unknown[]) => log("error", ...args),
    child: (ns: string) =>
      createLogger(namespace ? `${namespace}:${ns}` : ns),
  };
}

export const logger = createLogger();
