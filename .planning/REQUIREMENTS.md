# Requirements: ADScale v11.4 Beta Feedback Capture

**Defined:** 2026-06-05
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v11.4 Requirements

### Feedback Submission

- [ ] **FBK-01**: Beta user can open a feedback form from the authenticated app shell without leaving the current page.
- [ ] **FBK-02**: Beta user can submit structured feedback with type, severity, category, message, and optional follow-up permission.
- [ ] **FBK-03**: Beta user can report a specific campaign or derivation from contextual surfaces so the report is linked to the exact object under review.
- [ ] **FBK-04**: User receives a clear success or failure state after submission without losing their current workflow.

### Diagnostic Context

- [ ] **CTX-01**: Each feedback report stores the current route, query context, locale, browser basics, app build/version when available, user ID, and workspace ID.
- [ ] **CTX-02**: Campaign feedback stores validated campaign context, active workflow step, campaign status, and attached base/style asset references when available.
- [ ] **CTX-03**: Derivation feedback stores validated derivation context, generation mode, target format, output key, quality verdict, hard failures, and related asset references when available.
- [ ] **CTX-04**: Client-side diagnostic capture includes a bounded and sanitized list of recent navigation, UI, fetch, and error breadcrumbs.
- [ ] **CTX-05**: Feedback reports expose a context completeness indicator so the owner can see whether page, logs, campaign, derivation, and assets were captured.

### Observability Correlation

- [ ] **OBS-01**: Feedback submission can attach Sentry feedback ID, last event ID, request correlation ID, and replay/session reference when available.
- [ ] **OBS-02**: Sentry events related to feedback are enriched with report ID, workspace ID, route, campaign ID, derivation ID, and feedback type tags.
- [ ] **OBS-03**: Server-side feedback handling logs report creation and validation failures with non-sensitive IDs that can be matched to the report.

### Owner Triage

- [ ] **TRI-01**: Owner can view a workspace-safe internal list of beta feedback reports filtered by status, type, severity, route, campaign, and date.
- [ ] **TRI-02**: Owner can open a feedback report detail view with message, diagnostic context, linked campaign/derivation, asset previews or signed links, and Sentry correlation IDs.
- [ ] **TRI-03**: Owner can update report status through new, reviewing, resolved, and archived states.
- [ ] **TRI-04**: Owner can add internal notes and resolution summary without exposing those notes back to beta users.

### Privacy and Access Control

- [ ] **SEC-01**: Feedback create and review APIs enforce authenticated workspace membership before accepting or returning any report data.
- [ ] **SEC-02**: Server validates every submitted campaign, derivation, campaign asset, workspace asset, and output reference against the active workspace before storing it.
- [ ] **SEC-03**: Feedback diagnostic context excludes secrets, auth tokens, raw request bodies, full prompts, and unrelated workspace data.
- [ ] **SEC-04**: Optional screenshot or session replay capture is disabled or privacy-masked by default unless explicitly enabled through configuration and visible UX copy.

### Verification

- [ ] **QA-01**: Tests cover feedback creation, validation limits, workspace isolation, entity ownership checks, status updates, and diagnostic sanitization.
- [ ] **QA-02**: Browser smoke verifies global feedback, contextual derivation feedback, owner triage detail, asset links, and mobile layout.
- [ ] **QA-03**: Final verification documents what context is captured, what is intentionally excluded, and how to analyze a submitted beta report.

## Future Requirements

| Requirement | Reason |
|-------------|--------|
| **FBK-FUT-01**: Public roadmap, voting, or community suggestion board | Current need is private beta diagnostics, not community product management. |
| **FBK-FUT-02**: Email notifications and owner assignment workflow | Useful after report volume is real; unnecessary for first beta loop. |
| **FBK-FUT-03**: AI-generated reproduction summaries | Defer until structured capture proves useful and enough reports exist. |
| **FBK-FUT-04**: Full session replay rollout for all beta users | Requires explicit privacy, sampling, retention and cost decisions. |
| **FBK-FUT-05**: Export feedback to Linear/Slack/Notion | Owner review inside ADScale is enough for the first milestone. |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separate unauthenticated feedback microservice | The useful context lives in the authenticated app and workspace model. |
| Public anonymous suggestions | Beta feedback needs identity and workspace context to diagnose issues. |
| Full support ticketing system | Status and notes are enough; assignment, SLA, replies and notifications can wait. |
| Collecting unrestricted console/network/session data | Privacy and data minimization matter more than raw volume. |
| Duplicating creative files into feedback storage | Store references and signed owner access instead of copying large private assets. |
| Allowing users to browse or reopen submitted reports | This milestone is owner analysis, not a customer support portal. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FBK-01 | TBD | Pending |
| FBK-02 | TBD | Pending |
| FBK-03 | TBD | Pending |
| FBK-04 | TBD | Pending |
| CTX-01 | TBD | Pending |
| CTX-02 | TBD | Pending |
| CTX-03 | TBD | Pending |
| CTX-04 | TBD | Pending |
| CTX-05 | TBD | Pending |
| OBS-01 | TBD | Pending |
| OBS-02 | TBD | Pending |
| OBS-03 | TBD | Pending |
| TRI-01 | TBD | Pending |
| TRI-02 | TBD | Pending |
| TRI-03 | TBD | Pending |
| TRI-04 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| QA-01 | TBD | Pending |
| QA-02 | TBD | Pending |
| QA-03 | TBD | Pending |

**Coverage:**
- v11.4 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23

---
*Requirements defined: 2026-06-05*
*Last updated: 2026-06-05 after v11.4 requirements definition*
