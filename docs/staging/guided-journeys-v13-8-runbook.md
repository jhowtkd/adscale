# v13.8 Staging Evidence Runbook — Adaptive Guided Journeys

Operators use this runbook to record **real** staging evidence for milestone **v13.8 Conversa Guiada Adaptativa**.

## Scope

Exercise both journeys with authenticated staging credentials:

1. **existing_creative** — select/upload, collaborative diagnosis correction, approve, action confirmation, resume after reload
2. **from_zero** — progressive briefing (one question at a time), editable brief review, references, plan confirmation

## Preconditions

- Staging deployment with migration `0062_assistant_guided_flow_adaptive_state` applied
- Workspace with client profile, credits, and library assets
- Operator account with assistant access

## Walk checklist

- [ ] Start `Já tenho peça`, upload or select creative, correct an uncertain field, approve diagnosis
- [ ] Reload thread — resume at same step with answers intact
- [ ] Open second tab, trigger revision conflict, recover via refetch
- [ ] Start `Produzir do zero`, answer progressively, confirm brief review, select ≥3 references
- [ ] Confirm action card only after reviewed snapshot; verify no duplicate campaign writes on retry

## Evidence capture

Record outcomes in `.planning/phases/200-real-staging-evidence-and-release-gate/200-EVIDENCE.json` under `stagingEvidence` with:

- `status`: `recorded` when complete, `pending` otherwise
- `paths`: array with `existing_creative` and `from_zero` entries
- Safe notes only — no prompts, signed URLs, or provider reasoning

## Inherited debt (must remain explicit in verdict)

- Operational guided starts may remain `insufficient_sample` until ≥5 real starts
- Live Inngest action lifecycle verification inherited from v13.5/v13.7
