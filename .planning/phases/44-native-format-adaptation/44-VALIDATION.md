---
phase: 44
slug: native-format-adaptation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + Next.js build |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/lib/formats.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts` |
| **Full suite command** | `cd app && npm run build` |
| **Estimated runtime** | ~60-180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific focused test listed below.
- **After every plan wave:** Run `cd app && npm test -- src/lib/formats.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts tests/integration/derivation-job.test.ts`.
- **Before `$gsd-verify-work`:** `cd app && npm run build` must pass, and visual evidence must be recorded in `44-UAT.md`.
- **Max feedback latency:** 180 seconds for automated checks; visual generation may take longer because it calls the image model.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | FMT-01, FMT-02, FMT-04 | unit | `cd app && npm test -- src/lib/formats.test.ts` | W0 | pending |
| 44-01-02 | 01 | 1 | FMT-01, FMT-02, FMT-04 | unit/integration | `cd app && npm test -- src/server/jobs/derivation.test.ts tests/integration/derivation-job.test.ts` | W0 | pending |
| 44-01-03 | 01 | 1 | FMT-03, FMT-05 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts` | W0 | pending |
| 44-01-04 | 01 | 1 | FMT-01..FMT-05 | build/focused | `cd app && npm test -- src/lib/formats.test.ts src/server/jobs/derivation.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts && npm run build` | W0 | pending |
| 44-02-01 | 02 | 2 | FMT-01, FMT-02, FMT-03 | manual setup check | `test -f .planning/phases/44-native-format-adaptation/44-UAT.md` | W0 | pending |
| 44-02-02 | 02 | 2 | FMT-01, FMT-02, FMT-03 | visual evidence | `rg -n "4:5|9:16|contact|output|failure|accepted" .planning/phases/44-native-format-adaptation/44-UAT.md` | W0 | pending |
| 44-02-03 | 02 | 2 | FMT-01, FMT-02, FMT-03 | human/visual verify | `rg -n "no blurred|no pasted|no crowded|model failure" .planning/phases/44-native-format-adaptation/44-UAT.md` | W0 | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Add `app/src/lib/formats.test.ts` during Plan 44-01 if it does not already exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated 4:5 output looks like a native feed ad | FMT-02, FMT-03 | Model layout quality cannot be proven by unit tests | Inspect the generated 4:5 output/contact sheet: no blurred bands, no pasted square poster, no crowded modules, critical facts inside safe areas. |
| Generated 9:16 output looks like a native story/reels ad | FMT-01, FMT-03 | Model layout quality cannot be proven by unit tests | Inspect the generated 9:16 output/contact sheet: clear vertical zones, no centered poster treatment, no critical crop. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual visual verification.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 180s for automated checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
