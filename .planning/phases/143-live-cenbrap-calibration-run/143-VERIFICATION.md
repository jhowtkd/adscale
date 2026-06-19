---
phase: 143-live-cenbrap-calibration-run
verified: 2026-06-19T16:49:00Z
status: blocked
outcome: insufficient_campaigns
score: 2/5 acceptance criteria met
phase_144_ready: false
gaps:
  - truth: "At least two Cenbrap campaigns with reviewable derivation rows"
    status: failed
    reason: "evaluatedCampaignCount=0; live path works but corpus empty"
    artifacts:
      - path: ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"
        issue: "mode=live, status=no_live_data, campaigns=[]"
      - path: ".planning/phases/143-live-cenbrap-calibration-run/143-BLOCKERS.md"
        issue: "insufficient_campaigns primary blocker"
    missing:
      - "Seed ≥2 Cenbrap campaigns with derivations in app/.env.local database"
      - "Re-run run-cenbrap-calibration.ts without --template"
  - truth: "Rows expose olharVerdict and exportStatus for Jhonatan review"
    status: failed
    reason: "Zero derivation rows; contact sheet is template-only"
    artifacts:
      - path: ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md"
        issue: "review_ready=0; manual_pending template placeholder only"
    missing:
      - "Derivation rows with dual verdict payloads after corpus seeding"
human_verification:
  - test: "Confirm canonical database has Cenbrap campaign data"
    expected: "≥2 campaigns match conservative selection signals"
    why_human: "Campaign naming/workspace ownership is operator knowledge"
  - test: "Re-run live calibration after seeding"
    expected: "evaluatedCampaignCount>=2, contact sheet has real campaign sections"
    why_human: "Requires operational data in connected environment"
---

# Phase 143: Live Cenbrap Calibration Run — Verification Report

**Phase Goal:** Execute live Cenbrap calibration against real data, classify blockers honestly, and route reviewable rows vs missing evidence before Phase 144.

**Verified:** 2026-06-19T16:49:00Z
**Outcome:** `insufficient_campaigns`
**Phase 144:** blocked (no partial rows)

## Plan 143-01 Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Live DB connection without template fallback | ✓ PASS | `mode=live`, exit code 0, no `--template` |
| Secrets not exposed in artifacts | ✓ PASS | Safety scan clean in `143-LIVE-RUN.md` |
| Honest blocker when corpus empty | ✓ PASS | `insufficient_campaigns` in `143-BLOCKERS.md` |

## Plan 143-02 Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Missing dual-verdict rows counted as evidence gaps | ✓ PASS | Coverage table in `143-LIVE-RUN.md`; all counts 0 with corpus gap note |
| Rows classified by cause when possible | ✓ PASS | Vocabulary documented: `missing_olhar`, `missing_export`, `missing_both`, `no_output_key`, `legacy_derivation` |
| Contact sheet row readiness explicit | ✓ PASS | `142-CONTACT-SHEET.md` has `review_ready` / `manual_pending` table |
| Phase 144 gate documented | ✓ PASS | `143-BLOCKERS.md` states full block; no invented Jhonatan decisions |
| `live_ready_for_human_review` outcome | ✗ FAIL | Zero campaigns — outcome is `insufficient_campaigns` |

## Outcome Classification

| Outcome code | Applicable |
|--------------|------------|
| `live_ready_for_human_review` | No |
| `db_unavailable` | No — DB connected |
| `template_fallback` | No — `mode=live` |
| `insufficient_campaigns` | **Yes (primary)** |
| `no_output_derivations` | No — no campaigns at all |
| `missing_dual_verdict_coverage` | No — zero rows to classify |
| `artifact_shape_gap` | No — JSON shape sufficient |

## Phase 144 Readiness

- **Blocked** for agreement claims and human decision capture.
- **Partial review:** not applicable (`review_ready=0`).
- **Next step:** Operator seeds Cenbrap campaigns → re-run Phase 143 → re-evaluate dual-verdict coverage on populated artifact.

## Automated Checks (2026-06-19)

```
rg -n "missing_dual_verdict|missing_olhar|missing_export|missing_both|manual_pending|review_ready" \
  .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json \
  .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md \
  .planning/phases/143-live-cenbrap-calibration-run
→ vocabulary present in planning artifacts

test -f .planning/phases/143-live-cenbrap-calibration-run/143-LIVE-RUN.md → pass
test -f .planning/phases/143-live-cenbrap-calibration-run/143-BLOCKERS.md → pass
```
