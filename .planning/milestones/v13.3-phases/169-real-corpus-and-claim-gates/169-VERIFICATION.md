---
phase: 169
slug: real-corpus-and-claim-gates
verified: 2026-06-25
status: passed
requirements:
  - SOURCE-01
  - SOURCE-02
  - SOURCE-03
  - SOURCE-04
  - SOURCE-05
---

# Phase 169 Verification — Real Corpus and Claim Gates

## Verdict

**PASSED** — Generic source-labeled corpus intake, active-scope claim gates, and release evidence that separates technical regression from operational/customer-real proof are implemented with automated verification.

## Implemented Behavior

| Area | What shipped | Evidence |
|------|--------------|----------|
| Source-labeled promotion | Owner promote route accepts `operator_imported` / `real_customer`; auto-capture defaults preserved | `candidate-promotion.test.ts`, promote route tests (Plan 01) |
| Active-scope evidence | `workspaceId` + `clientProfileId` filters thread through composition, sampling, and evaluated rows | `global-evidence.test.ts`, global evidence route tests (Plan 02) |
| Claim gates | `fixtureOnly` blocks `validated_against_customer_real` when active scope has zero `real_customer` rows; operator_imported distinct from real_customer | `calibration-evidence.test.ts`, `global-evidence.test.ts` |
| Release evidence | `technicalRegression` and `operationalEvidence` remain separate; `activeBrandSample` reports scope, source composition, claims allowed/blocked, next actions | `operational-quality-release-evidence.test.ts`, `real-quality-release-evidence.test.ts` (Plan 03) |
| Gate exit policy | Technical fail → exit 1; technical pass + fixture-only active brand → `claim_withheld` exit 0; sufficient real_customer + sample → `ok` | `run-operational-quality-release-gate.mjs`, operational release tests |

## Tests Run (actual results)

Full Phase 169 suite (2026-06-25):

```bash
cd app && npm test -- --run \
  tests/unit/human-quality/candidate-capture.test.ts \
  tests/unit/human-quality/candidate-promotion.test.ts \
  tests/unit/human-quality/global-evidence.test.ts \
  'src/app/api/feedback/human-quality-corpus/candidates/route.test.ts' \
  'src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts' \
  src/app/api/feedback/global-corpus-evidence/route.test.ts \
  tests/unit/brand-taste/calibration-evidence.test.ts \
  tests/unit/release/real-quality-release-evidence.test.ts \
  tests/unit/release/operational-quality-release-evidence.test.ts
```

**Result:** 9 test files, 89 tests — all passed (~4.7s).

## Cenbrap / Fixture Caveats

- **Cenbrap remains fixture/seed only** — not a product-model client. Rows only count toward customer-real claims when they enter through the generic source-labeled path as `real_customer` for the active `clientProfileId`.
- `synthetic_fixture` and `operator_imported` validate operational workflow but **never** unlock `validated_against_customer_real` or `customer_real_validation` claims.
- Release evidence `activeBrandSample.fixtureOnly` mirrors `sourceComposition.real_customer === 0` in the active scope.
- Technical regression can pass while root milestone status is `tech_debt` (insufficient sample) or `claim_withheld` (insufficient real-customer source).

## Accepted Gaps (not blocking Phase 169)

| Gap | Rationale | Next phase |
|-----|-----------|------------|
| No production multi-brand real_customer corpus at scale | Gates and release artifact are correct; data volume is operational | Ongoing owner corpus work |
| `activeBrandSample` scope defaults null until owner selects workspace/profile in release aggregate | Composition/claim fields validated; scoped population follows evidence CLI usage | Phase 172 alert/evidence UI |
| Manual browser UAT for visible source-selection control | Backend/API paths fully tested | Optional during Phase 170 narrative rollout |

## Requirement Traceability

| ID | Status | Proof |
|----|--------|-------|
| SOURCE-01 | Complete | Promotion + capture tests with explicit `sourceLabel` |
| SOURCE-02 | Complete | `sourceComposition` in global + calibration evidence surfaces |
| SOURCE-03 | Complete | Claim withheld until active scope sufficiency |
| SOURCE-04 | Complete | Fixture-only scopes block customer-real claims |
| SOURCE-05 | Complete | Release evidence separates technical vs operational + `activeBrandSample` |

## Next Step

Proceed to **Phase 170 — Product Narrative Rollout** (BRAND-01..04).
