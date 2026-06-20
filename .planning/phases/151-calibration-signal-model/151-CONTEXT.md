---
phase: 151
slug: calibration-signal-model
status: complete
created: 2026-06-20
requirements:
  - SIGNAL-01
  - SIGNAL-02
  - SIGNAL-03
  - SIGNAL-04
---

# Phase 151 - Context

## Goal

Define the canonical calibration signal contract — human decisions as durable teaching events, not disposable reviews.

## Decisions (--auto)

1. **Extend, don't replace:** Keep `output_decision_events` as the append-only evidence layer; add `calibration_signals` as the canonical calibration read/write model with explicit human verdict, system verdict refs, mismatch bucket, source label, reviewer/reviewedAt.
2. **Idempotency:** Reuse workspace+idempotency_key unique index pattern from output_decision_events.
3. **Cenbrap adapter:** `record-cenbrap-calibration-decisions.ts` writes both output_decision_events and calibration_signals on confirm.
4. **Sanitization:** Notes strip prompt/URL/secret patterns; no prompt or signed URL in calibration payload.
5. **Source labels:** `synthetic_fixture`, `operator_imported`, `real_customer` — fixture-only cannot masquerade as customer-real.

## Non-Goals

- Brand taste profiles (Phase 152)
- Rule extraction (Phase 153)
