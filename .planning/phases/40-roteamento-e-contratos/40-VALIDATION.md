---
phase: 40
slug: roteamento-e-contratos
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/lib/hooks/use-derivation-flow.test.ts src/components/workspace/DerivarModal.test.tsx` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~30–60 seconds (quick), ~2–3 min (full) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | DRV-07 | unit | hook test file | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | DRV-07 | unit | hook tests | ❌ W0 | ⬜ pending |
| 40-01-03 | 01 | 2 | DRV-07 | unit | page/hook integration | ❌ W0 | ⬜ pending |
| 40-01-04 | 01 | 2 | DRV-07 | unit | shell modal render tests | ❌ W0 | ⬜ pending |
| 40-01-05 | 01 | 3 | DRV-08 | unit | DerivarModal i18n test | ❌ W0 | ⬜ pending |
| 40-01-06 | 01 | 3 | DRV-08 | manual | grep i18n keys | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Vitest + Testing Library already configured
- [ ] `use-derivation-flow.test.ts` — create with Phase 40-01
- [ ] `DerivarModal.test.tsx` — create or extend with Phase 40-01

*Existing infrastructure covers framework; new test files created in plan wave 1–3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click each Derivar tile → correct shell modal title | DRV-07 | Visual modal stack | Login, open campaign workspace, Derivar → verify 4 routes |
| Estilizar unaffected | DRV-10 | Separate modal path | Open Estilizar from ActionCards after Derivar refactor |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity planned
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
