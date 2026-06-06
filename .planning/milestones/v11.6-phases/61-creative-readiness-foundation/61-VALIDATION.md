---
phase: 61
slug: creative-readiness-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 61 - Validation Strategy

> Per-phase validation contract for Creative Readiness Foundation.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + Next.js build |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/creative-readiness.test.ts src/components/workspace/CreativeReadinessPanel.test.tsx` |
| **Full suite command** | `cd app && npm run lint && npm run build` |
| **Estimated runtime** | ~30-120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused test for the touched module.
- **After every plan wave:** Run the plan's focused test bundle.
- **Before `$gsd-verify-work`:** `cd app && npm run lint && npm run build` must pass.
- **Max feedback latency:** 120 seconds for focused tests; build may exceed this locally.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | READY-02, READY-03, READY-05 | unit | `cd app && npm test -- src/server/ai/creative-readiness.test.ts` | W0 | pending |
| 61-01-02 | 01 | 1 | READY-01, READY-04 | route/service | `cd app && npm test -- src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts` | W0 | pending |
| 61-01-03 | 01 | 1 | READY-01, READY-04 | hook | `cd app && npm test -- src/lib/hooks/use-preflight.test.tsx` | W0 | pending |
| 61-02-01 | 02 | 2 | READY-01, READY-02, READY-03 | component | `cd app && npm test -- src/components/workspace/CreativeReadinessPanel.test.tsx` | W0 | pending |
| 61-02-02 | 02 | 2 | READY-04 | component | `cd app && npm test -- src/components/workspace/PilotUploadPanel.test.tsx src/components/workspace/CreativeReadinessPanel.test.tsx` | W0 | pending |
| 61-02-03 | 02 | 2 | READY-05 | integration/build | `cd app && npm run lint && npm run build` | yes | pending |

---

## Wave 0 Requirements

- Existing infrastructure covers this phase.
- If a listed test file does not exist, create it in the same task that introduces the tested module.
- No watch-mode flags.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Readiness panel feels clear in the campaign workspace | READY-01..04 | Visual hierarchy and copy clarity require browser review | Start app, open campaign draft, upload base creative, run/read readiness, rerun after brief or asset change |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target documented.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending execution evidence
