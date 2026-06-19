---
phase: 144-cenbrap-corpus-seeding-and-calibration-rerun
verified: 2026-06-19T17:20:00Z
status: passed
score: 6/6
---

# Phase 144: Cenbrap Corpus Seeding and Calibration Rerun — Verification Report

**Phase Goal:** Desbloquear a calibracao humana criando corpus revisavel, re-rodando calibracao live e liberando contact sheet `review_ready`.

**Verified:** 2026-06-19T17:20:00Z
**Status:** passed

## Goal Achievement

Phase 144 achieved the **ideal path**: corpus seeded, live calibration rerun without `--template`, `review_ready > 0`, Phase 145 unblocked.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Target environment documented without secrets | ✓ VERIFIED | `144-CORPUS-RUN.md`: `env_source=app/.env.local`, `secret_exposed=false` |
| 2 | ≥2 Cenbrap campaigns with dual-verdict derivations | ✓ VERIFIED | `144-CORPUS-MANIFEST.json`: 2 campaigns; inspection `dualVerdictDerivationCount=2` |
| 3 | Live calibration `mode=live`, `evaluatedCampaignCount >= 2` | ✓ VERIFIED | `142-CENBRAP-CALIBRATION.json`: `mode=live`, `evaluatedCampaignCount=2` |
| 4 | Contact sheet `review_ready > 0` | ✓ VERIFIED | `142-CONTACT-SHEET.md`: `review_ready=2`, 2 live campaign sections |
| 5 | Missing dual-verdict rows counted (zero) | ✓ VERIFIED | `missingDualVerdictCount=0`; readiness pass documented |
| 6 | Phase 143 blocker history preserved | ✓ VERIFIED | Contact sheet + JSON evidenceNotes reference Phase 143 `insufficient_campaigns` |

**Score:** 6/6

## Required Artifacts

| Artifact | Expected | Status |
|----------|----------|--------|
| `144-CORPUS-RUN.md` | Inspection, seed, rerun, gate evidence | ✓ VERIFIED |
| `144-CORPUS-MANIFEST.json` | Source labels on all rows | ✓ VERIFIED |
| `142-CENBRAP-CALIBRATION.json` | Live mode, ≥2 campaigns | ✓ VERIFIED |
| `142-CONTACT-SHEET.md` | review_ready rows | ✓ VERIFIED |
| `app/scripts/seed-cenbrap-calibration-corpus.ts` | Idempotent seed path | ✓ VERIFIED |

## Phase 145 Gate

| Outcome | Value |
|---------|-------|
| `ready_for_jhonatan_review` | **yes** |
| `review_ready` | 2 |
| `phase_145_blocked` | no |
| `144-BLOCKERS.md` | not required |

## Claims Withheld

- Agreement rate: withheld (`decisionCount=0`)
- Quality claims: not inferred from synthetic_fixture corpus
- Source honesty: all rows labeled `synthetic_fixture`

---
*Phase: 144-cenbrap-corpus-seeding-and-calibration-rerun*
*Verified: 2026-06-19*
