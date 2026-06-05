# Stack Research: v11.4 Beta Feedback Capture

**Date:** 2026-06-05
**Milestone:** v11.4 Beta Feedback Capture

## Existing Stack To Reuse

- Next.js App Router, React, TypeScript, Tailwind and shadcn/ui for the feedback widget, modal and owner review surface.
- Better Auth and workspace membership for authenticated, workspace-scoped submission and review.
- Drizzle/Neon for durable feedback reports and diagnostic package metadata.
- Cloudflare R2 for existing campaign/workspace assets; feedback reports should store asset references and signed-preview access rather than duplicate creative files.
- Sentry is already initialized through `app/src/instrumentation.ts`, `app/src/lib/sentry.ts`, `SentryErrorBoundary`, and `captureRequestError`.
- Existing logger can continue to emit server context; this milestone should add correlation IDs and report IDs around feedback submission.

## Sentry Capabilities Relevant To This Milestone

- `captureFeedback` can submit a feedback message with URL, source, tags, associated event ID and extra capture context.
- Sentry scope enrichment supports user, tags, contexts, extras and breadcrumbs, which are useful for workspace/campaign/derivation correlation.
- Breadcrumbs can capture recent UI, navigation, fetch and console context before a report, but must be filtered for sensitive values.
- Session Replay can provide visual history, but default privacy behavior masks text, images and inputs; ADScale should keep that conservative default unless an explicit, scoped exception is needed.
- Sentry logs are useful for searching related text logs alongside errors, but the product still needs its own database record because owner triage status, campaign links and asset references are product data.

## Recommended Additions

- Feedback report database tables:
  - `beta_feedback_reports`: workspace, user, type, severity, category, message, route, locale, status, Sentry feedback ID/event ID/replay ID, created/resolved timestamps.
  - `beta_feedback_context`: normalized diagnostic JSON for page state, campaign, derivation, client breadcrumbs, browser info, build/version and request correlation.
  - `beta_feedback_assets`: references to campaign assets, workspace assets and derivation outputs needed to analyze the report.
- Small client context collector:
  - current pathname/search/hash
  - locale
  - workspace ID
  - active campaign/derivation IDs if present
  - visible step/tab/action
  - recent bounded client breadcrumbs
  - last Sentry event ID when available
- Owner-only review route inside the authenticated app, not in the public marketing site.

## What Not To Add

- Do not create a separate unauthenticated microservice for beta feedback.
- Do not upload raw screenshots by default; store optional screenshot/session references only if privacy and storage boundaries are explicit.
- Do not expose full logs or raw prompts to beta users or across workspaces.

## Sources

- Sentry Next.js docs via Context7: `captureFeedback`, breadcrumbs, user/tags/context, `captureRequestError`.
- Sentry Session Replay docs: default masking for text, images and inputs.
- ADScale repo inspection: existing Sentry, logger, campaign assets, workspace assets and derivation feedback primitives.
