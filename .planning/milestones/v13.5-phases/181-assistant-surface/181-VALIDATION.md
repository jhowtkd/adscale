---
phase: 181
slug: assistant-surface
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
updated: 2026-06-25
---

# Phase 181 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npx vitest run src/lib/assistant/ src/lib/hooks/use-assistant- src/components/assistant/ -x` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run task `<automated>` verify command
- **After every plan wave:** Run `cd app && npx vitest run src/lib/assistant/ src/lib/hooks/use-assistant- src/components/assistant/ src/components/layout/TopBar.test.tsx -x`
- **Before `$gsd-verify-work`:** Full suite green + `cd app && npm run build`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 181-01-01 | 01 | 1 | CHAT-02 | unit | `cd app && npx vitest run src/lib/assistant/parse-sse.test.ts -x` | ❌ W0 | ⬜ pending |
| 181-01-02 | 01 | 1 | CHAT-02, CHAT-03 | unit | `cd app && npx vitest run src/lib/hooks/use-assistant-threads.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-01-03 | 01 | 1 | CHAT-02, CHAT-04 | unit | `cd app && npx vitest run src/lib/hooks/use-assistant-chat.test.tsx src/lib/hooks/use-assistant-actions.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-02-01 | 02 | 1 | CHAT-01 | unit | `cd app && npx vitest run src/components/layout/TopBar.test.tsx -x` | ✅ | ⬜ pending |
| 181-02-02 | 02 | 1 | CHAT-01 | compile | `cd app && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 181-02-03 | 02 | 1 | CHAT-01 | unit | `cd app && npx vitest run src/components/assistant/AssistantShell.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-03-01 | 03 | 2 | CHAT-02 | unit | `cd app && npx vitest run src/components/assistant/AssistantTreeSidebar.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-03-02 | 03 | 2 | CHAT-02 | unit | `cd app && npx vitest run src/components/assistant/AssistantTreeSidebar.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-03-03 | 03 | 2 | CHAT-03 | unit | `cd app && npx vitest run src/lib/hooks/use-assistant-threads.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-04-01 | 04 | 3 | CHAT-02 | unit | `cd app && npx vitest run src/components/assistant/AssistantChatCore.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-04-02 | 04 | 3 | CHAT-02 | unit | `cd app && npx vitest run src/lib/hooks/use-assistant-actions.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-04-03 | 04 | 3 | CHAT-01, CHAT-02 | unit | `cd app && npx vitest run src/components/assistant/AssistantChatCore.test.tsx src/components/assistant/AssistantShell.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-05-01 | 05 | 4 | CHAT-04 | unit | `cd app && npx vitest run src/components/assistant/CampaignAssistantDrawer.test.tsx -x` | ❌ W0 | ⬜ pending |
| 181-05-02 | 05 | 4 | CHAT-04 | unit | `cd app && npx vitest run src/components/assistant/CampaignAssistantDrawer.test.tsx src/components/assistant/AssistantChatCore.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files and modules created during execution (not pre-existing):

- [ ] `app/src/lib/assistant/parse-sse.ts` + `parse-sse.test.ts` — SSE parser (task 181-01-01)
- [ ] `app/src/lib/hooks/use-assistant-threads.ts` + test — thread hooks (tasks 181-01-02, 181-03-03)
- [ ] `app/src/lib/hooks/use-assistant-chat.ts` + test — streaming hook (task 181-01-03)
- [ ] `app/src/lib/hooks/use-assistant-actions.ts` + test — confirm/cancel (tasks 181-01-03, 181-04-02)
- [ ] `app/src/components/assistant/AssistantShell.tsx` + test — layout shell (task 181-02-03)
- [ ] `app/src/components/assistant/AssistantTreeSidebar.tsx` + test — navigation tree (tasks 181-03-01, 181-03-02)
- [ ] `app/src/components/assistant/AssistantChatCore.tsx` + test — shared chat (tasks 181-04-01, 181-05-02)
- [ ] `app/src/components/assistant/CampaignAssistantDrawer.tsx` + test — CHAT-04 drawer (tasks 181-05-01, 181-05-02)
- [ ] Extend `app/src/components/layout/TopBar.test.tsx` — mode toggle (task 181-02-01)
- [ ] `app/messages/en.json` + `app/messages/pt-BR.json` — `assistant.*` namespace (tasks 181-02-01, 181-03-02, 181-04-03, 181-05-01)

---

## Requirement Coverage

| Requirement | Tasks | Verification |
|-------------|-------|--------------|
| CHAT-01 | 181-02-01, 181-02-02, 181-02-03, 181-04-03 | TopBar toggle + assistant route + shell composition |
| CHAT-02 | 181-01-01, 181-01-02, 181-01-03, 181-03-01, 181-03-02, 181-04-01, 181-04-02, 181-04-03 | Tree navigation, hooks, chat streaming, context panel |
| CHAT-03 | 181-01-02, 181-03-03 | Create client/campaign/thread mutation chain |
| CHAT-04 | 181-01-03, 181-05-01, 181-05-02 | Default thread + drawer reusing AssistantChatCore |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live SSE streaming with model | CHAT-02 | Requires MiniMax M3 + prod env | Open `/assistant`, send message, confirm text streams |
| Visual Codex layout proportions | CHAT-01 | Subjective layout QA | Desktop: verify 240px/320px columns, collapsible right panel |
| Mobile bottom tabs usability | CHAT-01 | Responsive interaction | Narrow viewport: Tree \| Chat \| Context tabs switch panels |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (181-01-01 through 181-05-02)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test file references
- [x] No watch-mode flags in verify commands
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
