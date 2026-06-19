---
phase: 144-cenbrap-corpus-seeding-and-calibration-rerun
verified: 2026-06-19T19:22:00Z
status: passed
score: 8/8
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 144: Cenbrap Corpus Seeding and Calibration Rerun — Verification Report

**Phase Goal:** Desbloquear a calibracao humana criando ou identificando um corpus Cenbrap real, revisavel e seguro: pelo menos duas campanhas com derivacoes, refs seguras, dual verdict e contact sheet `review_ready`.

**Verified:** 2026-06-19T19:22:00Z  
**Status:** passed  
**Re-verification:** Yes — independent goal-backward pass; no regressions from prior report

## Goal Achievement

Phase 144 achieved the **ideal path**: corpus seeded with honest `synthetic_fixture` labels, live calibration rerun without `--template`, `review_ready > 0`, Phase 145 unblocked. Agreement and quality claims correctly withheld.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Existing DB inspected without exposing secrets, prompts, or signed URLs | ✓ VERIFIED | `144-CORPUS-RUN.md`: pre-seed inspection counts; `secret_exposed=false`; only `DATABASE_URL` presence/absence recorded. Secret scan across phase dir found no connection strings or credentials. |
| 2 | ≥2 Cenbrap campaigns with derivations exist (or `operator_data_unavailable` documented) | ✓ VERIFIED | `144-CORPUS-MANIFEST.json`: 2 campaigns with derivations. Live `--inspect-only` (2026-06-19T17:21:33Z): `candidateCenbrapCampaigns=2`, `campaignsWithDualVerdictCoverage=2`. No `144-BLOCKERS.md`. |
| 3 | Reviewable rows have safe `outputKey`, `olharVerdict`, and `exportStatus` | ✓ VERIFIED | Manifest rows: safe `outputKey` paths, `olharVerdict` (`quase`/`pronta`), `exportStatus` (`ok`/`ajuste_menor`). `142-CENBRAP-CALIBRATION.json`: `missingDualVerdictCount=0`, all rows `dualVerdictState=present`, safe `derivation:` outputRefs. |
| 4 | Live calibration `mode=live`, `evaluatedCampaignCount >= 2`, `review_ready > 0` | ✓ VERIFIED | `142-CENBRAP-CALIBRATION.json`: `mode=live`, `evaluatedCampaignCount=2`, `evaluatedDerivationCount=2`. `142-CONTACT-SHEET.md`: `review_ready=2`, 2 live campaign sections with populated verdict columns. |
| 5 | No secrets in planning artifacts | ✓ VERIFIED | Grep across phase 144 dir: no `postgresql://`, API keys, passwords, or signed URLs. Manifest and run doc declare `secretExposed: false`. |
| 6 | Source labels honest (`synthetic_fixture`, not mislabeled as real customer) | ✓ VERIFIED | Every manifest campaign has `sourceLabel: synthetic_fixture`; `sourcePolicy` and `144-CORPUS-RUN.md` explicitly state operational calibration only. No `real_customer` labels on seeded rows. |
| 7 | Agreement/quality claims withheld | ✓ VERIFIED | `142-CENBRAP-CALIBRATION.json`: `agreementRate: null`, `decisionCount: 0`, `status: insufficient_sample`. Contact sheet: "Agreement rate: withheld". Sample guidance blocks Cenbrap agreement claim (0/5). |
| 8 | Phase 143 blocker history preserved | ✓ VERIFIED | JSON `evidenceNotes` and contact sheet reference Phase 143 `insufficient_campaigns` / `evaluatedCampaignCount=0`; link to `143-BLOCKERS.md`. |

