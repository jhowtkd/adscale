# Feature Research: v11.4 Beta Feedback Capture

**Date:** 2026-06-05
**Milestone:** v11.4 Beta Feedback Capture

## Table Stakes

### Feedback Entry

- Persistent but unobtrusive app-level entry point for beta users.
- Contextual entry points on campaign, derivation, generation error and review surfaces.
- Feedback types: bug, suggestion, confusing flow, output quality issue.
- Severity/impact field so owner can prioritize.
- Message textarea with clear length limit.
- Optional contact permission for follow-up.

### Diagnostic Package

- Automatic route/page capture.
- Authenticated workspace and user correlation.
- Campaign ID/name and active flow step when available.
- Derivation ID, generation mode, target format, quality verdict and hard failures when relevant.
- Asset references for base creative, style references and output derivations needed for analysis.
- Recent client breadcrumbs and failed requests, bounded by count and size.
- Sentry feedback/event/replay linkage when available.

### Owner Triage

- Report list filtered by status, type, severity, route, campaign and date.
- Detail view with feedback text, diagnostic context, asset links/previews and linked Sentry IDs.
- Status workflow: new, reviewing, resolved, archived.
- Internal notes and resolution reason.

## Differentiators

- One-click "report this output" from a derivation card that automatically includes the exact output, base asset, mode, prompt contract and QA/score result.
- "Context completeness" indicator on the owner detail view showing whether logs, page, assets and Sentry links were captured.
- Reproduction summary generated from structured fields, not freeform AI.
- Exportable diagnostic package for a single report.

## Anti-Features

- Public anonymous feedback wall.
- User voting or community suggestions.
- Broad session recording by default across every user.
- Collecting entire browser console or network payloads without filtering.
- Capturing unrelated workspace assets because they happen to be cached client-side.

## Complexity Notes

- The UX is small; the hard part is context correctness and privacy boundaries.
- Asset references need signed access or owner-only preview logic so a report remains diagnosable without duplicating files.
- Client breadcrumbs must be bounded and sanitized to avoid accidental prompt, token or customer data leakage.
