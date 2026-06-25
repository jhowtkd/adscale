---
phase: 178
slug: conversation-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
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

- **After every task commit:** Run `npx vitest run <changed-file>.test.ts -x`
- **After every plan wave:** Run `cd app && npm test`
- **Before `$gsd-verify-work`:** Full suite must be green + `npm run build` + `drizzle-kit check`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 178-01-01 | 01 | 1 | EXEC-02 | unit | `npx vitest run src/server/repositories/assistant-thread.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-01-02 | 01 | 1 | EXEC-02 | unit | `npx vitest run src/server/repositories/assistant-message.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-01-03 | 01 | 1 | EXEC-02 | unit | `npx vitest run src/server/repositories/assistant-action.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-01-04 | 01 | 2 | EXEC-02 | unit | `npx vitest run src/server/repositories/assistant-job-sync.test.ts -x` | ❌ W0 | ⬜ pending |
| 178-01-05 | 01 | 2 | EXEC-02 | unit | `npx vitest run src/server/jobs/derivation.test.ts -x -t assistant` | ❌ W0 | ⬜ pending |
| 178-01-06 | 01 | 2 | EXEC-02 | route | `npx vitest run src/app/api/assistant/threads/\\[threadId\\]/route.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/server/repositories/assistant-thread.test.ts` — thread scoping, default thread, campaign link
- [ ] `app/src/server/repositories/assistant-message.test.ts` — stream ordering, sanitization guard
- [ ] `app/src/server/repositories/assistant-action.test.ts` — lifecycle transitions, pending immutability
- [ ] `app/src/server/repositories/assistant-job-sync.test.ts` — job status sync
- [ ] `app/src/app/api/assistant/threads/[threadId]/route.test.ts` — auth + 404 paths
- [ ] Migration `0057` + `_journal.json` entry
- [ ] Extend `derivation.test.ts` with assistant action sync case

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
