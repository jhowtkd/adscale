---
phase: 156
slug: calibration-evidence-and-release-gate
status: complete
created: 2026-06-20
depends_on:
  - 155
requirements:
  - EVIDENCE-01
  - EVIDENCE-02
  - EVIDENCE-03
  - EVIDENCE-04
---

# Phase 156 - Context

## Goal

Measure calibration learning and block inflated claims about agreement, quality, or customer-real validation.

## Decisions (--auto)

1. **Evidence report:** `buildCalibrationEvidenceReport()` aggregates agreement, mismatch trends, uncertainty reduction per brand.
2. **Claims matrix:** `evaluateClaimsMatrix()` blocks agreement/customer-real claims without sufficient sample and source evidence.
3. **Carry-forward v12.9 gates:** humanDecisionCount=0, fixture-only corpus — agreement claims remain blocked until Jhonatan supplies decisions.
4. **Milestone audit:** Declares calibrated/uncertain/operator-dependent items explicitly.
