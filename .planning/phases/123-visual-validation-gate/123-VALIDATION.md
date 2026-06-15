---
phase: 123
slug: visual-validation-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 123 — Validation Strategy

> Executable validation contract for controlled before/after creative generation, vision rubric thresholds, and milestone release gate.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 + Node `node:test` validators |
| Config | `app/config/vitest.config.ts` |
| Structured evidence | `123-EVIDENCE.json`, validated by `app/scripts/check-creative-validation-evidence.mjs` |
| Operator capture | `app/scripts/run-creative-validation.ts` (requires `OPENAI_API_KEY`) |
| Release orchestrator | `app/scripts/run-creative-release-gate.mjs` |
| Quick run command | `cd app && npm test -- tests/unit/ai/creative-validation-thresholds.test.ts` |
| Full suite command | `cd app && npm test && npm run lint && npm run build` |
| Estimated runtime | ~90s CI (no live generation); operator capture 15–45 min |

## Sampling Rate

- Run each task's exact automated command before its task commit.
- Run threshold unit tests after every plan wave touching aggregation or matrix code.
- Operator refreshes `123-EVIDENCE.json` only after prompt/gate changes post-capture.
- Final completion requires `check-creative-validation-evidence.mjs --stage final` plus full regression gate.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Command | Status |
|---------|------|------|-------------|-------------------|--------|
| 123-01-01 | 01 | 1 | QA-18 | `cd app && npm test -- tests/unit/ai/creative-validation-matrix.test.ts` | pending |
| 123-01-02 | 01 | 1 | QA-18 | `cd app && npm test -- tests/unit/ai/creative-validation-matrix.test.ts` | pending |
| 123-02-01 | 02 | 2 | QA-19 | `cd app && npm test -- tests/unit/ai/creative-validation-thresholds.test.ts` | pending |
| 123-02-02 | 02 | 2 | QA-18 | `node app/scripts/check-creative-validation-evidence.mjs --stage before --evidence .planning/phases/123-visual-validation-gate/123-EVIDENCE.before-fixture.json` | pending |
| 123-02-03 | 02 | 2 | QA-18, QA-20 | `node app/scripts/check-creative-validation-evidence.mjs --stage after` | pending |
| 123-03-01 | 03 | 3 | QA-18 | `test -f app/tests/fixtures/creative-corpus/base-assets/nr1-1x1-base.png` | pending |
| 123-03-02 | 03 | 3 | QA-18 | `cd app && npx tsx scripts/run-creative-validation.ts --dry-run` | pending |
| 123-03-03 | 03 | 3 | QA-18 | `node app/scripts/check-creative-validation-evidence.mjs --stage after` (checkpoint; structural only) | pending |
| 123-04-01 | 04 | 4 | QA-18–20 | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | pending |
| 123-04-02 | 04 | 4 | QA-20, QA-21 | `cd app && npm test -- tests/unit/ai/creative-validation-evidence-guard.test.ts && node scripts/run-creative-release-gate.mjs` | pending |
| 123-04-03 | 04 | 4 | QA-21 | `grep -q "QA-21" .planning/phases/123-visual-validation-gate/123-VERIFICATION.md` | pending |

## Wave 0 Requirements

- [ ] `app/scripts/creative-validation-matrix.ts` — canonical matrix (QA-18)
- [ ] `app/scripts/run-creative-validation.ts` — operator generate + score
- [ ] `app/scripts/check-creative-validation-evidence.mjs` — CI validator
- [ ] `app/scripts/run-creative-release-gate.mjs` — orchestrator
- [ ] `app/tests/unit/ai/creative-validation-thresholds.test.ts` — threshold math
- [ ] `app/tests/unit/ai/creative-validation-matrix.test.ts` — matrix coverage
- [ ] `app/tests/fixtures/creative-corpus/base-assets/` — sanitized base assets
- [ ] `app/package.json` scripts: `validate:creative`, `validate:creative:live`, `creative-release-gate`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live image regeneration + vision scoring | QA-18 | OpenAI API cost, secrets, non-determinism | Run `npm run validate:creative:live` with `OPENAI_API_KEY`; commit `123-EVIDENCE.json` + `validation-after/` PNGs |
| Visual inspection of after captures | QA-20 (supplementary) | Human sanity check optional | Review `123-BASELINE.md` table before milestone sign-off |

## Structured Evidence Contract

`123-EVIDENCE.json` is authoritative. `123-BASELINE.md` and `123-VERIFICATION.md` are generated summaries.

Required validation:

- Every matrix key has one before capture (corpus ref) and one after capture (regenerated PNG).
- `afterCaptures[].sha256` matches on-disk PNG under `app/exports/render-creatives/validation-after/`.
- `aggregate.meanQualityScore >= 75` on after captures (post-ceiling scores).
- `aggregate.factualFidelityRate >= 0.95` (gate-based: zero fidelity-class hard failures per capture; dimension means informational only).
- No after capture has hard failures in: `invented_factual_entity`, `campaign_identity_drift`, `style_reference_contamination`, `replaced_source_subject`, `wrong_brand`, `unauthorized_brand_or_ip`, `unsupported_offer`.
- `pipeline.promptHash` matches current `prompt-builder.ts` or evidence marked stale with operator refresh note.
- `seedSupported: false` documented when OpenAI image API lacks seed.

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s for CI path
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
