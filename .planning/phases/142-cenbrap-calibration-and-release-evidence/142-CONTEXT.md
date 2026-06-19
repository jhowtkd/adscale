---
phase: 142
slug: cenbrap-calibration-and-release-evidence
status: planning
created: 2026-06-19
depends_on:
  - 138
  - 139
  - 140
  - 141
requirements:
  - CALIB-01
  - CALIB-02
  - CALIB-03
  - CALIB-04
---

# Phase 142 - Context

## Goal

Provar o novo olhar em campanhas reais Cenbrap, medir concordancia com Jhonatan e fechar com evidencia honesta, sem transformar amostra pequena em claim de qualidade.

## Why Now

Phases 138-141 changed the product's judgment layer:

- Phase 138 created the global `Olhar ADScale` constitution and first Cenbrap voice overlay.
- Phase 139 added independent `olharVerdict` and `exportStatus` contracts plus approval blocking.
- Phase 140 rewrote preflight, QA, score and generation prompts around art direction.
- Phase 141 made the workspace review surface Olhar-first and added auditable override UX.

The remaining milestone risk is not implementation wiring; it is whether the new eye actually aligns with Jhonatan's judgment on real Cenbrap outputs. Phase 142 must therefore turn the system into an evidence exercise.

## Current Truth

Observed on 2026-06-19:

- `141-VERIFICATION.md` reports score `4/4` with `human_needed` for visual hierarchy and live override confirmation.
- `output_decision_events` is the canonical human-decision evidence table.
- `output_decision_events.contextSnapshot` can store `reason`, `olharVerdict`, `exportStatus` and `overrideApproved`.
- Derivations persist `olharVerdict` and `exportStatus` as nullable jsonb.
- Campaigns expose `client`, `clientProfileId`, campaign fields and derivation counts.
- v12.5/v12.6 already established sampling honesty: small/empty samples must report `insufficient_sample` or accepted-gap language, not quality claims.

## Phase Boundary

This phase must deliver:

1. A repeatable Cenbrap calibration run over at least two real campaigns when data exists.
2. Contact-sheet artifacts for operator side-by-side review.
3. A way to capture Jhonatan's `entra`, `quase`, `nao entra` decisions against system verdicts.
4. Evidence metrics for agreement, mismatch reasons, approved-invalid prevention, `sem_opiniao` detection and export-block separation.
5. A milestone release audit that keeps factual fidelity, art-direction quality and sample sufficiency separate.

## Non-Goals

- Do not fine-tune models.
- Do not claim commercial lift or media performance.
- Do not build a full taste-profile product.
- Do not turn Cenbrap voice into a multi-client voice-management UI.
- Do not close v12.7 with a quality-improvement claim if the evidence is only a tiny sample.

## Evidence Principle

Green tests can prove the pipeline works. They cannot prove the eye is good.

Phase 142 should be able to close the milestone with one of two honest outcomes:

- `passed`: technical gate green and sufficient real Cenbrap decisions support the claims.
- `shipped_with_accepted_gap` / `tech_debt`: technical gate green, but real sample is too small; evidence reports `insufficient_sample` and withholds quality claims.

## Human Gate

Jhonatan's review is part of the deliverable. The system verdict is not the authority in Phase 142; it is the thing being calibrated against the authority.
