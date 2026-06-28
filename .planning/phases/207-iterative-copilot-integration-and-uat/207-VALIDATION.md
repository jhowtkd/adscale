---
phase: 207
slug: iterative-copilot-integration-and-uat
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-28
---

# Phase 207 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 (node + jsdom) + Playwright 1.60.0 |
| **Config file** | `app/config/vitest.config.ts`, `app/playwright.guided.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/server/assistant/artifact-iteration-telemetry.test.ts` |
| **Full suite command** | `cd app && npm test && npx tsc --noEmit --pretty false && npm run build` |
| **Playwright iteration** | `cd app && npx playwright test --config playwright.guided.config.ts tests/e2e/iterative-copilot-loop` |
| **Estimated runtime** | Quick <30s; full gate several minutes; Playwright ~2–4 min |

## Sampling Rate

- **After every task commit:** Run requirement-specific Vitest file(s) from the map below.
- **After every plan wave:** Run all artifact-iteration telemetry + extended 203–206 test files.
- **Before `$gsd-verify-work`:** Full Vitest + `tsc` + `npm run build` + Playwright iteration specs green.
- **Max feedback latency:** 30 seconds for task-level feedback.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 207-01-00 | 01 | 1 | QA-01 | T-207-01 | Migration creates assistant_artifact_iteration_events table | migration | `test -f app/drizzle/0068_assistant_artifact_iteration_events.sql` | ❌ W0 | ⬜ pending |
| 207-01-01 | 01 | 1 | QA-01 | T-207-01 | Event keys + metadata allowlist reject denied persistence keys | unit | `cd app && npm test -- --run src/server/assistant/artifact-iteration-telemetry.test.ts` | ❌ W0 | ⬜ pending |
| 207-01-02 | 01 | 1 | QA-01 | T-207-01 / T-207-02 | Repository insert enforces scope dimensions | unit | `cd app && npm test -- --run src/server/repositories/artifact-iteration-telemetry.test.ts` | ❌ W0 | ⬜ pending |
| 207-02-01 | 02 | 2 | QA-01 | T-207-03 | Service emits after mutation; skip duplicate on replay | integration | `cd app && npm test -- --run src/server/assistant/plan-iteration/proposal.test.ts src/server/assistant/creative-iteration/proposal.test.ts -t telemetry` | partial | ⬜ pending |
| 207-02-02 | 02 | 2 | QA-01 | T-207-03 | Derivation + promotion emit success/failure/conflict keys | integration | `cd app && npm test -- --run src/server/jobs/derivation.test.ts src/server/assistant/artifact-version/promotion.test.ts -t telemetry` | partial | ⬜ pending |
| 207-02-03 | 02 | 2 | QA-01 | T-207-04 | Owner route requires platform owner + workspace filters | route | `cd app && npm test -- --run src/app/api/feedback/analytics/artifact-iteration/route.test.ts` | ❌ W0 | ⬜ pending |
| 207-03-01 | 03 | 2 | QA-02 | T-207-05 | Cross-thread confirm rejected at service boundary | service | `cd app && npm test -- --run src/server/assistant/plan-iteration/service.test.ts src/server/assistant/creative-iteration/service.test.ts -t "cross-thread"` | partial | ⬜ pending |
| 207-03-02 | 03 | 2 | QA-02 | T-207-06 | Reload after promotion reflects new head in VersionHistory | component | `cd app && npm test -- --run src/components/assistant/VersionHistory.test.tsx -t "reload"` | partial | ⬜ pending |
| 207-03-03 | 03 | 2 | QA-02 | T-207-06 | Stale action card after concurrent head change | component | `cd app && npm test -- --run src/components/assistant/AssistantActionCard.test.tsx -t "stale"` | partial | ⬜ pending |
| 207-04-01 | 04 | 3 | QA-02 | T-207-07 | Desktop iteration loop with mocked providers | e2e | `cd app && npx playwright test --config playwright.guided.config.ts --project=desktop tests/e2e/iterative-copilot-loop.desktop.spec.ts` | ❌ W0 | ⬜ pending |
| 207-04-02 | 04 | 3 | QA-02 | T-207-07 / T-207-08 | Mobile iteration loop + a11y landmarks on dialog/history | e2e | `cd app && npx playwright test --config playwright.guided.config.ts --project=mobile tests/e2e/iterative-copilot-loop.mobile.spec.ts` | ❌ W0 | ⬜ pending |
| 207-05-01 | 05 | 4 | QA-01, QA-02 | T-207-09 | v13.9 release gate runs telemetry + iteration test matrix | unit | `cd app && npm test -- --run tests/unit/release/v13-9-release-evidence.test.ts` | ❌ W0 | ⬜ pending |
| 207-05-02 | 05 | 4 | QA-02 | — | Production build + full suite hard gate | build | `cd app && npm test && npx tsc --noEmit --pretty false && npm run build` | ✅ | ⬜ pending |

## Wave 0 Requirements

- [ ] `app/drizzle/0068_assistant_artifact_iteration_events.sql` — append-only telemetry table
- [ ] `app/src/server/assistant/artifact-iteration-telemetry.ts` + `.test.ts` — sanitizer, D-02 keys, fire-and-forget
- [ ] `app/src/server/repositories/artifact-iteration-telemetry.ts` + `.test.ts` — insert, scoped list, owner list
- [ ] `app/src/app/api/feedback/analytics/artifact-iteration/route.ts` + `.test.ts` — owner read route (D-05)
- [ ] Telemetry emit assertions in proposal/promotion/derivation tests (extend existing)
- [ ] Component extensions: reload after promotion, stale card (D-07)
- [ ] `app/tests/e2e/iterative-copilot-loop.desktop.spec.ts` + `.mobile.spec.ts`
- [ ] `app/scripts/run-v13-9-release-gate.mjs` + `tests/unit/release/v13-9-release-evidence.test.ts`
- [ ] Update `app/playwright.guided.config.ts` testMatch for iteration specs

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Inngest lifecycle | Inherited debt | Out of phase scope per D-08; mocked in CI | Document as unverified in milestone audit (D-11) |
| Staging walk of iteration loop | QA-02 partial | CI proves mocked E2E; live staging optional | Run staging runbook if owner requests before ship |

## Validation Sign-Off

- [x] All planned capability groups have automated verification targets or Wave 0 dependencies.
- [x] Sampling continuity prevents three consecutive tasks without automated feedback.
- [x] Wave 0 lists every currently missing test reference.
- [x] Commands use no watch-mode flags.
- [x] Task-level feedback latency target is below 30 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-06-28
