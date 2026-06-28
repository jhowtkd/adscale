---
phase: 206
slug: version-compare-and-approval
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-28
---

# Phase 206 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 (node and jsdom projects) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run <changed-test-files>` |
| **Full suite command** | `cd app && npm test && npx tsc --noEmit --pretty false && npm run build` |
| **Estimated runtime** | Quick <30s; full gate several minutes |

## Sampling Rate

- **After every task commit:** Run the requirement-specific Vitest file(s).
- **After every plan wave:** Run artifact-version repository, service, route, hook, and component tests.
- **Before `$gsd-verify-work`:** Full suite, typecheck, and production build must be green.
- **Max feedback latency:** 30 seconds for task-level feedback.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 206-01-01 | 01 | 1 | COMP-01, COMP-02 | T-206-01 / T-206-03 | Comparison DTOs preserve order and reject unsafe presentation fields | unit | `cd app && npm test -- --run src/server/assistant/plan-iteration/diff.test.ts src/server/assistant/artifact-version/comparison.test.ts` | ❌ W0 | ⬜ pending |
| 206-01-02 | 01 | 1 | COMP-01, COMP-02 | T-206-01 / T-206-03 | Scoped read-only compare rejects invalid pairs and sanitizes previews | service + route | `cd app && npm test -- --run src/server/assistant/artifact-version/comparison.test.ts 'src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts'` | ❌ W0 | ⬜ pending |
| 206-02-01 | 02 | 2 | APPR-01, APPR-02, APPR-03 | T-206-07 / T-206-08 / T-206-13 | Approval history and acknowledgements are scoped, append-only, and replay-safe | migration + repository | `cd app && npm run test:db:setup && npm test -- --run src/server/repositories/artifact-version.test.ts` | partial / ❌ W0 | ⬜ pending |
| 206-02-02 | 02 | 2 | APPR-01, APPR-02, APPR-03 | T-206-09 / T-206-10 / T-206-11 | Single and compound promotion use one CAS-protected transaction | repository + service | `cd app && npm test -- --run src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/promotion.test.ts` | ❌ W0 | ⬜ pending |
| 206-02-03 | 02 | 2 | APPR-01, APPR-02, APPR-03 | T-206-07 / T-206-08 / T-206-12 | Routes enforce scope, acknowledgement validity, conflict recovery, and safe DTOs | route | `cd app && npm test -- --run 'src/app/api/assistant/threads/[threadId]/artifact-versions/comparison-acknowledgements/route.test.ts' 'src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts'` | ❌ W0 | ⬜ pending |
| 206-03-01 | 03 | 3 | COMP-01, COMP-02, APPR-01, APPR-02, APPR-03 | T-206-14 / T-206-15 / T-206-17 | Client mapping preserves scoped state and mutations never auto-retry conflicts | hook | `cd app && npm test -- --run src/lib/hooks/use-assistant-threads.test.tsx src/lib/hooks/use-assistant-artifact-versions.test.tsx` | partial / ❌ W0 | ⬜ pending |
| 206-03-02 | 03 | 3 | COMP-01, COMP-02, APPR-01, APPR-02, APPR-03 | T-206-14 / T-206-16 / T-206-19 | Timeline permits only same-lineage pairs and hides internal identifiers | component | `cd app && npm test -- --run src/components/assistant/VersionHistory.test.tsx src/lib/hooks/use-assistant-threads.test.tsx` | ❌ W0 | ⬜ pending |
| 206-04-01 | 04 | 4 | COMP-01, COMP-02, APPR-01, APPR-02, APPR-03 | T-206-20 through T-206-25 | Dialog requires explicit safe confirmation and recovers from stale conflict | component | `cd app && npm test -- --run src/components/assistant/VersionComparisonDialog.test.tsx` | ❌ W0 | ⬜ pending |
| 206-04-02 | 04 | 4 | COMP-01, COMP-02, APPR-01, APPR-02, APPR-03 | T-206-20 through T-206-25 | One host preserves focus/scroll and exposes only canonical version shortcuts | component integration | `cd app && npm test -- --run src/components/assistant/AssistantChatCore.test.tsx src/components/assistant/AssistantMessageList.test.tsx src/components/assistant/AssistantActionCard.test.tsx src/components/assistant/VersionComparisonDialog.test.tsx` | partial / ❌ W0 | ⬜ pending |

## Wave 0 Requirements

- [ ] `app/src/server/assistant/artifact-version/comparison.test.ts` — COMP-01/COMP-02 comparison and sanitization contract.
- [ ] `app/src/server/assistant/artifact-version/promotion.test.ts` — APPR-01/APPR-02/APPR-03 atomic promotion contract.
- [ ] `app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts` — auth, scope, read-only behavior, and errors.
- [ ] `app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` — strict input, conflict response, and no-credit behavior.
- [ ] `app/src/components/assistant/VersionHistory.test.tsx` and `VersionComparisonDialog.test.tsx` — timeline, diff, confirmation, preview failure, and conflict focus.
- [ ] Extend `app/src/lib/hooks/use-assistant-threads.test.tsx` for `artifactVersionState` and nested date parsing.

## Manual-Only Verifications

All Phase 206 behaviors have automated unit, route, integration, or jsdom verification. Authenticated desktop/mobile browser coverage is deferred explicitly to Phase 207.

## Validation Sign-Off

- [x] All planned capability groups have automated verification targets or Wave 0 dependencies.
- [x] Sampling continuity prevents three consecutive tasks without automated feedback.
- [x] Wave 0 lists every currently missing test reference.
- [x] Commands use no watch-mode flags.
- [x] Task-level feedback latency target is below 30 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-06-28
