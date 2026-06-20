---
phase: 153
slug: calibration-rule-extraction
status: complete
created: 2026-06-20
depends_on:
  - 152
requirements:
  - RULE-01
  - RULE-02
  - RULE-03
  - RULE-04
---

# Phase 153 - Context

## Goal

Extract actionable rule candidates from system-human mismatches with human approval gate before affecting generation.

## Decisions (--auto)

1. **Deterministic extraction:** Group mismatches by bucket; map bucket → rule category.
2. **Persistence:** `calibration_rules` table with status candidate/approved/rejected/deprecated.
3. **Promotion gate:** Single-row + unclear_sample blocked without acknowledgeCaveats.
4. **Versioning:** version field on rules; deprecate rather than delete.
