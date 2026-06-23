---
gsd_state_version: 1.0
milestone: v13.2
milestone_name: Calibração Multi-Marca
status: defining_requirements
last_updated: "2026-06-23T00:00:00Z"
last_activity: 2026-06-23 — Milestone v13.2 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-23)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v13.2 Calibração Multi-Marca — generalizar brand-taste para qualquer clientProfile, substituir hardcode Cenbrap, conectar corpus global a regras no prompt.

**Status:** Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-23 — Milestone v13.2 started

Progress: [          ] v13.2 — 0 phases planned

## Accumulated Context

### v13.1 Shipped With Tech Debt

- Global owner corpus queue, candidate capture, cross-workspace previews
- Human evaluation with server-resolved workspace context
- Feedback artifacts and global evidence/release gate (72/72 pass)
- Operational evidence and customer-real claims still blocked by sample/source gates
- Cenbrap decisions (5 pending) and fixture-only corpus carry forward

### v13.0 Shipped Infrastructure (reused)

- `calibration_signals`, `calibration_rules`, brand taste profiles
- Rule extraction, prompt-builder integration, uncertainty queue
- Cenbrap-specific voice resolution and calibration runners still hardcoded

### v13.2 Starting Point

- `resolveClientVoice()` hardcodes Cenbrap detection in `app/src/server/ai/voices/`
- Brand taste profiles exist but lack owner product surface per clientProfile
- Corpus learning loop partially implemented: migrations 0051/0052, admin APIs for ingestion/proposals
- Design approved: `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md`
- User scope: owner-only, prompt rules impact, profile+rules surface (no free voice editor)

## Decisions

- [v13.2]: Replace Cenbrap hardcode with per-clientProfile Olhar/voice configuration
- [v13.2]: Owner-only operation — no workspace admin or end-user calibration UI in this milestone
- [v13.2]: Include corpus global evaluations feeding per-brand profiles and rules
- [v13.2]: Prompt-builder is the primary generation impact surface (not advisor/preflight expansion)
- [v13.2]: No freeform voice editor — inspectable profile + approved rules only

## Next Steps

1. Define scoped requirements (REQ-IDs)
2. Create roadmap starting at Phase 162
3. `/gsd-plan-phase 162` to begin execution
