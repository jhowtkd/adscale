"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && process.env.SENTRY_DSN) {
      Sentry.captureMessage("Sentry initialized in development", "debug");
    }
  }, []);

  return <>{children}</>;
}
