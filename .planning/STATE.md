---
gsd_state_version: 1.0
milestone: v12.8
milestone_name: Operacao Real do Olhar Cenbrap
status: v12.8 shipped with tech_debt — human_needed; agreement claims withheld
last_updated: "2026-06-19T20:50:00.000Z"
last_activity: 2026-06-19 - Completed Phase 146 claims gate and planning sync
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-19)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.8 closed with tech_debt. Live Cenbrap calibration infrastructure, evidence refresh, and honest claims gate are complete. Next operator work: Jhonatan decisions and sample sufficiency before agreement claims.

**Status:** v12.8 shipped with tech_debt — `142-EVIDENCE.json` is `human_needed`; `agreementRate=null`; `additionalNeeded=5`; `synthetic_fixture` caveat active

## Current Position

Phase: 146 - Evidence Refresh and Claims Gate (complete)
Plan: 146-02 complete
Status: claims_gate_human_needed — release checker passes; agreement and quality claims withheld
Last activity: 2026-06-19 - Completed Phase 146 claims gate audit and planning sync

Progress: [██████████] v12.8 — 4/4 phases; 8/8 plans complete.

## Accumulated Context

### v12.8 Direction

- v12.8 shipped operational calibration infrastructure, not agreement proof.
- `v12.8-MILESTONE-AUDIT.md` status `tech_debt` — 16/16 requirements at infrastructure level.
- `146-CLAIMS-GATE.md` is the authoritative claims document; do not overclaim while `human_needed`.
- v12.7 template-only evidence debt is closed; operator decisions and sample sufficiency are carry-forward.

### v12.7 Direction

- ADScale should scale creative criterion, not just generate variations or enforce export compliance.
- Creative judgment must happen in two passes: `Olhar` (figure, gestalt, voice, invite) and `Exportacao` (brand, CTA, claims, format, required text, resolution).
- Production campaign audits exposed the core failure: outputs can be invalid, approved, generic or UI-like while the existing advisor still speaks in CTA/button/module/checklist language.
- The first client voice is Cenbrap. Voice is an overlay on the global Olhar ADScale constitution, not a full multi-tenant voice management product.
- v12.7 kept v12.5/v12.6 evidence honesty: no quality claim from empty corpus, insufficient sample or automated green alone.

### Completed v12.7

- Phase 138: Olhar Constitution and Cenbrap Voice.
- Phase 139: Dual Verdict and Export Validator.
- Phase 140: Advisor and Generation Direction.
- Phase 141: Review Surface and Override UX.
- Phase 142: Cenbrap Calibration and Release Evidence infrastructure.
- Audit: `.planning/milestones/v12.7-MILESTONE-AUDIT.md` status `tech_debt`.

### Completed v12.8

- Phase 143: Live Cenbrap Calibration Run.
- Phase 144: Cenbrap Corpus Seeding and Calibration Rerun.
- Phase 145: Jhonatan Decision Capture and Mismatch Triage.
- Phase 146: Evidence Refresh and Claims Gate.
- Audit: `.planning/milestones/v12.8-MILESTONE-AUDIT.md` status `tech_debt`.
- Claims gate: `.planning/phases/146-evidence-refresh-and-claims-gate/146-CLAIMS-GATE.md`.

### v12.6 / v12.5 Evidence Honesty

- v12.6 closed with technical regression green and operational evidence `insufficient_sample`.
- v12.5 quality evidence refresh stayed truthful even when scripts passed but `evaluatedItemCount=0`.
- v12.8 preserved the same distinction: technical green is not operator agreement.

## Decisions

- [v12.8]: Next milestone is operational calibration, not new creative-generation surface.
- [v12.8]: Live Cenbrap calibration and Jhonatan decisions are required before agreement claims.
- [v12.8]: Missing dual verdict rows are evidence gaps, not disagreement.
- [v12.8]: Sample guidance controls claims; no agreement rate claim while additional samples are required.
- [Phase 146]: v12.8 closes as tech_debt — infrastructure complete, operator decisions pending
- [Phase 146]: v12.7 template-only evidence debt closed via live 142-EVIDENCE.json
- [Phase 146]: Claims gate human_needed is correct — checker pass does not authorize agreement claims
- [Phase 146]: synthetic_fixture caveat mandatory in all external calibration wording

## Next Steps

1. Jhonatan fills `145-DECISIONS.json`, runs `record-cenbrap-calibration-decisions.ts --confirm`, reruns calibration and evidence build
2. Re-read `146-CLAIMS-GATE.md` before any agreement or quality claim
3. Plan next milestone — operator loop completion or customer-real corpus when available
