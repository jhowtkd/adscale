---
phase: 109
slug: visual-foundations-and-baseline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-13
revised: 2026-06-13
---

# Phase 109 — Validation Strategy

> Executable validation contract for ownership, pre/post visual evidence, canonical foundations, basic controls/data states, overlays, and protected dirty-worktree isolation.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4 + Testing Library + Playwright 1.60 + Node `node:test` + deterministic Node validators |
| Config | `app/config/vitest.config.ts`, `app/playwright.visual.config.ts` |
| Structured evidence | `109-EVIDENCE.json`, validated by `app/scripts/check-visual-evidence.mjs` |
| Protected-state snapshot | `109-DIRTY-SNAPSHOT.json`, captured/verified by `app/scripts/snapshot-visual-dirty-state.mjs` |
| Synthetic identity | `visual-foundations@example.test`; no existing/dev-admin/personal identity |
| Full gate | Exact command in task `109-06-04` |

## Sampling Rate

- Run each task's exact automated command before its task commit.
- Run the protected dirty-state verifier at the end of every implementation wave.
- Capture protected state in Wave 1, then capture all `before` artifacts and validate the current `globals.css` hash before Wave 3 edits.
- Begin each plan scope baseline once before its first declared edit; every later scope operation is verify-only.
- Run browser checks only after deterministic synthetic fixtures and mask assertions pass.
- Final completion requires `check-visual-evidence.mjs --stage final`; Markdown or `rg` presence alone is never evidence.

## Per-Task Verification Map

Every row below matches the current six-plan task set.

