---
phase: 171
slug: persistent-product-trust-baseline
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
verified: 2026-06-25
---

# Phase 171 — Validation Strategy

> Per-phase validation contract for settings persistence and trust baseline.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via `npm test -- --run`) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/app/\(dashboard\)/settings/settings-nav.test.ts` |
| **Full suite command** | `cd app && npm test -- --run src/app/api/user/profile/route.test.ts src/app/api/user/profile/avatar/route.test.ts src/app/api/workspace/settings/route.test.ts src/lib/hooks/use-user-profile.test.tsx src/lib/hooks/use-workspace-settings.test.tsx 'src/app/(dashboard)/settings/settings-nav.test.ts' src/lib/hooks/use-billing.test.tsx` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific `npm test -- --run ...` command from the map below.
- **After every plan wave:** Run all tests for touched API/hook/nav paths in that wave.
- **Before `$gsd-verify-work`:** Full suite command must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 171-01-01 | 01 | 1 | TRUST-01, TRUST-02 | schema | `cd app && npm run build` | no | green |
| 171-01-02 | 01 | 1 | TRUST-01, TRUST-04 | route | `cd app && npm test -- --run src/app/api/user/profile/route.test.ts src/app/api/user/profile/avatar/route.test.ts` | no | green |
| 171-01-03 | 01 | 1 | TRUST-02, TRUST-04 | route | `cd app && npm test -- --run src/app/api/workspace/settings/route.test.ts` | no | green |
| 171-02-01 | 02 | 2 | TRUST-01, TRUST-04 | hook | `cd app && npm test -- --run src/lib/hooks/use-user-profile.test.tsx` | no | green |
| 171-02-02 | 02 | 2 | TRUST-01, TRUST-04 | component | `cd app && npm test -- --run src/lib/hooks/use-user-profile.test.tsx` | no | green |
| 171-03-01 | 03 | 2 | TRUST-02, TRUST-04 | hook | `cd app && npm test -- --run src/lib/hooks/use-workspace-settings.test.tsx` | no | green |
| 171-03-02 | 03 | 2 | TRUST-02, TRUST-04 | component | `cd app && npm test -- --run src/lib/hooks/use-workspace-settings.test.tsx` | no | green |
| 171-04-01 | 04 | 3 | TRUST-03 | unit | `cd app && npm test -- --run 'src/app/(dashboard)/settings/settings-nav.test.ts'` | yes | green |
| 171-04-02 | 04 | 3 | TRUST-05 | regression | `cd app && npm test -- --run tests/unit/settings/settings-regression.test.ts src/lib/hooks/use-billing.test.tsx 'src/app/(dashboard)/settings/settings-nav.test.ts'` | yes | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Wave 0 is satisfied by Plan 01 Task 1 (schema + migration) before route tests land:

- [x] `user.bio` and `user.timezone` columns in schema + migration SQL
- [x] `workspaces.description`, `industry`, `website`, `timezone` columns in schema + migration SQL
- [x] `npm run build` passes after schema change

Existing infrastructure reused (no new Wave 0 scaffolds beyond migration):

- Vitest route/hook patterns from `progression/route.test.ts`, `use-billing.test.tsx`
- `settings-nav.test.ts` already exists — update expectations in Plan 04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Profile survives hard refresh | TRUST-01 | Session + browser state | Save profile → hard refresh → values match |
| Workspace survives logout/login | TRUST-02 | Multi-session | Save workspace → logout → login → values match |
| Integrations tab honest unavailable | TRUST-03 | Visual badge | Open `?tab=integrations` → falls back to brandKit; integrations nav shows coming-soon |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers schema/migration before route tests
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter after execution

**Approval:** Phase 171 automated validation complete (2026-06-25). Manual browser UAT remains accepted milestone tech debt, tracked in the v13.3 audit.
