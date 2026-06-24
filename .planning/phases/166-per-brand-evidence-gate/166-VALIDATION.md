---
phase: 166
slug: per-brand-evidence-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 166 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/brand-taste/calibration-evidence.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~15s quick / ~120s full |

---

## Sampling Rate

- **After every task commit:** Run quick run command on touched test files
- **After every plan wave:** Run `cd app && npm test -- --run tests/unit/brand-taste/ src/app/api/admin/quality/brands/ src/components/admin/BrandEvidencePanel.test.tsx src/components/admin/OwnerCalibrationPanel.test.tsx`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 166-01-01 | 01 | 1 | EVIDENCE-01 | T-166-01 | Per-brand evidence level from signals | unit | `cd app && npm test -- --run tests/unit/brand-taste/calibration-evidence.test.ts -x` | ✅ extend | ⬜ pending |
| 166-01-02 | 01 | 1 | EVIDENCE-02 | T-166-02 | Claims matrix blocks customer-real when fixture-only | unit | same | ✅ extend | ⬜ pending |
| 166-01-03 | 01 | 1 | EVIDENCE-03 | — | missingConditions names exact gaps | unit | same | ❌ W0 | ⬜ pending |
| 166-01-04 | 01 | 1 | EVIDENCE-05 | T-166-03 | Fixture vs mixed-source withholding in builder | unit | same | ❌ W0 | ⬜ pending |
| 166-01-05 | 01 | 1 | EVIDENCE-01..03 | T-166-01 | Owner evidence API returns report; non-owner 403 | route | `cd app && npm test -- --run src/app/api/admin/quality/brands/\\[clientProfileId\\]/evidence/route.test.ts -x` | ❌ W0 | ⬜ pending |
| 166-02-01 | 02 | 2 | EVIDENCE-04 | T-166-04 | fixtureCaveat always shown when fixtureOnly | component | `cd app && npm test -- --run src/components/admin/BrandEvidencePanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 166-02-02 | 02 | 2 | EVIDENCE-02,04 | — | Blocked claims visible in Evidência tab | component | same | ❌ W0 | ⬜ pending |
| 166-02-03 | 02 | 2 | EVIDENCE-05 | — | Mixed-source allows more claims than fixture-only | component | same + OwnerCalibrationPanel.test.tsx | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `buildPerBrandEvidenceReport` + `buildMissingConditions` in `calibration-evidence.ts`
- [ ] `src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.ts` + test
- [ ] `src/components/admin/BrandEvidencePanel.tsx` + test

*Existing `calibration-evidence.test.ts` and `profile/route.ts` patterns cover partial infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Evidência tab visual layout | EVIDENCE-04 | Cosmetic spacing | Owner panel screenshot optional via `capture-ui-screenshots.ts` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
