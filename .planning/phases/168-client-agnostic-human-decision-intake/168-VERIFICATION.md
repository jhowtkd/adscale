---
phase: 168
slug: client-agnostic-human-decision-intake
verified: 2026-06-25
status: passed
requirements:
  - DECISION-01
  - DECISION-02
  - DECISION-03
  - DECISION-04
  - DECISION-05
---

# Phase 168 Verification — Client-Agnostic Human Decision Intake

## Verdict

**PASSED** — Generic human decision intake is wired end-to-end with automated proof for service bridge, UI/copy, and per-brand evidence isolation.

## Implemented Behavior

| Area | What shipped | Evidence |
|------|--------------|----------|
| Service bridge | Corpus evaluations map approve/reject/regenerate to output-decision + calibration-signal records with evaluation-scoped idempotency | `human-decision-calibration.ts`, `human-quality-service.test.ts` (19 tests) |
| UI / copy | Global queue `clientProfileId` filter, fixture-safe source labels, submit tolerant of legacy API shapes | `HumanQualityCorpusPanel.tsx`, `calibration-status-copy.ts` (39 component tests) |
| Evidence reports | Per-brand reports count only profile-scoped signals; source composition separates `synthetic_fixture`, `operator_imported`, `real_customer` | `calibration-evidence.test.ts`, `taste-profile.test.ts` (16 tests) |
| API route | Evaluation POST persists judgments and returns compatible payloads | `evaluation/route.test.ts` |

## Tests Run (actual results)

Full Phase 168 suite (2026-06-25):

```bash
cd app && npm test -- --run \
  tests/unit/human-quality/human-quality-service.test.ts \
  src/components/feedback/HumanQualityCorpusPanel.test.tsx \
  src/components/admin/calibration-status-copy.test.ts \
  tests/unit/brand-taste/calibration-evidence.test.ts \
  tests/unit/brand-taste/taste-profile.test.ts \
  'src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts'
```

**Result:** 6 test files, 83 tests — all passed (~6.3s).

## Cenbrap / Fixture Caveats

- **Cenbrap remains fixture/seed only** — not a product-model client. Any Cenbrap rows in corpus or calibration signals are compatibility seed data.
- Fixture and operator-imported sources validate operational flow but **do not** unlock `validated_against_customer_real` or commercial quality claims.
- Per-brand evidence reports surface `fixtureCaveat` and `missingConditions` when `real_customer` count is below threshold.
- Existing historical Cenbrap evidence in production databases is unchanged; this phase proves the **generic path** for any `clientProfileId`.

## Accepted Gaps (not blocking Phase 168)

| Gap | Rationale | Next phase |
|-----|-----------|------------|
| No live multi-brand customer-real corpus yet | SOURCE requirements cover import/promotion | Phase 169 |
| `buildPerBrandEvidenceReport` trusts pre-filtered signals from repository | API route filters via `listCalibrationSignalsForClientProfile`; tests document filter-before-build contract | Monitor in 169 claim gates |
| Manual browser UAT not run | Automated component tests cover copy/filter/submit paths | Optional during 170 narrative rollout |

## Requirement Traceability

| ID | Status | Proof |
|----|--------|-------|
| DECISION-01 | Complete | Corpus panel filter + evaluation route |
| DECISION-02 | Complete | Service bridge writes canonical evidence fields |
| DECISION-03 | Complete | Fixture-safe copy helpers + inline caveats |
| DECISION-04 | Complete | Generic path updates per-brand evidence builders |
| DECISION-05 | Complete | Isolation tests across service + evidence + taste profile |

## Next Step

Proceed to **Phase 169 — Real Corpus and Claim Gates** (SOURCE-01..05).
