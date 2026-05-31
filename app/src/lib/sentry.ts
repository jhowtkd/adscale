import * as Sentry from "@sentry/nextjs";

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
}
