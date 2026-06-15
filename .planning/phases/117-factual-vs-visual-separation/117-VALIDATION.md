---
phase: 117
slug: factual-vs-visual-separation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 117 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/creative-quality-gate.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/creative-quality-gate.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 117-01-01 | 01 | 1 | SEP-01 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "input classification"` | ❌ W0 | ⬜ pending |
| 117-01-02 | 01 | 1 | SEP-01 | unit | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "input classification"` | ❌ W0 | ⬜ pending |
| 117-02-01 | 02 | 2 | SEP-02 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "visual reference transfer"` | ❌ W0 | ⬜ pending |
| 117-02-02 | 02 | 2 | SEP-02 | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts -t "restyling"` | ✅ extend | ⬜ pending |
| 117-04-01 | 04 | 3 | SEP-04 | unit | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts -t "allowed entit"` | ✅ extend | ⬜ pending |
| 117-04-02 | 04 | 3 | SEP-04 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "invented_factual_entity"` | ❌ W0 | ⬜ pending |
| 117-03-01 | 03 | 4 | SEP-03 | unit | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "contaminated parent"` | ❌ W0 | ⬜ pending |
| 117-03-02 | 03 | 4 | SEP-03 | unit | `cd app && npm test -- src/server/jobs/derivation.test.ts src/app/api/derivations/[id]/delivery-package/route.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `factual-visual-separation.ts` — classification builder, allowed-entity resolver, contamination code set
- [ ] `extractPromptInputClassificationSection` (+ optional visual transfer extractor)
- [ ] `invented_factual_entity` on `CreativeHardFailureCode` + taxonomy patterns
- [ ] `matchCanonicalCampaignSlug` / `resolveAllowedEntitiesForCampaign` in `creative-corpus.ts`
- [ ] Tests: input classification present for art_variation, format_adaptation, restyling
- [ ] Tests: restyling prompt must NOT contain `Extracted Visual Token Brief`
- [ ] Tests: derivation job throws when parent has `copied_style_reference_facts`
- [ ] Tests: gate classifies corpus invented-entity QA note as `invalid`
- [ ] Extend `quality-prompt-regression.test.ts` with classification + allowed-entities asserts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live render no longer copies style-reference athletes/brands | SEP-02 | Requires OpenAI image generation | Deferred to Phase 122 corpus validation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
