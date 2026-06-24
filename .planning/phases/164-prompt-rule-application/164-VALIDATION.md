---
phase: 164
slug: prompt-rule-application
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 164 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (app workspace) |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/brand-taste/ tests/unit/human-quality/learning/ tests/unit/ai/prompt-builder` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command scoped to touched module
- **After every plan wave:** Run quick run command (full brand-taste + prompt-builder + calibration)
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 164-01-01 | 01 | 1 | APPLY-01 | unit | `npm test -- --run tests/unit/brand-taste/taste-application.test.ts` | ✅ | ⬜ pending |
| 164-01-02 | 01 | 1 | APPLY-02 | unit | `npm test -- --run tests/unit/ai/prompt-builder.test.ts` | ✅ | ⬜ pending |
| 164-02-01 | 02 | 2 | APPLY-03 | unit | `npm test -- --run tests/unit/jobs/derivation-generation-log.test.ts` | ❌ W0 | ⬜ pending |
| 164-02-02 | 02 | 2 | APPLY-04 | unit | `npm test -- --run tests/unit/repositories/calibration-rule-cap.test.ts` | ❌ W0 | ⬜ pending |
| 164-03-01 | 03 | 3 | APPLY-05 | integration | `npm test -- --run tests/unit/ai/prompt-rule-isolation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/jobs/derivation-generation-log.test.ts` — stubs for APPLY-03 provenance fields
- [ ] `tests/unit/repositories/calibration-rule-cap.test.ts` — stubs for APPLY-04 cap deprecation
- [ ] `tests/unit/ai/prompt-rule-isolation.test.ts` — stubs for APPLY-05 cross-profile isolation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staging derivation shows rule sections in prompt order | APPLY-02 | Prompt content not asserted in prod logs | Run one derivation for Cenbrap profile; inspect generation_log applied*Ids |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