**Score:** 8/8 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `144-CORPUS-RUN.md` | Inspection, seed, rerun, gate evidence | ✓ VERIFIED | 201 lines; full pipeline documented |
| `144-CORPUS-MANIFEST.json` | Source labels on all rows | ✓ VERIFIED | 2 campaigns, `mode=applied`, `secretExposed=false` |
| `144-BLOCKERS.md` | Only if blocked | ✓ N/A | Absent — gates passed |
| `142-CENBRAP-CALIBRATION.json` | Live mode, ≥2 campaigns | ✓ VERIFIED | `mode=live`, `evaluatedCampaignCount=2` |
| `142-CONTACT-SHEET.md` | `review_ready` rows | ✓ VERIFIED | Gate table `review_ready=2`; 2 campaign tables |
| `app/scripts/seed-cenbrap-calibration-corpus.ts` | Idempotent seed path | ✓ VERIFIED | 555 lines; dry-run default, `--confirm` writes, exports `inspectCenbrapCorpus()` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `seed-cenbrap-calibration-corpus.ts` | `matchCenbrapCampaign` | import + inspection loop | ✓ WIRED | Same conservative matcher as calibration pipeline |
| `seed-cenbrap-calibration-corpus.ts` | DB + manifest | `--confirm` + `writeFileSync` | ✓ WIRED | Creates campaigns/derivations, writes `144-CORPUS-MANIFEST.json` |
| `run-cenbrap-calibration.ts` | `142-CENBRAP-CALIBRATION.json` | `runCenbrapCalibration` → `writeArtifacts` | ✓ WIRED | Live run captured at 2026-06-19T17:17:02Z |
| `run-cenbrap-calibration.ts` | `142-CONTACT-SHEET.md` | `renderContactSheetMarkdown` | ✓ WIRED | 2 campaign sections rendered; Phase 144 gate table appended in artifact |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `144-CORPUS-MANIFEST.json` | `campaigns[]` | `seed-cenbrap-calibration-corpus.ts --confirm` | Yes — IDs match live DB inspect | ✓ FLOWING |
| `142-CENBRAP-CALIBRATION.json` | `campaigns[]` / `metrics` | `runCenbrapCalibration` DB scan | Yes — live inspect confirms 2 matches | ✓ FLOWING |
| `142-CONTACT-SHEET.md` | row tables | derived from calibration report | Yes — verdicts match JSON | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Seed script CLI | `npx tsx scripts/seed-cenbrap-calibration-corpus.ts --help` | Usage with `--dry-run` / `--confirm` | ✓ PASS |
| Live corpus inspect | `npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only` | 2 campaigns, 2 dual-verdict | ✓ PASS |
| Calibration unit tests | `npm test -- cenbrap-calibration.test.ts olhar-release-evidence.test.ts` | 17 passed | ✓ PASS |
| Task commits exist | `git cat-file -t e52ee356 03d56c69 adaed205` | all `commit` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CORPUS-01 | 144-01 | Inspect DB without exposing secrets | ✓ SATISFIED | `144-CORPUS-RUN.md` inspection + `inspectCenbrapCorpus()` |
| CORPUS-02 | 144-01 | ≥2 campaigns with source labels or blocker | ✓ SATISFIED | 2 `synthetic_fixture` campaigns in manifest |
| CORPUS-03 | 144-02 | Safe outputKey, dual verdict on reviewable rows | ✓ SATISFIED | `missingDualVerdictCount=0`; readiness pass in CORPUS-RUN |
| CORPUS-04 | 144-02 | Live rerun gates or exact blocker | ✓ SATISFIED | `mode=live`, 2 campaigns, `review_ready=2`; Phase 145 unblocked |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None blocking | — | Seed script has no TODO/stub markers; no dishonest quality claims |

**Note:** `review_ready` gate table in `142-CONTACT-SHEET.md` is documented in the planning artifact (not emitted by `renderContactSheetMarkdown`), but underlying JSON rows satisfy the gate criteria — informational only.

### Human Verification Required

None for Phase 144. Jhonatan decision capture on contact sheet rows is explicitly scoped to Phase 145.

## Phase 145 Gate

| Outcome | Value |
|---------|-------|
| `ready_for_jhonatan_review` | **yes** |
| `review_ready` | 2 |
| `phase_145_blocked` | no |
| `144-BLOCKERS.md` | not required |
| `operator_data_unavailable` | not triggered |

## Claims Withheld

- `agreementRate`: null (`decisionCount=0`, sample 0/5)
- Quality improvement: not claimed anywhere in phase artifacts
- Source honesty: all rows labeled `synthetic_fixture` with explicit disclaimers

## Gaps Summary

No gaps. Phase 144 goal achieved on the synthetic_fixture operational calibration path with honest labeling. Human calibration is unblocked for Phase 145.

---

_Verified: 2026-06-19T19:22:00Z_  
_Verifier: Claude (gsd-verifier)_
