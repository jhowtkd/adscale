---
phase: 134
slug: live-corpus-operations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-17
---

# Phase 134 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest / React Testing Library / Next build |
| **Config file** | `app/vitest.config.ts`, Next app config |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` |
| **Full suite command** | `cd app && npm run build` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused test named in the task.
- **After every plan wave:** Run the quick run command.
- **Before `$gsd-verify-work`:** Quick run command plus `cd app && npm run build` must be green.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 134-01-01 | 01 | 1 | LIVEQUAL-01 | unit/API | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus` | ✅ | ✅ green |
| 134-01-02 | 01 | 1 | LIVEQUAL-02 | unit/API | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus` | ✅ | ✅ green |
| 134-01-03 | 01 | 1 | LIVEQUAL-04 | unit/API | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus` | ✅ | ✅ green |
| 134-02-01 | 02 | 2 | LIVEQUAL-02 | component | `cd app && npm test -- app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |
| 134-02-02 | 02 | 2 | LIVEQUAL-03 | component | `cd app && npm test -- app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |
| 134-02-03 | 02 | 2 | LIVEQUAL-04 | component/API | `cd app && npm test -- app/src/components/feedback/HumanQualityCorpusPanel.test.tsx app/src/app/api/feedback/human-quality-corpus` | ✅ | ✅ green |
| 134-03-01 | 03 | 3 | LIVEQUAL-01..04 | regression | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |
| 134-03-02 | 03 | 3 | LIVEQUAL-01..04 | build | `cd app && npm run build` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator evaluates a real selected output | LIVEQUAL-01..03 | Requires real workspace/campaign/derivation data and platform-owner session | With credentials available, select a small batch, evaluate one item, confirm it disappears from pending queue and appears in evaluated reports. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-17
