---
phase: 178
slug: conversation-persistence
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
updated: 2026-06-25
---

# Phase 178 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npx vitest run src/server/repositories/assistant-action.test.ts -x` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run task `<automated>` verify command
- **After every plan wave:** Run `cd app && npm test`
- **Before `$gsd-verify-work`:** Full suite must be green + `npm run build` + `drizzle-kit check`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 178-01-01 | 01 | 1 | EXEC-02 | compile | `cd app && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 178-01-02 | 01 | 1 | EXEC-02 | migration | `cd app && npx drizzle-kit check` | ❌ W0 | ⬜ pending |
| 178-01-03 | 01 | 1 | EXEC-02 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 178-02-01 | 02 | 2 | EXEC-02 | unit | `cd app && npx vitest run src/server/repositories/assistant-thread.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-02-02 | 02 | 2 | EXEC-02 | unit | `cd app && npx vitest run src/server/repositories/assistant-thread.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-03-01 | 03 | 2 | EXEC-02 | unit | `cd app && npx vitest run src/server/repositories/assistant-message.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-03-02 | 03 | 2 | EXEC-02 | unit | `cd app && npx vitest run src/server/repositories/assistant-action.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-04-01 | 04 | 3 | EXEC-02 | unit | `cd app && npx vitest run src/server/repositories/assistant-job-sync.test.ts src/server/jobs/derivation.test.ts -x -t assistant` | ❌ W0 | ⬜ pending |
| 178-04-02 | 04 | 3 | EXEC-02 | route | `cd app && npx vitest run src/app/api/assistant/threads/\\[threadId\\]/route.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-04-03 | 04 | 3 | EXEC-02 | integration | `cd app && npx vitest run src/server/repositories/assistant-thread.test.ts src/server/repositories/assistant-message.test.ts src/server/repositories/assistant-action.test.ts src/server/repositories/assistant-job-sync.test.ts -x && npm run build && npx drizzle-kit check` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files created during execution (not pre-existing):

- [ ] `app/src/server/repositories/assistant-thread.test.ts` — thread scoping, default thread, campaign link (tasks 178-02-01, 178-02-02)
- [ ] `app/src/server/repositories/assistant-message.test.ts` — stream ordering, sanitization guard (task 178-03-01)
- [ ] `app/src/server/repositories/assistant-action.test.ts` — lifecycle transitions, pending immutability (task 178-03-02)
- [ ] `app/src/server/repositories/assistant-job-sync.test.ts` — job status sync (task 178-04-01)
- [ ] `app/src/app/api/assistant/threads/[threadId]/route.test.ts` — auth + 404 paths (task 178-04-02)
- [ ] Migration `0057` + `_journal.json` entry (task 178-01-02)
- [ ] Extend `derivation.test.ts` with assistant action sync case (task 178-04-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (178-01-01 through 178-04-03)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test file references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
