---
phase: 157
slug: global-corpus-access-boundary
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 157 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts` |
| **Full suite command** | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts src/components/feedback/HumanQualityCorpusPanel.test.tsx tests/unit/human-quality/human-quality-service.test.ts` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts`
- **After every plan wave:** Run `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts src/components/feedback/HumanQualityCorpusPanel.test.tsx tests/unit/human-quality/human-quality-service.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 157-01-01 | 01 | 1 | ACCESS-01 | API/unit | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts` | ✅ | ⬜ pending |
| 157-01-02 | 01 | 1 | ACCESS-02 | API/unit | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts` | ✅ | ⬜ pending |
| 157-01-03 | 01 | 1 | ACCESS-03 | API/unit | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/route.test.ts` | ✅ | ⬜ pending |
| 157-01-04 | 01 | 1 | ACCESS-01 | Component | `cd app && npm test -- --run src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ⬜ pending |
| 157-02-01 | 02 | 2 | ACCESS-04 | Service/API | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts tests/unit/human-quality/human-quality-service.test.ts` | ✅ | ⬜ pending |
| 157-02-02 | 02 | 2 | ACCESS-02 | API/unit | `cd app && npm test -- --run src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner panel feels compact with Global/Workspace segmented control | ACCESS-01 | Visual density judgment is partly subjective | Run local app, open `/feedback` as platform owner, verify Global is default and Workspace mode keeps ID input |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20
