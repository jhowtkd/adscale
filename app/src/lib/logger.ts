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

function shouldForwardRateLimitWarnToSentry(message: string): boolean {
  if (!message.includes("Rate limit")) return true;

  const now = Date.now();
  const bucket = rateLimitSentryBuckets.get(message) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > RATE_LIMIT_SENTRY_WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  rateLimitSentryBuckets.set(message, bucket);
  return bucket.count <= RATE_LIMIT_SENTRY_MAX_PER_WINDOW;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[MIN_LOG_LEVEL];
}

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (namespace: string) => Logger;
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

function forwardToSentry(level: LogLevel, args: unknown[]): void {
  if (level !== "error" && level !== "warn") return;
  if (!process.env.SENTRY_DSN) return;
  if (typeof window !== "undefined") return;

  const stringArgs = args.filter((a): a is string => typeof a === "string");
  const headline = stringArgs[0] ?? "";
  if (level === "warn" && headline && !shouldForwardRateLimitWarnToSentry(headline)) {
    return;
  }
  if (headline === "[api-error]") {
    return;
  }

  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    for (const arg of args) {
      if (arg instanceof Error) {
        if (level === "error") Sentry.captureException(arg);
      }
    }
    if (stringArgs.length > 0 && args.every((a) => !(a instanceof Error))) {
      const message = stringArgs.join(" ");
      if (level === "error") Sentry.captureMessage(message, "error");
      else if (level === "warn") Sentry.captureMessage(message, "warning");
    }
  });
}

function createLogger(namespace?: string): Logger {
  const prefix = namespace ? `[${namespace}]` : "";

  function log(level: LogLevel, ...args: unknown[]) {
    if (!shouldLog(level)) return;
    forwardToSentry(level, args);
    const timestamp = new Date().toISOString();
    const label = `${timestamp} ${level.toUpperCase().padStart(5)} ${prefix}`;
    if (level === "error") {
      console.error(label, ...args);
    } else if (level === "warn") {
      console.warn(label, ...args);
    } else if (level === "debug") {
      console.debug(label, ...args);
    } else {
      console.info(label, ...args);
    }
  }

  return {
    debug: (...args: unknown[]) => log("debug", ...args),
    info: (...args: unknown[]) => log("info", ...args),
    warn: (...args: unknown[]) => log("warn", ...args),
    error: (...args: unknown[]) => log("error", ...args),
    child: (ns: string) => createLogger(ns),
  };
}

export const logger = createLogger();