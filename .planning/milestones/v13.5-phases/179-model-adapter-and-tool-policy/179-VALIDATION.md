---
phase: 179
slug: model-adapter-and-tool-policy
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
updated: 2026-06-25
---

# Phase 179 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/assistant --passWithNoTests` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run task `<automated>` verify command
- **After every plan wave:** Run `cd app && npm test`
- **Before `$gsd-verify-work`:** Full suite green + `npm run build`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 179-01-01 | 01 | 1 | AI-01, AI-05 | unit | `cd app && npx vitest run src/server/assistant/model/reasoning-sanitizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 179-01-02 | 01 | 1 | AI-01, AI-02, AI-05 | unit | `cd app && npx vitest run src/server/assistant/model/minimax-adapter.test.ts src/server/assistant/model/reasoning-sanitizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 179-02-01 | 02 | 1 | AI-03 | compile | `cd app && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 179-02-02 | 02 | 1 | AI-03 | unit | `cd app && npx vitest run src/server/assistant/context/context-builder.test.ts -x` | ❌ W0 | ⬜ pending |
| 179-03-01 | 03 | 1 | AI-04 | compile | `cd app && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 179-03-02 | 03 | 1 | AI-04 | unit | `cd app && npx vitest run src/server/assistant/tools/policy.test.ts -x` | ❌ W0 | ⬜ pending |
| 179-04-01 | 04 | 2 | AI-01, AI-03, AI-04, AI-05 | unit | `cd app && npx vitest run src/server/assistant/orchestrator.test.ts -x` | ❌ W0 | ⬜ pending |
| 179-04-02 | 04 | 2 | AI-02, AI-05 | route | `cd app && npx vitest run src/app/api/assistant/threads/\\[threadId\\]/chat/route.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files and fixtures created during execution (not pre-existing):

- [ ] `app/src/server/assistant/model/reasoning-sanitizer.test.ts` — reasoning key stripping (task 179-01-01)
- [ ] `app/src/server/assistant/model/minimax-adapter.test.ts` — stream + tool_call events (task 179-01-02)
- [ ] `app/src/server/assistant/model/fixtures/minimax-stream-chunks.ts` — synthetic reasoning chunks (task 179-01-02)
- [ ] `app/src/server/assistant/context/context-builder.test.ts` — allowlist exclusions (task 179-02-02)
- [ ] `app/src/server/assistant/tools/policy.test.ts` — deny-by-default gate (task 179-03-02)
- [ ] `app/src/server/assistant/orchestrator.test.ts` — persist-after-stream + policy wiring (task 179-04-01)
- [ ] `app/src/app/api/assistant/threads/[threadId]/chat/route.test.ts` — SSE contract without reasoning (task 179-04-02)
- [ ] `app/src/server/validation/env.ts` — MINIMAX_API_KEY, MINIMAX_MODEL (task 179-01-01)
- [ ] `app/.env.example` — MiniMax placeholders (task 179-01-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live MiniMax streaming | AI-02 | Requires MINIMAX_API_KEY | POST to `/api/assistant/threads/{id}/chat` with valid session; confirm text streams |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (179-01-01 through 179-04-02)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test file references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
