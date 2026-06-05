"use client";

import * as Sentry from "@sentry/nextjs";
import { getFeedbackBreadcrumbs } from "./breadcrumb-store";
import type { FeedbackContextPayload } from "./types";

function getBrowserBasics() {
  if (typeof window === "undefined") return {};
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    online: navigator.onLine,
  };
}

function getAppBuildInfo() {
  return {
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    environment: process.env.NODE_ENV,
  };
}

export function collectSentryCorrelation(): Record<string, string | undefined> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) {
    return {};
  }

  const propagation = Sentry.getCurrentScope().getPropagationContext();

  return {
    traceId: propagation.traceId,
  };
}

export function collectDiagnosticContext(
  locale: string,
  route: string,
  searchParams?: string
): Record<string, unknown> {
  return {
    route,
    query: searchParams || undefined,
    locale,
    browser: getBrowserBasics(),
    app: getAppBuildInfo(),
    breadcrumbs: getFeedbackBreadcrumbs(),
    capturedAt: new Date().toISOString(),
  };
}

export function buildContextCompleteness(
  payload: FeedbackContextPayload
): Record<string, boolean> {
  return {
    page: Boolean(payload.route),
    logs: getFeedbackBreadcrumbs().length > 0,
    campaign: Boolean(payload.campaignId),
    derivation: Boolean(payload.derivationId),
    assets: (payload.assetRefs?.length ?? 0) > 0,
    sentry: Object.keys(collectSentryCorrelation()).length > 0,
  };
}

export function tagSentryFeedbackContext(tags: Record<string, string | undefined>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) return;
  const scope = Sentry.getCurrentScope();
  for (const [key, value] of Object.entries(tags)) {
    if (value) scope.setTag(key, value);
  }
}
