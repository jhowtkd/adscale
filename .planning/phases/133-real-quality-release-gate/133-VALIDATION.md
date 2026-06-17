---
phase: 133
slug: real-quality-release-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 133 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts` |
| **Full suite command** | `cd app && npm run real-quality-release-gate` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts` (after Wave 1)
- **After every plan wave:** Run `cd app && npm run real-quality-release-evidence` (template checker)
- **Before `$gsd-verify-work`:** Full `npm run real-quality-release-gate` + milestone audit review
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 133-01-01 | 01 | 1 | QA-23 | script | `node app/scripts/check-real-quality-release-evidence.mjs --skip-tests` | ❌ W0 | ⬜ pending |
| 133-01-02 | 01 | 1 | QA-24 | unit | `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts` | ❌ W0 | ⬜ pending |
| 133-02-01 | 02 | 2 | QA-22 | script | `cd app && npm run real-quality-release-gate -- --dry-run` | ❌ W0 | ⬜ pending |
| 133-03-01 | 03 | 3 | QA-22 | script | `node app/scripts/check-creative-validation-evidence.mjs --factual-only` | ❌ W0 | ⬜ pending |
| 133-03-02 | 03 | 3 | QA-22, QA-23 | script | `node app/scripts/check-real-quality-release-evidence.mjs --aggregate --skip-tests` | ❌ W0 | ⬜ pending |
| 133-03-03 | 03 | 3 | QA-22, QA-24 | script | `node app/scripts/check-real-quality-release-evidence.mjs --run-regression` | ❌ W0 | ⬜ pending |
| 133-04-01 | 04 | 4 | QA-22–24 | checkpoint | Milestone audit + ROADMAP/STATE closure | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/scripts/check-real-quality-release-evidence.mjs` — QA-23/24 validator
- [ ] `app/scripts/run-real-quality-release-gate.mjs` — QA-22 orchestrator
- [ ] `.planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json` — schema contract
- [ ] `app/tests/unit/release/real-quality-release-evidence.test.ts` — QA-24 path A/B tests
- [ ] `app/package.json` scripts `real-quality-release-gate`, `real-quality-release-evidence`
- [ ] Optional: `--factual-only` on `check-creative-validation-evidence.mjs`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator live evidence generation | QA-23 | Requires DATABASE_URL + evaluated corpus | Run 130/131/132 CLIs; merge into `133-EVIDENCE.json`; verify checker passes |
| Caveat acceptance for QA-24 Path B | QA-24 | Human judgment on remaining visual gap | Operator adds `acceptedCaveats[]` with rationale, acceptedAt, shrunk gap vs 70.17 baseline |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
