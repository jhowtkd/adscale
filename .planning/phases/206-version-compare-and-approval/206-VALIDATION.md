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
| 206-01-01 | 01 | 1 | COMP-01, COMP-02 | T-206-01 | Scoped read-only compare rejects invalid pairs and sanitizes output | unit + route | `cd app && npm test -- --run src/server/assistant/artifact-version/comparison.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts` | ❌ W0 | ⬜ pending |
| 206-01-02 | 01 | 1 | APPR-01, APPR-02, APPR-03 | T-206-02 | Promotion is atomic, CAS-protected, scope-safe, and never spends credits | repository + service + route | `cd app && npm test -- --run src/server/assistant/artifact-version/promotion.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` | ❌ W0 | ⬜ pending |
| 206-02-01 | 02 | 2 | COMP-01, COMP-02 | T-206-03 | Timeline and compare UI preserve scoped state and safe previews | hook + component | `cd app && npm test -- --run src/lib/hooks/use-assistant-threads.test.tsx src/components/assistant/VersionHistory.test.tsx src/components/assistant/VersionComparisonDialog.test.tsx` | partial / ❌ W0 | ⬜ pending |
| 206-02-02 | 02 | 2 | APPR-01, APPR-02, APPR-03 | T-206-04 | Confirmation and conflict recovery remain explicit and accessible | component + integration | `cd app && npm test -- --run src/components/assistant/VersionComparisonDialog.test.tsx src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` | ❌ W0 | ⬜ pending |

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
