# Phase 163 Research: Corpus Learning Proposals

**Researched:** 2026-06-24  
**Branch scouted:** `feat/corpus-learning-loop` (current workspace)  
**Confidence:** HIGH — code verified in-tree, not anecdotal

## Objective

Close LEARN-01..06 by hardening the corpus → proposal → accept/reject loop. **Do not re-implement** what already ships on `feat/corpus-learning-loop`.

## Existing vs Gap

| Area | Status | Location | LEARN |
|------|--------|----------|-------|
| Migration `client_learning_proposals` | ✅ Exists | `app/drizzle/0052_client_learning_proposals.sql` | — |
| Partial unique index (`proposed` per slice) | ✅ Exists | same migration | LEARN-02 |
| Schema + repository CRUD | ✅ Exists | `schema.ts`, `client-learning-proposal.ts` | LEARN-03 |
| Aggregator thresholds (≥3, \|delta\|≥15, ≥2 reject/regenerate) | ✅ Exists | `learning/aggregate.ts` | LEARN-01 |
| `factual_issue` skipped in aggregator | ✅ Exists | `aggregate.ts` L79 | LEARN-06 (partial) |
| Persist + dedupe active `proposed` | ✅ Exists | `learning/generate.ts` | LEARN-02 |
| Accept → `calibration_rule` (`corpus_quality`) | ✅ Exists | `learning/proposals.ts` | LEARN-04 |
| Reject + 30-day `cooldownUntil` | ✅ Exists | `proposals.ts` | LEARN-05 (partial) |
| Owner APIs (list / accept / reject / generate) | ✅ Exists | `api/admin/quality/learning/proposals/*` | LEARN-03 |
| Inngest daily aggregator job | ✅ Exists | `jobs/learning-proposal-aggregator.ts` | LEARN-01 |
| Unit + route tests | ✅ Exists | `tests/unit/human-quality/learning/*`, route `*.test.ts` | — |
| Cross-client global promotion | ✅ Exists (out of scope) | `learning/cross-client.ts`, generate route | Phase 167 GLOBAL-* |

### Gaps (plan these)

| Gap | Impact | Requirement |
|-----|--------|-------------|
| **Cooldown not enforced on re-proposal** | Rejected slices can immediately re-propose | LEARN-05 |
| **No skip when approved `corpus_quality` rule exists** | Duplicate proposals for solved failure reasons | LEARN-01, LEARN-02 |
| **`artifactIds` not populated in `evidenceRefs`** | Accept writes empty `supportingSignalIds` | LEARN-04 |
| **No `fixtureOnly` flag / accept acknowledgment** | Fixture-only corpus can accept without operator ack | LEARN-04 |
| **No factual-issue admin alert surface** | LEARN-06 only half-done (skip proposal, no alert) | LEARN-06 |
| **No vertical slice test** | Loop unproven end-to-end in one test harness | All |
| **`sourceLabel` not joined in aggregator input** | Cannot compute `fixtureOnly` accurately | LEARN-04 |

## Recommended Build Order

1. **Repository + aggregator hardening** — cooldown, approved-rule gate, artifactIds, fixtureOnly, source join  
2. **Accept hardening + factual alerts API** — `acknowledgeFixtureOnly`, GET factual alerts  
3. **Vertical integration test + phase verification** — prove eval → propose → accept → rule

## Out of Scope (Phase 163)

- Prompt injection of `corpus_quality` rules → **Phase 164** (APPLY-*)
- Owner calibration panel UI → **Phase 165** (PANEL-03)
- Cross-client → `rubric_calibration_adjustments` → **Phase 167** (GLOBAL-*)
- Removing cross-client call from `generate` route (pre-existing; leave unless 167 plans relocation)

## Standard Stack

No new npm dependencies. Extend Drizzle queries, Zod on accept body, Vitest.

## Pitfalls (from design + codebase)

| Pitfall | Mitigation |
|---------|------------|
| Overfitting MIN=3 slices | Keep thresholds; document in proposal `evidenceRefs.stats` |
| `factual_issue` leaking into prompt | Already blocked in aggregate + directives; add alert path only |
| Accept without fixture ack | Require `acknowledgeFixtureOnly: true` when `evidenceRefs.fixtureOnly` |
| Cooldown bypass via generate on-demand | Check `cooldownUntil > now()` in `generate.ts` before insert |

## Sources

- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md` §6–7, §12–13
- `.planning/REQUIREMENTS.md` LEARN-01..06
- `.planning/research/SUMMARY.md` — "fixture ack on accept + aggregator hardened"
- Live code on `feat/corpus-learning-loop` (paths above)
