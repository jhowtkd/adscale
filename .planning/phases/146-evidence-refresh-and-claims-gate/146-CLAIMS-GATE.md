---
phase: 146
slug: evidence-refresh-and-claims-gate
audited: 2026-06-19T20:45:00Z
status: human_needed
evidence_path: .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json
calibration_source: .planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json
release_checker: pass
---

# Phase 146 Claims Gate: Olhar Cenbrap Release Evidence

**Final status:** `human_needed` — the release gate is working and checker passes, but the milestone **cannot claim art-direction agreement or quality improvement** while Jhonatan decisions are missing and sample guidance blocks claims.

## Source Evidence

| Field | Value |
| --- | --- |
| Evidence path | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json` |
| Calibration source | `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` |
| Captured at | `2026-06-19T20:15:13.357Z` |
| Built from | Live calibration (`mode=live`), **not** `142-EVIDENCE.template.json` |
| Run log | `.planning/phases/146-evidence-refresh-and-claims-gate/146-EVIDENCE-RUN.md` |

## Release Checker Result

```bash
node app/scripts/check-olhar-release-evidence.mjs \
  --evidence .planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json \
  --skip-tests
```

**Result:** exit 0 — `Olhar release evidence check passed. Status: human_needed`

The checker passing means the artifact is structurally valid and honestly reports blocked claims. A passing checker with `human_needed` is the **correct** outcome when operator judgment is still missing — not a clean milestone pass.

## Final Status and Why

| Status | Applies | Reason |
| --- | --- | --- |
| `human_needed` | **Yes — current truth** | `humanDecisionCount=0`, `missingHumanDecisionCount=2`; reviewable derivations exist but Jhonatan has not recorded `entra/quase/nao_entra` |
| `insufficient_sample` | Partially | Sample guidance requires 5 operator decisions; current count is 0 (`additionalNeeded=5`) |
| `ok` | **No** | Would require decisions recorded **and** sample guidance cleared |
| `approved` / `shipped` | **Forbidden** | Status is `human_needed`; do not use approval or ship language for agreement claims |

The release gate is **working as designed**: it separates technical validity from operator agreement and withholds `agreementRate` when sample guidance blocks claims.

## Art-Direction Agreement Summary

*Separate from factual/export safety — do not blend these metrics.*

| Metric | Value | Claim status |
| --- | ---: | --- |
| `evaluatedCampaignCount` | 2 | factual count only |
| `evaluatedDerivationCount` | 2 | factual count only |
| `humanDecisionCount` | 0 | **claims withheld** |
| `missingHumanDecisionCount` | 2 | operator action required |
| `agreementRate` | `null` | **withheld** — sample guidance blocks |
| `mismatchReasonCounts` | `{}` | no comparable rows without human decisions |
| `overrideApprovedCount` | 0 | no override evidence yet |
| `qualityImprovementClaimed` | `null` | **withheld** |

**Interpretation:** The system can evaluate derivations and surface contact-sheet rows, but art-direction calibration authority remains with Jhonatan. System verdicts are evidence under test, not final truth.

## Factual / Export Safety Summary

*Reported in `factualExportMetrics` — independent of art-direction agreement.*

| Metric | Value | Claim status |
| --- | ---: | --- |
| `approvedInvalidPreventedCount` | 0 | no live prevention events on evaluated rows |
| `semOpiniaoDetectionCount` | 0 | no sem-opinião detections on evaluated rows |
| `exportBlockSeparationCount` | 0 | no export-block separation events on evaluated rows |
| `evidenceSource` | `live_human` | counters sourced from live calibration path |

**Interpretation:** Factual/export safety counters are structurally wired and reported separately. Zero counts on two `synthetic_fixture` rows do **not** prove customer-scale export safety — only that the metric split exists and the gate can consume live calibration.

## Sample Guidance Result

| Gate | Current | Required | Additional needed | Blocked claim |
| --- | ---: | ---: | ---: | --- |
| `calibration_global` | 0 | 5 | 5 | Cenbrap art-direction agreement rate |

While `additionalNeeded > 0`, `agreementRate` **must remain `null`**. Do not convert missing human judgment into a numeric agreement rate or quality claim.

## Source Caveat

All evaluated rows are **`synthetic_fixture`** — operational calibration only, not real customer evidence.

Accepted gaps in evidence artifact:

- Jhonatan operator decisions missing for evaluated derivations — agreement claims withheld.
- Cenbrap art-direction agreement rate: 0/5 (need 5 more).
- All rows in corpus manifest are `synthetic_fixture` — operational calibration only, not real customer evidence.
- All evaluated rows are `synthetic_fixture` — operational calibration only, not real customer evidence.

Operator data is reviewable and dual-verdict complete, but **not customer-real**. Any external claim must label the corpus as synthetic fixture calibration, not production Cenbrap proof.

## Claims Allowed

| Claim | Basis |
| --- | --- |
| Live Cenbrap calibration runner executes against configured `DATABASE_URL` | Phase 143–144 artifacts, `mode=live` |
| Reviewable corpus exists with 2 campaigns and 2 derivations | `evaluatedCampaignCount=2`, contact sheet `review_ready` |
| Decision capture tooling is wired (`record-cenbrap-calibration-decisions.ts`) | Phase 145 verification |
| Release evidence consumes live calibration JSON | `142-EVIDENCE.json` built from `142-CENBRAP-CALIBRATION.json` |
| Release checker passes with honest `human_needed` status | `146-EVIDENCE-RUN.md` |
| Art-direction and factual/export metrics are reported separately | `artDirectionMetrics` vs `factualExportMetrics` blocks |
| `agreementRate` and `qualityImprovementClaimed` are correctly withheld | `null` with sample guidance blocking |
| v12.7 template-only evidence gap is closed for the live-artifact path | `142-EVIDENCE.json` replaces template as canonical generated evidence |

## Claims Forbidden

| Claim | Why forbidden |
| --- | --- |
| Cenbrap art-direction agreement rate or percentage | `agreementRate=null`, `humanDecisionCount=0`, `additionalNeeded=5` |
| Quality improvement on live Cenbrap outputs | `qualityImprovementClaimed=null` |
| Operator loop closed / calibration complete | 2 rows still `manual_pending`; decisions missing |
| Customer-real Cenbrap proof | All rows `synthetic_fixture` |
| Milestone approved or shipped for agreement | Status is `human_needed`, not `ok` |
| Export-safety proven at production scale | Counters at 0 on 2 fixture rows only |
| Phase 141 live override UX confirmed | Still `human_needed` per v12.7 audit carry-forward |

## v12.7 Tech-Debt Items Addressed by Phase 146

| v12.7 debt item | Phase 146 outcome |
| --- | --- |
| Template-only `142-EVIDENCE` | **Closed** — live `142-EVIDENCE.json` generated |
| Empty corpus / `evaluatedCampaignCount=0` | **Closed** — 2 campaigns, 2 derivations |
| No live calibration JSON | **Closed** — `142-CENBRAP-CALIBRATION.json` `mode=live` |
| Release gate not consuming live calibration | **Closed** — builder + checker on live artifact |

## Remaining Blockers (Carry-Forward)

1. **Missing Jhonatan decisions** — fill `145-DECISIONS.json`, run `record-cenbrap-calibration-decisions.ts --confirm`, rerun calibration and evidence build.
2. **Insufficient sample** — need 5 operator decisions before agreement claims unlock (`0/5` today).
3. **`synthetic_fixture` source limitation** — operational calibration only; not equivalent to customer proof.
4. **Phase 141 override UX** — live campaign confirmation still pending.
5. **Operator data not customer-real** — seeded dev workspace corpus; production Cenbrap campaigns still the long-term target.

## Next Operator Actions

1. Copy `145-DECISIONS.template.json` → `145-DECISIONS.json`; record `entra`/`quase`/`nao_entra` for both review_ready rows.
2. Run decision recorder with `--confirm`, then rerun calibration and `npm run olhar-release-evidence:build`.
3. Re-read this claims gate — status may advance toward `insufficient_sample` (partial decisions) or allow agreement computation only after 5 decisions and cleared sample guidance.
4. Do not publish agreement or quality claims until this document's **Claims Forbidden** table is empty for the target claim.
