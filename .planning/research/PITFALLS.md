# Pitfalls Research: v11.4 Beta Feedback Capture

**Date:** 2026-06-05
**Milestone:** v11.4 Beta Feedback Capture

## Pitfall: Too Much Data Collection

**Risk:** Session, log or network capture accidentally stores customer data, prompts, auth details or private creative content.

**Prevention:** Store structured IDs and asset references by default. Bound and sanitize breadcrumbs. Keep Sentry replay masking conservative. Make screenshots/session links optional and explicitly documented.

## Pitfall: Feedback Without Repro Context

**Risk:** Users submit "it failed" and the owner still has to ask what page, campaign, image or output they meant.

**Prevention:** Context collector must capture route, workspace, campaign, derivation, active flow step, asset references and Sentry IDs before submission.

## Pitfall: Cross-Workspace Leakage

**Risk:** A report references assets or derivations outside the submitting workspace, especially from stale client state.

**Prevention:** Server validates every referenced entity through workspace-scoped repositories before storing it.

## Pitfall: Sentry-Only Triage

**Risk:** Sentry captures errors but lacks product-specific status, owner notes, asset review and suggestion tracking.

**Prevention:** Durable ADScale report remains source of truth; Sentry IDs are correlation fields, not the primary feedback database.

## Pitfall: Widget Noise

**Risk:** Beta users ignore the tool if it feels like support software or interrupts creative work.

**Prevention:** Keep one global entry plus contextual "report this output/problem" actions. Use short categories and fast submission.

## Pitfall: Owner Surface Becomes Admin Sprawl

**Risk:** The first review UI grows into a full support/admin system.

**Prevention:** Scope to list, filters, detail, asset previews, notes and status. Defer assignment, SLA, notifications and public replies.
