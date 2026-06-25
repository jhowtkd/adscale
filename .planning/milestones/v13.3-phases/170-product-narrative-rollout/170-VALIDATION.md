---
phase: 170
slug: product-narrative-rollout
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
verified: 2026-06-25
---

# Phase 170 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest  (via `npm test -- --run`) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts` |
| **Full suite command** | `cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run copy guard command above
- **After every plan wave:** Run copy guard + `git diff --check`
- **Before `$gsd-verify-work`:** Copy guard must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 170-01-01 | 01 | 1 | BRAND-04 | unit | `cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts` | ✅ | ✅ green |
| 170-01-02 | 01 | 1 | BRAND-04 | unit | same | ✅ | ✅ green |
| 170-02-01 | 02 | 2 | BRAND-01, BRAND-02 | unit | same | ✅ | ✅ green |
| 170-02-02 | 02 | 2 | BRAND-02 | unit | same | ✅ | ✅ green |
| 170-03-01 | 03 | 3 | BRAND-01, BRAND-03 | unit | same | ✅ | ✅ green |
| 170-03-02 | 03 | 3 | BRAND-04 | grep | `rg -n "Curator|curador|BRAND" marketing/brand/in-app-copy-checklist.md .planning/phases/170-product-narrative-rollout/170-VERIFICATION.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `app/tests/unit/i18n/product-narrative-copy.test.ts` — forbidden-pattern + locale-parity scaffold for BRAND-04
- [x] `marketing/brand/in-app-copy-checklist.md` — auditable checklist criteria

*Wave 0 delivered by Plan 01 before copy edits in Plans 02–03.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard tour reads naturally in EN/PT | BRAND-02 | Tone judgment | Restart tour from Settings; walk 5 steps; confirm curator arc without jargon |
| Campaign wizard flow copy coherence | BRAND-03 | Cross-page UX | Create campaign draft; scan brief → generation → review labels |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Phase 170 complete — see `170-VERIFICATION.md`
