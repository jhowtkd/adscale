---
phase: 72
slug: build-and-data-integrity-hardening
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-06
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + Next.js build/lint |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/mission-insights src/server/repositories/progression src/server/progression src/app/api/workspace/mission-insights` |
| **Full suite command** | `cd app && npm run build && npm run lint && npm test -- src/server/progression src/server/repositories/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard src/app/api/workspace/missions src/lib/hooks/use-missions src/components/dashboard/MissionPathCard src/app/api/workspace/mission-insights src/server/mission-insights src/lib/progression src/server/feedback/mission-credit-signals` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command if code changed.
- **After every plan wave:** Run the full suite command.
- **Before `$gsd-verify-work`:** Full suite must be green or blockers documented in `72-VERIFICATION.md`.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | DATA-01 | unit/API | `cd app && npm test -- src/server/mission-insights src/app/api/workspace/mission-insights` | ✅ | ⬜ pending |
| 72-01-02 | 01 | 1 | DATA-02 | repository | `cd app && npm test -- src/server/repositories/progression` | ✅ | ⬜ pending |
| 72-01-03 | 01 | 1 | DATA-03 | focused regression | `cd app && npm test -- src/server/mission-insights src/server/repositories/progression src/server/progression` | ✅ | ⬜ pending |
| 72-02-01 | 02 | 2 | STAB-01 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 72-02-02 | 02 | 2 | STAB-02 | lint + focused suite | `cd app && npm run lint && npm test -- src/server/progression src/server/repositories/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard src/app/api/workspace/missions src/lib/hooks/use-missions src/components/dashboard/MissionPathCard src/app/api/workspace/mission-insights src/server/mission-insights src/lib/progression src/server/feedback/mission-credit-signals` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Evidence handoff quality | STAB-02 | Requires human-readable release evidence | Confirm `72-VERIFICATION.md` lists commands, results, caveats, and next handoff state |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
