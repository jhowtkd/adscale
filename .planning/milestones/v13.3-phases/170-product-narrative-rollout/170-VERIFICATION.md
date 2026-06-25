---
phase: 170
slug: product-narrative-rollout
status: complete
verified: 2026-06-25
requirements: [BRAND-01, BRAND-02, BRAND-03, BRAND-04]
---

# Phase 170 — Product Narrative Rollout Verification

**Verified:** 2026-06-25  
**Copy guard:** 26 tests passing  
**Next phase:** 171 — Persistent Product Trust Baseline

## Checklist criteria (1–7)

Reference: [`marketing/brand/in-app-copy-checklist.md`](../../../marketing/brand/in-app-copy-checklist.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | **Curator > operator** at workflow decision points | ✅ Pass | Onboarding (Plan 02), empty states (Plan 02), campaign wizard intros/CTAs (Plan 03), generation modes (Plan 03), review approve/reject guidance (Plan 03) |
| 2 | No overclaim of full automation | ✅ Pass | Copy guard forbidden patterns green; generation/derivation framed as AI-assisted with human approval |
| 3 | No performance lift / ROAS / speed claims | ✅ Pass | No performance phrases in narrative namespaces; forbidden-pattern scan clean |
| 4 | No customer-real / agreement-rate proof implied | ✅ Pass | No claim language in scanned namespaces |
| 5 | No Cenbrap as product proof | ✅ Pass | `cenbrap` forbidden rule — zero violations |
| 6 | No calibration / corpus / Olhar jargon on general surfaces | ✅ Pass | Olhar limited to `review.olhar*` internals (unchanged); general wizard/onboarding/metadata clean |
| 7 | Canonical vocabulary; forbidden list avoided | ✅ Pass | brief/batch/curate/curador vocabulary in workflow keys; forbidden list enforced by Vitest |

## Automated guard

```bash
cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts
```

**Result (2026-06-25):** 26 passed — locale parity, forbidden claims, onboarding curator vocabulary, workflow curator vocabulary (EN + PT-BR).

## Namespaces touched (Phase 170)

| Namespace | Plan | Curator framing |
|-----------|------|-----------------|
| `onboarding.*` | 02 | Welcome → briefing → curation queue arc |
| `dashboard.home`, `common.*`, `derivation.*`, `library.*`, `template.*` | 02 | Empty states: brief → batch → curate |
| `metadata.*` | 03 | Brief → batch → curate product promise |
| `auth.signUpSubtitle` | 03 | Curator seat; AI assists variations |
| `campaign.*` (wizard intros) | 03 | Briefing before batch; curate what ships |
| `steps.*` | 03 | Wizard labels and CTAs reinforce batch + curation |
| `generation.*`, `workspace.derivar.*` | 03 | AI-assisted variation; human approval required |
| `review` (guidance keys only) | 03 | Human approves what ships |
| `settings.workspace` | 03 | Curator workspace placeholder |

## Scope notes

- **`conceituacao.md`** remains reference-only; production marketing copy not applied from it.
- **`review.olhar*`**, **`review.export*`**, **`review.decision*`**, **`review.hardFailureCodes`** unchanged (internal editorial surfaces).
- **Cenbrap** not referenced in general user copy.
- **Owner/corpus strings** and marketing site copy out of scope.

## Requirements closed

| ID | Description | Status |
|----|-------------|--------|
| BRAND-01 | Curator > operator at workflow decision points | ✅ Complete |
| BRAND-02 | Onboarding/empty states without fixture jargon | ✅ Complete |
| BRAND-03 | Consistent language campaign → generation → review → settings | ✅ Complete |
| BRAND-04 | Checklist + automated copy guard | ✅ Complete |

## Manual spot-check (deferred to release QA)

- Dashboard tour natural read in EN/PT — automated vocabulary covered; tone judgment at ship.
- Campaign wizard flow coherence — labels/CTAs aligned; full UX walk recommended before external launch.
