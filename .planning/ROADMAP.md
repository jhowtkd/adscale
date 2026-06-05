# Roadmap: ADScale v11.4 Beta Feedback Capture

**Created:** 2026-06-05
**Milestone:** v11.4
**Total phases:** 4
**Requirements:** 23/23 mapped
**Starting phase:** 53

## Overview

v11.4 creates a small authenticated feedback capture and owner triage surface for beta users. The roadmap treats the diagnostic package as the core value: reports must include page, workspace, campaign, derivation, relevant assets, sanitized breadcrumbs and Sentry/log correlation without leaking unrelated workspace data.

| Phase | Name | Goal | Requirements | Success Criteria |
|-------|------|------|--------------|------------------|
| 53 | Feedback Data Model and Secure API | Create the durable report model and secure create/update foundations. | FBK-02, OBS-03, SEC-01, SEC-02, SEC-03 | 5 |
| 54 | In-App Feedback Experience and Context Capture | Let beta users submit global/contextual feedback with automatic diagnostic context. | FBK-01, FBK-03, FBK-04, CTX-01, CTX-02, CTX-03, CTX-04, OBS-01, OBS-02, SEC-04 | 5 |
| 55 | Owner Triage and Asset Review | Give the owner a focused internal surface to inspect, filter, annotate and resolve reports. | CTX-05, TRI-01, TRI-02, TRI-03, TRI-04 | 5 |
| 56 | Verification and Privacy Audit | Prove the flow works end to end and document what is captured or excluded. | QA-01, QA-02, QA-03 | 5 |

## Phase Details

### Phase 53: Feedback Data Model and Secure API

**Goal:** Create the durable report model and secure create/update foundations.

**Requirements:** FBK-02, OBS-03, SEC-01, SEC-02, SEC-03

**Scope:**
- Add Drizzle schema, migration and repositories for feedback reports, diagnostic context and asset references.
- Add authenticated create endpoint for beta feedback with size limits, allowed categories and severity validation.
- Validate workspace membership and every referenced campaign, derivation, campaign asset, workspace asset and output reference server-side.
- Store non-sensitive IDs and normalized diagnostic JSON; exclude secrets, auth tokens, raw request bodies, full prompts and unrelated workspace data.
- Log report creation and validation failures with report/workspace/request IDs only.

**Success criteria:**
1. Feedback report data model supports status, type, severity, category, message, workspace, user, route/context and timestamps.
2. Create API rejects unauthenticated users and cross-workspace entity references.
3. Diagnostic payload is bounded and sanitization is covered by tests.
4. Server logs include enough IDs to correlate report creation without leaking creative content.
5. Migration and repository tests pass for create/read/update paths.

### Phase 54: In-App Feedback Experience and Context Capture

**Goal:** Let beta users submit global/contextual feedback with automatic diagnostic context.

**Requirements:** FBK-01, FBK-03, FBK-04, CTX-01, CTX-02, CTX-03, CTX-04, OBS-01, OBS-02, SEC-04

**Scope:**
- Add feedback trigger to the authenticated app shell.
- Add contextual "report this" actions for campaign/derivation surfaces where exact IDs are known.
- Build feedback modal with type, severity, category, message, optional follow-up permission and submit states.
- Build client diagnostic collector for route, query context, locale, browser basics, app build/version, active workspace, active campaign/derivation and recent sanitized breadcrumbs.
- Attach Sentry feedback/event/replay/request correlation when available and enrich Sentry with report/workspace/route/entity tags.
- Keep screenshot/session capture disabled or privacy-masked by default with explicit UX/config if enabled.

**Success criteria:**
1. User can open and submit feedback from the app shell without leaving the current page.
2. User can report a specific campaign or derivation and the stored report links to the correct object.
3. Submission success/failure states do not reset the user's current workflow.
4. Stored diagnostic context includes route, locale, workspace, relevant campaign/derivation and sanitized breadcrumbs.
5. Sentry correlation fields are attached when available and absent gracefully when not configured.

### Phase 55: Owner Triage and Asset Review

**Goal:** Give the owner a focused internal surface to inspect, filter, annotate and resolve reports.

**Requirements:** CTX-05, TRI-01, TRI-02, TRI-03, TRI-04

**Scope:**
- Add owner-only feedback list with filters for status, type, severity, route, campaign and date.
- Add detail view with message, diagnostic context, context completeness, linked campaign/derivation, asset previews or signed links and Sentry correlation IDs.
- Add status transitions: new, reviewing, resolved, archived.
- Add internal notes and resolution summary stored privately.
- Keep the surface narrow; do not add assignment, SLA, public replies or external ticket sync.

**Success criteria:**
1. Owner can find new reports quickly by status, severity and route.
2. Owner detail shows whether page, logs, campaign, derivation and assets were captured.
3. Linked assets open through workspace-safe signed access.
4. Status and internal notes persist and remain hidden from beta users.
5. Owner APIs enforce the same workspace/role restrictions as the UI.

### Phase 56: Verification and Privacy Audit

**Goal:** Prove the flow works end to end and document what is captured or excluded.

**Requirements:** QA-01, QA-02, QA-03

**Scope:**
- Add unit/integration tests for feedback creation, validation limits, workspace isolation, entity ownership checks, status updates and diagnostic sanitization.
- Run browser smoke for global feedback, contextual derivation feedback, owner triage detail, asset links and mobile layout.
- Verify Sentry/log correlation works when configured and degrades cleanly when disabled.
- Document captured fields, excluded sensitive data, report analysis workflow and residual risks.

**Success criteria:**
1. Automated tests cover create, context, ownership, triage update and sanitization paths.
2. Desktop browser smoke validates global feedback, contextual derivation feedback and owner triage.
3. Mobile browser smoke confirms feedback modal and owner detail do not overlap or trap text.
4. Verification document includes examples of captured context and intentionally excluded data.
5. Final handoff names how to analyze a submitted beta report end to end.

## Requirement Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FBK-01 | Phase 54 | Complete |
| FBK-02 | Phase 53 | Complete |
| FBK-03 | Phase 54 | Complete |
| FBK-04 | Phase 54 | Complete |
| CTX-01 | Phase 54 | Complete |
| CTX-02 | Phase 54 | Complete |
| CTX-03 | Phase 54 | Complete |
| CTX-04 | Phase 54 | Complete |
| CTX-05 | Phase 55 | Complete |
| OBS-01 | Phase 54 | Complete |
| OBS-02 | Phase 54 | Complete |
| OBS-03 | Phase 53 | Complete |
| TRI-01 | Phase 55 | Complete |
| TRI-02 | Phase 55 | Complete |
| TRI-03 | Phase 55 | Complete |
| TRI-04 | Phase 55 | Complete |
| SEC-01 | Phase 53 | Complete |
| SEC-02 | Phase 53 | Complete |
| SEC-03 | Phase 53 | Complete |
| SEC-04 | Phase 54 | Complete |
| QA-01 | Phase 56 | Complete |
| QA-02 | Phase 56 | Complete |
| QA-03 | Phase 56 | Complete |

**Coverage:**
- v11.4 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

## Build Order Rationale

1. Secure data/API first because all later UI depends on the durable report shape and workspace isolation.
2. User feedback and context capture second because the product value is created at submission time.
3. Owner triage third because it depends on real stored reports and linked context.
4. Verification/privacy audit last because the final risk is over-collection or under-collection of diagnostic context.

---
*Roadmap created: 2026-06-05*
