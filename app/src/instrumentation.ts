import * as Sentry from "@sentry/nextjs";

/**
 * Scrub PII / secrets from Sentry events before they leave the process.
 * Matches header names and known sensitive field keys case-insensitively.
 */
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "stripe",
  "customer",
  "email",
  "reseturl",
  "resettoken",
];

function scrubStringRecord(record: Record<string, unknown> | undefined): void {
  if (!record) return;
  for (const key of Object.keys(record)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      record[key] = "[Filtered]";
    }
  }
}

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Headers (request + security) are the highest-leak vector.
  scrubStringRecord(event.request?.headers);
  scrubStringRecord(event.request?.cookies as Record<string, unknown> | undefined);
  // Extra / contexts / tags can carry ad-hoc diagnostic context.
  scrubStringRecord(event.extra as Record<string, unknown> | undefined);
  if (event.contexts) {
    for (const ctx of Object.values(event.contexts)) {
      if (ctx && typeof ctx === "object") {
        scrubStringRecord(ctx as Record<string, unknown>);
      }
    }
  }
  return event;
}

function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend,
    // Default PII capture off — we attach context explicitly where useful.
    sendDefaultPii: false,
  });
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initSentry();
    // Dynamic import: the Node observability SDK must never enter the
    // Edge bundle. Never throws into boot; failures degrade silently.
    const { initializeObservability } = await import(
      "./server/diagnostics/observability"
    );
    await initializeObservability("web");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    initSentry();
  }
}

export const onRequestError = Sentry.captureRequestError;
