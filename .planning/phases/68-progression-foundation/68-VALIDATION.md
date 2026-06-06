---
phase: 68
slug: progression-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-06
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + eslint |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard` |
| **Full suite command** | `cd app && npm test -- src/server/progression src/app/api/workspace/progression src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard && npm run lint` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused test command for files touched by that task.
- **After every plan wave:** Run the full phase command.
- **Before `$gsd-verify-work`:** Full phase command plus `cd app && npm run build` must pass or be documented with a known unrelated blocker.
- **Max feedback latency:** 120 seconds for focused tests.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-01 | 01 | 1 | PROG-02/03/05 | unit | `cd app && npm test -- src/server/progression` | W0 | pending |
| 68-01-02 | 01 | 1 | PROG-03/05 | repository | `cd app && npm test -- src/server/progression src/app/api/workspace/progression` | W0 | pending |
| 68-01-03 | 01 | 1 | PROG-01/04/05 | route | `cd app && npm test -- src/app/api/workspace/progression` | W0 | pending |
| 68-02-01 | 02 | 2 | PROG-01/04 | hook/component | `cd app && npm test -- src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard` | W0 | pending |
| 68-02-02 | 02 | 2 | PROG-01/04 | integration/lint | `cd app && npm test -- src/lib/hooks/use-progression src/components/dashboard/AdsScientistProgressCard && npm run lint` | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- Vitest is already configured.
- Route tests already exist under `app/src/app/api/**/route.test.ts`.
- Component tests already exist under `app/src/components/**`.
- Repository/service tests already exist under `app/src/server/**`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard placement feels compact and not disruptive | PROG-01/04 | Visual judgment | Open dashboard at desktop and mobile widths; card should not behave like a hero or hide campaign list |
| Tone feels like "cientista pop" without childish RPG language | PROG-02/04 | Copy/product judgment | Review dashboard card copy in PT-BR and EN if translations are touched |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 120s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-06
