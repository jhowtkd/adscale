---
phase: 137
slug: operational-quality-release-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 137 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts`
- **After every plan wave:** Run `cd app && npm run operational-quality-release-evidence`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 137-01-01 | 01 | 1 | QALIVE-02 | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts -t QALIVE-02` | ❌ W0 | ⬜ pending |
| 137-01-02 | 01 | 1 | QALIVE-03 | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts -t QALIVE-03` | ❌ W0 | ⬜ pending |
| 137-01-03 | 01 | 1 | QALIVE-01 | script | `node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests` | ❌ W0 | ⬜ pending |
| 137-02-01 | 02 | 2 | QALIVE-01 | integration | `cd app && npm run operational-quality-release-gate` | ❌ W0 | ⬜ pending |
| 137-02-02 | 02 | 2 | QALIVE-02 | integration | `cd app && npm run operational-quality-release-gate` (technical independent) | ❌ W0 | ⬜ pending |
| 137-03-01 | 03 | 3 | QALIVE-01 | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts -t aggregate` | ❌ W0 | ⬜ pending |
| 137-03-02 | 03 | 3 | QALIVE-03 | script | `node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests` | ❌ W0 | ⬜ pending |
| 137-03-03 | 03 | 3 | QALIVE-01 | integration | `cd app && npm run operational-quality-release-gate -- --run-regression` | ❌ W0 | ⬜ pending |
| 137-04-01 | 04 | 4 | QALIVE-04 | manual | Operator review `v12.6-MILESTONE-AUDIT.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/scripts/check-operational-quality-release-evidence.mjs` — QALIVE-02/03 validator
- [ ] `app/scripts/run-operational-quality-release-gate.mjs` — QALIVE-01 orchestrator
- [ ] `.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json` — schema
- [ ] `app/tests/unit/release/operational-quality-release-evidence.test.ts` — QALIVE-02/03 tests
- [ ] `app/package.json` scripts `operational-quality-release-gate`, `operational-quality-release-evidence`
- [ ] `app/package.json` scripts `sample-coverage-evidence`, `quality-trend-evidence` (optional aliases)
- [ ] `.planning/milestones/v12.6-MILESTONE-AUDIT.md` — QALIVE-04 artifact

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Milestone audit narrative | QALIVE-04 | Human-readable closure artifact | Review `v12.6-MILESTONE-AUDIT.md` for commands, sample counts, caveats, next operator action |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
