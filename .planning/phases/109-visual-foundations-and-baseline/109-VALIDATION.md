---
phase: 109
slug: visual-foundations-and-baseline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-13
---

# Phase 109 — Validation Strategy

> Per-phase validation contract for visual foundation sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + Testing Library + Playwright 1.60 + deterministic Node static checks |
| **Config file** | `app/config/vitest.config.ts`, `app/playwright.config.ts` or a scoped visual extension |
| **Quick run command** | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx && node scripts/check-visual-contract.mjs` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build && npm run test:e2e -- visual-foundations.spec.ts` |
| **Estimated runtime** | ~15–30s focused; full gate depends on build and E2E runtime |

---

## Sampling Rate

- **After every task commit:** Run the focused test or static validator named by that task.
- **After every plan wave:** Run focused Vitest + visual contract checker; run Playwright when browser artifacts exist.
- **Before `$gsd-verify-work`:** Full suite, browser matrix and manual visual sign-off must be green.
- **Max feedback latency:** 30 seconds for focused checks; browser/full gates may run longer at wave boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 109-01-01 | 01 | 1 | QA-14 | static inventory | `node app/scripts/check-visual-ownership.mjs` | ❌ W0 | ⬜ pending |
| 109-01-02 | 01 | 1 | QA-14 | fixture/browser preflight | `cd app && npm run test:e2e -- visual-foundations.spec.ts --grep "baseline preflight"` | ❌ W0 | ⬜ pending |
| 109-01-03 | 01 | 1 | QA-14 | docs/static | `git diff --check -- .planning/phases/109-visual-foundations-and-baseline` | ✅ | ⬜ pending |
| 109-02-01 | 02 | 2 | FOUND-01, FOUND-03 | static token contract | `cd app && node scripts/check-visual-contract.mjs` | ❌ W0 | ⬜ pending |
| 109-02-02 | 02 | 2 | FOUND-02 | unit/static | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx` | ❌ W0 | ⬜ pending |
| 109-02-03 | 02 | 2 | FOUND-04 | static layer contract | `cd app && node scripts/check-visual-contract.mjs --section layers` | ❌ W0 | ⬜ pending |
| 109-03-01 | 03 | 3 | FOUND-05 | component unit | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx` | ❌ W0 | ⬜ pending |
| 109-03-02 | 03 | 3 | FOUND-01, FOUND-02 | lint/static | `cd app && node scripts/check-visual-contract.mjs && npm run lint` | ❌ W0 | ⬜ pending |
| 109-03-03 | 03 | 3 | FOUND-04, FOUND-05 | component interaction | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx` | ❌ W0 | ⬜ pending |
| 109-04-01 | 04 | 4 | FOUND-01–05 | browser assertions | `cd app && npm run test:e2e -- visual-foundations.spec.ts` | ❌ W0 | ⬜ pending |
| 109-04-02 | 04 | 4 | QA-14 | static ownership | `node app/scripts/check-visual-ownership.mjs` | ❌ W0 | ⬜ pending |
| 109-04-03 | 04 | 4 | FOUND-01–05, QA-14 | full gate | `cd app && npm test && npm run lint && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/scripts/check-visual-contract.mjs` — canonical-token, alias, geometry, layer and no-new-dialect enforcement.
- [ ] `app/scripts/check-visual-ownership.mjs` — unique route/component owner and Phase 114 scenario validation.
- [ ] `app/src/components/ui/visual-foundations.test.tsx` — shared primitive state and interaction proof.
- [ ] `app/tests/e2e/visual-foundations.spec.ts` — authenticated baseline, overflow, layer and focus assertions.
- [ ] Stable local auth/fixture setup for representative PT-BR/EN, light/dark and dense/empty/error states.

---

## Requirement-to-Evidence Matrix

| Requirement | Observable assertion | Automated evidence | Browser/manual evidence | Status |
|-------------|----------------------|--------------------|-------------------------|--------|
| FOUND-01 | Canonical semantic roles exist and equivalent primitives render consistently in light/dark | token checker + primitive test | representative primitive and route captures | ⬜ pending |
| FOUND-02 | Type, spacing and density follow one compact professional contract without reducing accessibility | primitive test + contract checker | mobile/desktop review and touch/focus sign-off | ⬜ pending |
| FOUND-03 | Geometry, gutters, widths and sticky offsets have shared named contracts | contract checker | 390–1920 runtime measurements | ⬜ pending |
| FOUND-04 | Shared layer scale orders sticky, shell, popover, backdrop, overlay and toast | layer checker + overlay interaction test | stacking stress compositions with computed evidence | ⬜ pending |
| FOUND-05 | Shared primitives consume the canonical vocabulary without API breakage | primitive tests + no-new-dialect checker | default/hover/focus/disabled/loading/error review | ⬜ pending |
| QA-14 | Every authenticated route and visible family has one implementation owner and Phase 114 scenario | ownership validator | human review of dynamic routes and redirects | ⬜ pending |

---

## Browser Baseline Contract

Representative evidence must include widths `390`, `768`, `1024`, `1280`, `1440` and `1920`. Phase 109 does not need every route at every width, but the selected matrix must collectively cover:

- Dashboard populated and empty/error state.
- Campaign list with dense/long content.
- Campaign workspace with sticky content and an overlay composition.
- Settings with long PT-BR/EN labels and form content.
- Light and dark themes across the set.
- No document-level horizontal overflow.
- Bounded reading/form widths and deliberate wide/gallery use at 1920.

Pre-change screenshots must be captured before global token edits. Post-change screenshots use the same fixture IDs, state and viewport. Generated artifacts must not contain secrets, production customer data or personal emails.

---

## Layer Stress Contract

Validate at least:

1. Sticky content + dropdown/popover + toast.
2. Shell + backdrop + dialog or sheet + toast.

Expected ordering:

`base < raised < sticky < shell < shell-floating < popover < backdrop < overlay < toast < tour < skip-link`

When an issue occurs, record computed `z-index`, stacking-context ancestors and bounding boxes. Screenshot-only evidence is insufficient for stacking failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tonal hierarchy feels compact and professional rather than compressed | FOUND-01, FOUND-02 | Perceptual hierarchy cannot be fully asserted from tokens | Compare before/after representative routes; verify planes precede borders/cards and expert metadata remains legible |
| Cards imply actionable/inspectable objects | FOUND-05 | Semantic appropriateness depends on product context | Review proof primitives and representative routes; reject static section wrappers or nested cards |
| Restrained green remains meaningful | FOUND-01 | Accent overuse is perceptual | Review light/dark captures and confirm green is limited to primary action, focus, active selection and meaningful status |
| Ownership inventory reflects real navigation and dynamic routes | QA-14 | Static route enumeration may miss redirects or conditional owner surfaces | Walk route manifest and compare against authenticated navigation and dynamic campaign routes |
| Foundation changes introduce no behavior regression | FOUND-05 | Tests cannot prove every workflow remained unchanged | Smoke primary actions on representative routes without altering data contracts |

---

## Dirty Worktree Isolation

The following pre-existing files are unrelated to Phase 109 and must not be reverted, staged or modified by foundation work unless the user explicitly changes scope:

- `app/src/components/settings/BillingTab.test.tsx`
- `app/src/components/settings/BillingTab.tsx`
- `app/src/server/repositories/billing.ts`
- `app/scripts/verify-preview-fix.mjs`

Validation reports must distinguish failures caused by these unrelated changes from Phase 109 regressions and rerun scoped checks where necessary.

---

## Validation Sign-Off

- [ ] Every task has an automated verify command or explicit Wave 0 dependency.
- [ ] No three consecutive implementation tasks lack automated feedback.
- [ ] Wave 0 files exist before dependent tasks run.
- [ ] No watch-mode flags are used.
- [ ] Focused feedback latency stays below 30 seconds where practical.
- [ ] Before/after browser baselines use deterministic fixtures.
- [ ] All six requirements have automated plus browser/manual evidence.
- [ ] Full test, lint and build gates pass.
- [ ] Ownership validator reports complete unique coverage.
- [ ] Unrelated billing files remain untouched by Phase 109 commits.

**Approval:** pending
