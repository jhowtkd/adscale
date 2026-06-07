---
phase: 75
slug: event-schema-and-ingest-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + eslint |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/beta-analytics/sanitize.test.ts src/app/api/analytics/events/route.test.ts` |
| **Full suite command** | `cd app && npm test -- src/server/beta-analytics src/server/repositories/beta-analytics.test.ts src/app/api/analytics/events && npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused test command for files touched by that task.
- **After every plan wave:** Run the full phase command.
- **Before `$gsd-verify-work`:** Full suite plus `cd app && npm run build` must pass.
- **Max feedback latency:** 90 seconds for focused tests.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 1 | INST-01 | migration/schema | `cd app && npm run db:generate` (no drift) | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 1 | INST-01 | repository | `cd app && npm test -- src/server/repositories/beta-analytics.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-01 | 02 | 1 | INST-05 | unit | `cd app && npm test -- src/server/beta-analytics/sanitize.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-02 | 02 | 1 | INST-05/06 | unit | `cd app && npm test -- src/server/beta-analytics/sanitize.test.ts` | ❌ W0 | ⬜ pending |
| 75-03-01 | 03 | 2 | INST-01/06 | route | `cd app && npm test -- src/app/api/analytics/events/route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/server/beta-analytics/sanitize.ts` + `sanitize.test.ts` — INST-05 allowlist rejection
- [ ] `src/server/beta-analytics/record.ts` — shared write path with session FK validation
- [ ] `src/server/repositories/beta-analytics.ts` + `.test.ts` — INST-01 insert + list filters
- [ ] `src/app/api/analytics/events/route.ts` + `route.test.ts` — INST-01/06 ingest API
- [ ] `app/drizzle/0033_*.sql` — `beta_sessions` + `beta_analytics_events` migration
- [ ] `schema.ts` exports: `betaSessions`, `betaAnalyticsEvents`, inferred types

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly on staging DB | INST-01 | Requires `DATABASE_URL` | Run `cd app && npm run db:migrate` against staging; confirm tables exist |
| Events queryable by filters in SQL | INST-01 | Optional DB integration | `SELECT` by workspace_id, session_id, event_key, created_at after test insert |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 90s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-07
