---
phase: 163
slug: corpus-learning-proposals
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 163 — Validation Strategy

> Per-phase validation contract for corpus learning proposal gap closure.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/human-quality/learning/` |
| **API route command** | `cd app && npm test -- --run src/app/api/admin/quality/learning/` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~15s (learning quick), ~3–5 min (full) |

---

## Sampling Rate

- **After every task commit:** Run learning quick run command
- **After every plan wave:** Run learning quick + API route command
- **Before phase verification:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 163-01-01 | 01 | 1 | LEARN-02, LEARN-05 | unit | repository cooldown + approved-rule helpers | ❌ W0 | ⬜ pending |
| 163-01-02 | 01 | 1 | LEARN-01, LEARN-04 | unit | `aggregate.test.ts` + `generate.test.ts` extensions | ✅ | ⬜ pending |
| 163-02-01 | 02 | 2 | LEARN-06 | unit | `factual-alerts.test.ts` | ❌ W0 | ⬜ pending |
| 163-02-02 | 02 | 2 | LEARN-04 | unit | `proposals.test.ts` fixture ack | ✅ | ⬜ pending |
| 163-02-03 | 02 | 2 | LEARN-06 | integration | factual-alerts route test | ❌ W0 | ⬜ pending |
| 163-03-01 | 03 | 3 | LEARN-01..06 | unit | `corpus-learning-loop.test.ts` vertical slice | ❌ W0 | ⬜ pending |
| 163-03-02 | 03 | 3 | LEARN-03 | integration | proposals route filters (existing) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/tests/unit/human-quality/learning/client-learning-proposal-repository.test.ts` — cooldown query + approved-rule lookup
- [ ] `app/tests/unit/human-quality/learning/factual-alerts.test.ts` — factual_issue slice detection
- [ ] `app/src/app/api/admin/quality/learning/factual-alerts/route.test.ts` — owner auth + payload shape
- [ ] `app/tests/unit/human-quality/learning/corpus-learning-loop.test.ts` — eval → propose → accept → rule chain

---

## Requirement → Verification Matrix

| Requirement | Automated Proof |
|-------------|-----------------|
| LEARN-01 | aggregate + generate tests: thresholds, artifactIds, fixtureOnly |
| LEARN-02 | dedupe + approved-rule skip + DB partial unique index (existing) |
| LEARN-03 | `route.test.ts` GET filters (existing) + vertical slice list step |
| LEARN-04 | accept creates `corpus_quality` rule; fixture ack enforced |
| LEARN-05 | reject cooldown persisted; generate skips slice in cooldown |
| LEARN-06 | factual alerts API; aggregate never proposes `factual_issue` |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| On-demand generate in staging | LEARN-01 | Needs evaluated corpus rows in DB | Owner POST `/api/admin/quality/learning/proposals/generate`, confirm new `proposed` rows |
| Factual alert visibility | LEARN-06 | UI in Phase 165 | Owner GET factual-alerts; confirm `factual_issue` slices with ≥3 evals appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0

**Approval:** pending
