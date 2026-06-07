# Requirements: ADScale v11.8 Loop de Aprendizado Beta

**Defined:** 2026-06-07  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.8 validates the cockpit + Ads Scientist progression with operator-run beta sessions, full first-party instrumentation, owner funnel analytics, and up to 5 evidence-driven friction fixes. No speculative new features, AI model changes, or third-party analytics.

## Requirements

### Instrumentation

- [x] **INST-01**: Developer can persist sanitized product events in a workspace-scoped `product_events` table via API.
- [x] **INST-02**: Server emits authoritative events on readiness block, credit spend, and mission completion boundaries.
- [x] **INST-03**: Client emits stage events for guided briefing, strategy recipe, and preview gate complete/abandon transitions.
- [x] **INST-04**: Operator can group events under a `beta_session` linked to a workspace.
- [x] **INST-05**: Event property allowlist excludes PII (prompts, emails, free-text user content, asset URLs).
- [x] **INST-06**: Tests cover event sanitization, workspace-scoped insert, and rejected disallowed properties.

### Beta Sessions (Operador)

- [ ] **SESS-01**: Operator can start and end a beta session linked to a target workspace.
- [ ] **SESS-02**: Operator can record structured notes per runbook stage (`67-BETA-RUNBOOK.md`) during a session.
- [ ] **SESS-03**: Operator completes at least 3 guided sessions following the existing beta runbook happy path.
- [ ] **SESS-04**: Session artifacts document date, workspace, stages completed, blockers, and linked event/session IDs.

### Owner Dashboard

- [ ] **DASH-01**: Owner can view mission conversion funnel (started vs completed per mission key).
- [ ] **DASH-02**: Owner can view cockpit stage funnel (readiness → briefing → recipe → preview → batch → approval).
- [ ] **DASH-03**: Owner can see credit surprise signals when estimated cost diverges from actual spend.
- [ ] **DASH-04**: Owner can record readiness false-positive overrides tied to session evidence.
- [ ] **DASH-05**: Owner can export funnel and event data as CSV from the `/feedback` analytics surface.

### Learning Evidence

- [ ] **LEARN-01**: Milestone produces a learning-answers document addressing all 10 v11.6 learning questions.
- [ ] **LEARN-02**: Each answer cites event counts, session notes, or feedback report IDs — not anecdote alone.
- [ ] **LEARN-03**: Document recommends v11.9 direction (readiness/briefing vs recipe/preview vs delivery/credits) per decision gate.

### Friction Fixes

- [ ] **FIX-01**: Team maintains a ranked friction backlog scored by frequency and runbook impact from session evidence.
- [ ] **FIX-02**: Up to 5 friction fixes ship, each linked to session/event evidence.
- [ ] **FIX-03**: Friction fixes are surgical (copy, CTA, validation, credit display) — no new AI models or cockpit modules.
- [ ] **FIX-04**: Each fix includes a regression test or focused verification artifact.
- [ ] **FIX-05**: Issues beyond the cap defer to a v11.9 backlog document with evidence preserved.

### Verification

- [x] **QA-01**: Integration tests prove events are recorded on readiness block and mission completion paths.
- [ ] **QA-02**: Owner analytics and export routes return 403 for non-platform-owner users.
- [ ] **QA-03**: `npm test`, `npm run lint`, and `npm run build` pass after milestone changes.

## Future Requirements

- External beta cohort invites and multi-workspace cohort comparison.
- Third-party analytics (PostHog/Mixpanel) if cohort exceeds ~20 workspaces.
- Automated E2E for the full instrumented Ads Scientist path.
- Direct Stripe top-up tied to funnel drop-off moments.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New AI models or generation behavior changes | Confounds learning loop; fixes must be UX/rules/copy |
| Third-party product analytics SDK | Operator-only 3–5 sessions; first-party events sufficient |
| Session replay (RRWeb) | Privacy and cost; stage events + operator notes enough |
| New progression levels or mission types | v11.7 loop just shipped; measure before expanding |
| External beta cohort automation | Milestone scoped to operator-only sessions |
| Unlimited friction fixes | Cap at 5 with evidence rubric to prevent scope creep |
| Real-time funnel WebSocket dashboard | Refresh-on-load sufficient for solo operator |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INST-01 | Phase 75 | Complete |
| INST-05 | Phase 75 | Complete |
| INST-06 | Phase 75 | Complete |
| INST-02 | Phase 76 | Complete |
| INST-03 | Phase 76 | Complete |
| INST-04 | Phase 76 | Complete |
| QA-01 | Phase 76 | Complete |
| SESS-01 | Phase 77 | Pending |
| SESS-02 | Phase 77 | Pending |
| SESS-03 | Phase 77 | Pending |
| SESS-04 | Phase 77 | Pending |
| DASH-01 | Phase 78 | Pending |
| DASH-02 | Phase 78 | Pending |
| DASH-03 | Phase 78 | Pending |
| DASH-04 | Phase 78 | Pending |
| DASH-05 | Phase 78 | Pending |
| LEARN-01 | Phase 78 | Pending |
| LEARN-02 | Phase 78 | Pending |
| QA-02 | Phase 78 | Pending |
| FIX-01 | Phase 79 | Pending |
| FIX-02 | Phase 79 | Pending |
| FIX-03 | Phase 79 | Pending |
| FIX-04 | Phase 79 | Pending |
| FIX-05 | Phase 79 | Pending |
| LEARN-03 | Phase 79 | Pending |
| QA-03 | Phase 79 | Pending |

**Coverage:**
- v11.8 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-07*
*Last updated: 2026-06-07 after roadmap draft*