| Task ID | Wave | Requirement | Automated Command | Status |
|---------|------|-------------|-------------------|--------|
| 109-01-01 | 1 | QA-14 | `node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-01` | pending |
| 109-01-02 | 1 | QA-14 | `cd app && node --test scripts/snapshot-visual-dirty-state.test.mjs scripts/check-plan-scope.test.mjs && cd .. && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-01` | pending |
| 109-02-01 | 2 | QA-14 | `node app/scripts/check-visual-ownership.mjs` | pending |
| 109-02-02 | 2 | QA-14 | `cd app && npx tsc --noEmit --pretty false && npx playwright test --config playwright.visual.config.ts visual-foundations.spec.ts --grep "baseline preflight"` | pending |
| 109-02-03 | 2 | QA-14 | `cd app && npx playwright test --config playwright.visual.config.ts visual-foundations.spec.ts --grep "before baseline\|empty state\|loading state\|error state" && cd .. && node app/scripts/check-visual-ownership.mjs && node app/scripts/check-visual-evidence.mjs --stage before && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-02` | pending |
| 109-03-01 | 3 | FOUND-01, FOUND-03, FOUND-04 | `node app/scripts/check-visual-evidence.mjs --stage before && cd app && node --test scripts/check-visual-contract.test.mjs && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "foundation test harness loads"` | pending |
| 109-03-02 | 3 | FOUND-01 | `cd app && node --test scripts/check-visual-contract.test.mjs && node scripts/check-visual-contract.mjs --section tokens && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "tokens\|themes\|aliases\|semantic states"` | pending |
| 109-03-03 | 3 | FOUND-02, FOUND-03 | `cd app && node --test scripts/check-visual-contract.test.mjs && node scripts/check-visual-contract.mjs --section geometry && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "geometry\|density\|typography\|radius\|motion\|content width"` | pending |
| 109-03-04 | 3 | FOUND-04 | `cd app && node --test scripts/check-visual-contract.test.mjs && node scripts/check-visual-contract.mjs && node scripts/check-visual-contract.mjs --section layers && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx && npm run lint && cd .. && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-03` | pending |
| 109-04-01 | 4 | FOUND-01, FOUND-02, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "button\|input\|textarea" && node scripts/check-visual-contract.mjs --section dialect` | pending |
| 109-04-02 | 4 | FOUND-01, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "badge\|status" && node scripts/check-visual-contract.mjs --section tokens` | pending |
| 109-04-03 | 4 | FOUND-02, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "table\|skeleton\|empty state\|loading state\|error state" && node scripts/check-visual-contract.mjs` | pending |
| 109-04-04 | 4 | FOUND-01, FOUND-02, FOUND-05 | `cd app && node --test scripts/check-visual-contract.test.mjs && node scripts/check-visual-contract.mjs && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx -t "button\|input\|textarea\|badge\|status\|table\|skeleton\|empty state\|loading state\|error state" && npm run lint && cd .. && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-04 && git diff --check -- app/src/components/ui app/scripts/check-visual-contract.mjs` | pending |
| 109-05-01 | 5 | FOUND-04, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-overlays.test.tsx -t "dialog\|sheet\|focus return\|escape" && node scripts/check-visual-contract.mjs --section layers` | pending |
| 109-05-02 | 5 | FOUND-04, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-overlays.test.tsx -t "dropdown\|select\|tooltip\|popover" && node scripts/check-visual-contract.mjs --section layers` | pending |
| 109-05-03 | 5 | FOUND-04, FOUND-05 | `cd app && npx vitest run --config config/vitest.config.ts src/components/ui/visual-overlays.test.tsx src/components/layout/TopBar.test.tsx src/components/feedback/FeedbackModal.test.tsx src/components/workspace/derivation-flow-regression.test.tsx` | pending |
| 109-05-04 | 5 | FOUND-04, FOUND-05 | `cd app && node --test scripts/check-visual-contract.test.mjs && node scripts/check-visual-contract.mjs && npx vitest run --config config/vitest.config.ts src/components/ui/visual-overlays.test.tsx && npm run lint && cd .. && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-05 && git diff --check -- app/src/components/ui app/scripts/check-visual-contract.mjs` | pending |
| 109-06-01 | 6 | FOUND-01–05 | `cd app && npx playwright test --config playwright.visual.config.ts visual-foundations.spec.ts --grep "foundation matrix\|empty state\|loading state\|error state" && cd .. && node app/scripts/check-visual-evidence.mjs --stage after` | pending |
| 109-06-02 | 6 | FOUND-04, FOUND-05 | `cd app && npx playwright test --config playwright.visual.config.ts visual-foundations.spec.ts --grep "account dropdown\|settings confirmation dialog\|derivation review sheet\|layer harness" && cd .. && node app/scripts/check-visual-evidence.mjs --stage after --section overlays` | pending |
| 109-06-03 | 6 | FOUND-01–05, QA-14 | `node app/scripts/check-visual-ownership.mjs && node app/scripts/check-visual-evidence.mjs --stage final && cd app && node scripts/check-visual-contract.mjs && cd .. && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-06` | pending |
| 109-06-04 | 6 | FOUND-01–05, QA-14 | `cd app && node --test scripts/check-visual-contract.test.mjs && npx vitest run --config config/vitest.config.ts src/components/ui/visual-foundations.test.tsx src/components/ui/visual-overlays.test.tsx src/components/layout/TopBar.test.tsx && node scripts/check-visual-contract.mjs && npm test && npm run lint && npm run build && npx playwright test --config playwright.visual.config.ts visual-foundations.spec.ts && cd .. && node app/scripts/check-visual-ownership.mjs && node app/scripts/check-visual-evidence.mjs --stage final && node app/scripts/snapshot-visual-dirty-state.mjs verify .planning/phases/109-visual-foundations-and-baseline/109-DIRTY-SNAPSHOT.json && node app/scripts/check-plan-scope.mjs verify --plan 109-06 && git diff --check` | pending |

## Wave 0 Requirements

- [ ] `app/scripts/check-visual-ownership.mjs`: unique implementation ownership restricted to 109-113; Phase 114 scenario references required.
- [ ] `app/scripts/check-visual-evidence.mjs`: schema, CSS chronology, exact matrix, artifact hashes, masks, valid result states, requirement closure.
- [ ] `app/scripts/snapshot-visual-dirty-state.mjs`: HEAD blob, index entry, worktree SHA-256, porcelain-v2 capture/verify.
- [ ] `app/scripts/check-plan-scope.mjs`: immutable per-plan HEAD/index/worktree/untracked allowlist verification with baselines under `.git/gsd-guards/`.
- [ ] `app/scripts/check-visual-contract.mjs` and `.test.mjs`: contract enforcement with green self-tests and diagnostic codes.
- [ ] `app/src/components/ui/visual-foundations.test.tsx`: token/basic control/data-state tests and named green harness smoke.
- [ ] `app/src/components/ui/visual-overlays.test.tsx`: overlay public-interface tests.
- [ ] `app/tests/e2e/visual-foundations.spec.ts`: synthetic-auth route/state matrix and real overlay triggers.
- [ ] `app/tests/e2e/support/visual-layer-harness.ts`: Playwright-only `page.setContent()` combined-layer harness, never imported by app source.
- [ ] Synthetic seeded populated/empty/loading/error states and required masking.

## Structured Evidence Contract

`109-EVIDENCE.json` is authoritative. `109-BASELINE.md`, `109-VALIDATION.md`, and `109-VERIFICATION.md` are generated or reconciled summaries.

Required validation:

- `before.cssHash` equals `git hash-object app/src/app/globals.css` at Wave 2 completion.
- Wave 3 refuses to edit globals unless `--stage before` passes.
- `after.cssHash` equals the final current stylesheet and differs from `before.cssHash`.
- Every required scenario key has exactly one before and one after artifact with matching fixture/state/viewport/theme/locale.
- Artifact files exist and SHA-256 hashes match.
- Identity is `visual-foundations@example.test`; screenshot masks include email/user/workspace/client/campaign IDs/timestamps/unstable generated imagery as applicable.
- Results are only `pass` or `deferred`; final requirement results must all be `pass`.
- `pending`, `failed`, `blocked`, unknown/malformed results, missing command exit codes, missing artifacts, duplicate keys, incomplete matrices, or owner 114 fail validation.

## Required Browser Matrix

Exact variants are encoded in `check-visual-evidence.mjs`; both before and after are mandatory.

| Surface | States | Required widths |
|---------|--------|-----------------|
| Dashboard | populated, empty, loading, error | populated: 390, 1024, 1440, 1920; state samples: 390, 768, 1280 |
| Campaign list | dense, empty, loading, error | dense: 390, 768, 1280, 1920; state samples: 390, 768, 1280 |
| Campaign workspace | populated, loading, error | populated: 390, 1024, 1440; state samples: 390, 1024 |
| Settings | normal, validation-error | 390, 768, 1280 |
| Real overlays | account dropdown, settings confirmation dialog, derivation review sheet | 390 and/or 1440 as specified by scenario |
| Layer harness | sticky+popover+toast; shell+backdrop+overlay+toast | 390, 1440 |

Collectively cover light/dark and PT-BR/EN. Every route assertion includes overflow, heading/action visibility, fixed chrome intersection, focus visibility, and unexpected browser errors.

## Overlay Mechanisms

- Account dropdown: existing TopBar account button and `DropdownMenu`.
- Confirmation dialog: existing Settings → Brand Kit delete action in `BrandKitTab.tsx`, which opens `ConfirmDialog`; no new production trigger.
- Sheet: existing workspace derivation Preview/Review action opening `DerivationReviewSheet`.
- Combined stress: `app/tests/e2e/support/visual-layer-harness.ts`, imported only by Playwright. It calls `page.setContent()` and receives canonical values extracted from `globals.css`. It cannot be bundled or routed by Next because no app source imports it.

Expected order:

`base < raised < sticky < shell < shell-floating < popover < backdrop < overlay < toast < tour < skip-link`

Failures record computed z-index, stacking-context ancestors, and bounding boxes before screenshot capture.

## Protected Dirty-Worktree Isolation

Protected paths:

- `app/src/components/settings/BillingTab.test.tsx`
- `app/src/components/settings/BillingTab.tsx`
- `app/src/server/repositories/billing.ts`
- `app/scripts/verify-preview-fix.mjs`

`109-DIRTY-SNAPSHOT.json` records for each path:

- repository HEAD commit at capture;
- HEAD blob ID or absent marker;
- index stage/mode/blob or absent marker;
- worktree SHA-256 or absent marker;
- exact porcelain-v2 status record.

Verification fails on any change, including stage/unstage, commit, deletion, recreation, content mutation, or status transition. Printing `git status` is insufficient. Execution commits always use explicit Phase 109 file lists.

## Requirement-to-Evidence Matrix

| Requirement | Automated evidence | Browser/manual evidence | Final rule |
|-------------|--------------------|-------------------------|------------|
| FOUND-01 | token checker/self-tests + primitive tests | light/dark paired routes and semantic states | structured result `pass` |
| FOUND-02 | geometry/density/type tests + controls/data-state tests | mobile/desktop, touch/focus, empty/loading/error review | structured result `pass` |
| FOUND-03 | geometry/content-width checker | all six widths, bounded/wide assertions | structured result `pass` |
| FOUND-04 | layer checker + overlay tests | real triggers + both layer harness compositions | structured result `pass` |
| FOUND-05 | controls/data-state/overlay tests + dialect checker | paired default/disabled/invalid/empty/loading/error/overlay states | structured result `pass` |
| QA-14 | ownership validator restricted to owners 109-113 | dynamic routes/families each reference Phase 114 scenario | structured result `pass` |

## Manual Sign-Off

- Compact and professional, not compressed.
- Green remains restrained and meaningful.
- Tonal planes establish hierarchy before cards.
- Cards imply actionable or inspectable objects.
- Light/dark and PT-BR/EN preserve critical information.
- Focus is visible and touch targets remain usable.
- No capability, permission, business rule, route action, or workflow behavior changes.
- Every deferred defect has exactly one implementation owner in 110-113 and a Phase 114 scenario.

## Validation Sign-Off

- [ ] All 21 task commands above have passed exactly.
- [ ] Before matrix and CSS hash were validated before globals changes.
- [ ] Populated, dense, empty, loading, error, validation-error, and overlay states have paired evidence.
- [ ] Checker self-tests distinguish contract diagnostics from harness failures.
- [ ] Ownership implementation owners are restricted to 109-113.
- [ ] Final structured evidence rejects pending/failed/blocked/malformed rows.
- [ ] Protected path HEAD/index/worktree/status snapshot verifies unchanged.
- [ ] Full tests, lint, build, Playwright, ownership, contract, evidence, and diff gates pass.

**Approval:** pending
