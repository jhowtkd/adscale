# Architecture Research: v11.4 Beta Feedback Capture

**Date:** 2026-06-05
**Milestone:** v11.4 Beta Feedback Capture

## Integration Points

- **App shell:** Add a beta feedback trigger in the authenticated layout so users can report from any page.
- **Campaign workspace:** Add contextual report actions where campaign, derivation and asset IDs are known.
- **API boundary:** Add workspace-authenticated endpoints for creating reports and owner-only endpoints for listing/updating reports.
- **Database:** Add report, context and asset-reference tables with workspace indexes.
- **Sentry:** Attach Sentry feedback/event/replay IDs to the durable report when available; enrich Sentry with route, workspace, campaign and report IDs.
- **Assets:** Use existing campaign/workspace asset repositories and signed URL mechanisms for owner review.

## Data Flow

1. User opens feedback from app shell or contextual surface.
2. Client collector builds a small diagnostic context from route, locale, app state, active IDs, browser and bounded breadcrumbs.
3. User submits structured feedback.
4. API validates session, workspace membership, text size, allowed categories and referenced entity ownership.
5. Server creates durable feedback report and context rows.
6. Server optionally sends/correlates Sentry feedback with tags and associated event ID.
7. Owner reviews report in internal surface, opens linked assets through workspace-safe signed URLs, updates status and notes.

## Build Order

1. Data model and API contracts first because all UI depends on durable report shape and workspace isolation.
2. User-facing feedback widget second because it can submit once the create endpoint exists.
3. Context collectors and Sentry correlation third because they enhance the report without changing the core UX.
4. Owner triage fourth because it depends on stored reports and linked context.
5. Verification and privacy audit last because context capture needs end-to-end checks.

## New Versus Modified

### New

- Feedback report schema and repositories.
- `/api/beta-feedback` create route.
- Owner list/detail/update API routes.
- Feedback trigger/modal components.
- Client diagnostic context collector.
- Owner review page.

### Modified

- Authenticated app layout/sidebar/top bar for feedback entry.
- Campaign/derivation surfaces for contextual report actions.
- Sentry wrapper/config to set useful user/tags/context and correlate report IDs.
- Tests around workspace ownership, context bounds and report triage.

## Security Shape

- Every report belongs to exactly one workspace.
- User submission can only reference campaign/derivation/assets from the active workspace.
- Owner review is gated to owner/admin role or existing internal authorization pattern.
- Sensitive values in breadcrumbs and context are denied by default.
