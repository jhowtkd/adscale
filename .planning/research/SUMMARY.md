# Research Summary: v11.4 Beta Feedback Capture

**Date:** 2026-06-05
**Milestone:** v11.4 Beta Feedback Capture

## Key Findings

ADScale should build this as a small authenticated in-app feedback and triage surface, not as a separate public microservice. The existing app already has the critical primitives: workspace auth, campaign and asset models, derivations, Sentry, request error capture and a logger.

Sentry is useful for feedback/event/replay correlation, breadcrumbs and request errors, but it should not be the only source of truth. ADScale needs durable product records for status, notes, campaign links, derivation links and asset references.

The main product value is not the feedback textarea. It is automatic diagnostic context: page, workspace, campaign, derivation, relevant assets, recent sanitized breadcrumbs, browser/build info and Sentry IDs.

## Stack Additions

- Drizzle tables/repositories for feedback reports, diagnostic context and asset references.
- In-app feedback widget/modal and contextual report actions.
- Owner-only review list/detail surface.
- Sentry enrichment and optional feedback/replay correlation.
- Bounded client diagnostic context collector.

## Table Stakes

- Beta users can submit bug reports and suggestions from anywhere in the authenticated app.
- Reports capture route, locale, workspace/user, active campaign/derivation and relevant asset references automatically.
- Owner can triage reports by status/type/severity and inspect diagnostic context.
- Workspace isolation and privacy are enforced server-side.

## Differentiators To Include

- "Report this output" from derivation cards with output, base asset, generation mode and QA/score context attached.
- Context completeness indicator in owner detail.
- Product-owned report status/notes independent of Sentry.

## Watch Outs

- Do not capture unrestricted console/network/session data.
- Do not let client-provided entity IDs bypass workspace validation.
- Do not duplicate large creative files into feedback storage unless explicitly needed.
- Do not expand into support ticketing, voting, SLA or public roadmap in this milestone.

## Source Notes

- Sentry Next.js documentation confirms support for `captureFeedback`, breadcrumbs, user/tags/context enrichment and `captureRequestError`.
- Sentry Session Replay documentation emphasizes default masking of text, images and user input; ADScale should keep that privacy posture unless a later explicit decision changes it.
- Repo inspection confirms existing local primitives in `app/src/instrumentation.ts`, `app/src/lib/sentry.ts`, `app/src/lib/logger.ts`, `app/src/server/db/schema.ts`, campaign assets, workspace assets and derivation feedback.
