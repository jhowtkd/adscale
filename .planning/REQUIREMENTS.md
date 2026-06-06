# Requirements: ADScale v11.6.1 Ship Readiness and Beta Activation

**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.6.1 is a release-readiness milestone. It does not add new product surfaces. It closes the remaining v11.6 ship caveats by proving the Creative Strategy Cockpit in a deployed environment, recording production evidence, and archiving the milestone cleanly.

## Requirements

### Ship Readiness

- [x] **SHIP-01**: Operator can run the full v11.6 cockpit browser smoke on staging or production and record pass/fail evidence for every checklist step.
- [x] **SHIP-02**: Operator can verify deployed git ref, health, required environment variables, and migration/schema readiness before beta ship.
- [x] **SHIP-03**: Post-review fixes for recipe selection, preflight rerun billing, and handoff accuracy are included in the release and covered by focused tests.
- [x] **SHIP-04**: v11.6 audit caveats are either resolved or explicitly carried forward with owner, evidence, and next action.
- [x] **SHIP-05**: v11.6 artifacts are archived through the GSD milestone completion flow without losing release evidence.

### Beta Activation

- [x] **BETA-01**: Beta operator has a concise runbook for the first cockpit beta sessions, including setup, credit expectations, privacy notes, and fallback steps.
- [x] **BETA-02**: Owner can collect cockpit-specific beta feedback and map it back to readiness, briefing, recipe, preview, or approval-package stages.
- [x] **BETA-03**: Release handoff identifies the next product learning questions before any larger v11.7 feature build begins.

## Future Requirements

- Direct Meta/TikTok/Google Ads publishing from approved packages.
- Multi-stakeholder comment threads on public share pages.
- Automatic budget optimizer across recipes and target formats.
- Competitor upload workflow as a first-class campaign setup path.
- Full Playwright E2E automation for the cockpit path.

## Out of Scope

- New AI model or provider migration.
- New strategy recipes beyond the v11.6 catalog.
- Paid media platform integrations.
- Replacing the existing campaign form entirely.
- Public marketing site changes.
- Multi-client comment/approval workflow on share links.

## Traceability

| Requirement | Phase |
|-------------|-------|
| SHIP-01 | 66 |
| SHIP-02 | 66 |
| SHIP-03 | 66 |
| SHIP-04 | 67 |
| SHIP-05 | 67 |
| BETA-01 | 67 |
| BETA-02 | 67 |
| BETA-03 | 67 |
