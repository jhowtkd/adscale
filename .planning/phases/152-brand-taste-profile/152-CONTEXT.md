---
phase: 152
slug: brand-taste-profile
status: complete
created: 2026-06-20
depends_on:
  - 151
requirements:
  - PROFILE-01
  - PROFILE-02
  - PROFILE-03
  - PROFILE-04
---

# Phase 152 - Context

## Goal

Aggregate calibration signals into an inspectable brand taste profile with explicit evidence level and source composition.

## Decisions (--auto)

1. **Read model, not new table:** `buildBrandTasteProfile()` computes profile from calibration_signals at query time.
2. **Pattern separation:** entra → positivePatterns, nao_entra → rejectionPatterns, quase → quasePatterns; grouped by mismatch bucket.
3. **Evidence levels:** uncalibrated (0), seed_calibrated (≥5), assisted (≥10), evidence_backed (≥10 + ≥3 real_customer).
4. **Caveats:** Fixture-only profiles always carry caveat blocking customer-real claims.
