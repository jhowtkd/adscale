---
phase: 77
slug: operator-beta-sessions
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for operator beta session APIs and UI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + eslint |
| **Config file** | `app/config/vitest.config.ts` |
| **Phase command** | `cd app && npm test -- src/server/repositories/beta-sessions.test.ts src/app/api/feedback/beta-sessions src/components/feedback/BetaSessionsPanel.test.tsx` |
| **Full suite command** | `cd app && npm test && npm run lint` |
| **Estimated runtime** | ~60s (focused), ~3 min (full) |

---

## Sampling Rate

- **After every task commit:** Run focused test for files touched.
- **After every plan wave:** Run phase command.
- **Before Phase 78 dashboard:** Run phase command + manual operator session smoke.
- **Max feedback latency:** 90 seconds for focused tests.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 77-01-01 | 01 | 1 | SESS-01 | unit | `cd app && npm test -- src/server/beta-sessions/types.test.ts` | ⬜ pending |
| 77-01-02 | 01 | 1 | SESS-01 | unit | `cd app && npm test -- src/server/repositories/beta-sessions.test.ts` | ⬜ pending |
| 77-02-01 | 02 | 2 | SESS-01 | route | `cd app && npm test -- src/app/api/feedback/beta-sessions/route.test.ts` | ⬜ pending |
| 77-02-02 | 02 | 2 | SESS-01 | route | `cd app && npm test -- src/app/api/feedback/beta-sessions/[id]/route.test.ts` | ⬜ pending |
| 77-03-01 | 03 | 3 | SESS-02 | route | `cd app && npm test -- src/app/api/feedback/beta-sessions/[id]/notes/route.test.ts` | ⬜ pending |
| 77-03-02 | 03 | 3 | SESS-04 | route | `cd app && npm test -- src/app/api/feedback/beta-sessions/[id]/summary/route.test.ts` | ⬜ pending |
| 77-04-01 | 04 | 4 | SESS-01/02 | component | `cd app && npm test -- src/components/feedback/BetaSessionsPanel.test.tsx` | ⬜ pending |
| 77-04-02 | 04 | 4 | SESS-03/04 | fixture | `cd app && npm test -- src/server/repositories/beta-sessions.fixture.test.ts` | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|----------------|
| 3+ real operator sessions | SESS-03 | Human operator evidence | Run sessions per `67-BETA-RUNBOOK.md`; fill `77-SESSION-ARTIFACTS.md` |
| sessionStorage attaches client events | SESS-01 | Browser integration | Start session in UI; confirm `adscale_beta_session_id` in DevTools; trigger cockpit action; verify `session_id` on event row |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] `nyquist_compliant: true` set in frontmatter.
- [ ] Execution complete — pending implementation.

**Approval:** draft — pending execution
