---
phase: 141
slug: review-surface-and-override-ux
status: planning
created: 2026-06-19
---

# Phase 141 - Research

## Code Map

| Area | Files | Current Shape | Phase 141 Implication |
| --- | --- | --- | --- |
| Workspace card | `app/src/components/workspace/DerivationCard.tsx` | Score/status/legacy quality first | Promote `olharVerdict` and `exportStatus`; demote score |
| Review modal | `app/src/components/workspace/DerivationReviewSheet.tsx` | Contract panel then quality panel; approve/reject footer | Rebuild hierarchy around Olhar, decision, collapsed Exportacao |
| Review mutation | `app/src/lib/hooks/use-review.ts` | Sends only `approved` or `rejected` | Add structured decision payload without breaking legacy callers |
| Review API | `app/src/app/api/derivations/[id]/review/route.ts` | Blocks unapprovable normal approval; records memory and output decision event | Accept decision/reason/override fields and persist/audit them |
| Approval package | `app/src/server/ai/client-approval-package.ts` | Eligible when approved root/child has output | Exclude blocking dual verdicts unless explicit override evidence exists |
| Output evidence | `app/src/server/output-learning/output-decision-events.ts`, recorder, repository | Canonical `output_decision_events` source of truth | Extend snapshot/action context rather than inventing another log |
| Tests | `app/src/app/api/derivations/[id]/review/route.test.ts`, `app/src/server/ai/creative-quality-gate.test.ts`, `app/src/server/ai/client-approval-package.test.ts` if present/added, UI tests | Backend already covers dual-verdict blocking | Add UI and package/override coverage |

## Existing Strengths

- `assertDerivationApprovable` already blocks `olharVerdict: sem_opiniao`, `olharVerdict: confusa`, and `exportStatus: bloqueado`.
- The review route returns blocker payloads with normalized `olharVerdict` and `exportStatus`.
- The derivation hook types already carry optional dual verdict fields.
- `output_decision_events` can represent auditable human decisions with actor, campaign, derivation, action and sanitized snapshot.

## Main Product Gap

The system has gained a better judgment model, but the interface still teaches the operator to read the output through score/status first. This is the same failure mode that produced the original discomfort: a UX/compliance lens masquerading as design judgment.

Phase 141 must make the first read visual and editorial:

- Is there a figure?
- Is the gestalt coherent?
- Does the voice feel right?
- Is the invitation alive?
- What works?
- What blocks?
- Does export compliance block the piece?

## Risk Notes

- If override is implemented as a silent bypass of `assertDerivationApprovable`, the product regresses to `approved + invalid`.
- If UI labels change but API still stores only approved/rejected, the system loses learning signal.
- If package eligibility only checks status, future package flows can include weak creative after any manual status mutation.
- If the modal becomes a long diagnostic report, Phase 141 will repeat the checklist problem in a new skin.

## Recommended Implementation Shape

1. Add small presentational helpers for verdict labels, tone, blockers and package eligibility hints.
2. Keep `DerivationCard` compact: one Olhar badge, one Exportacao badge, one short direction/blocking line.
3. Make `DerivationReviewSheet` direction-first:
   - hero image;
   - Olhar verdict and axes;
   - what works / what blocks;
   - decision controls;
   - collapsed Exportacao details;
   - score/debug details secondary.
4. Extend review mutation/API body conservatively:
   - legacy `status` remains accepted;
   - new `decision` maps to status/action;
   - `directionReason` required for regenerate/reject;
   - `overrideReason` required for approving a blocked creative.
5. Record override context in `output_decision_events.contextSnapshot.reason` and a distinct source/idempotency key.
6. Package builders must check the dual verdict directly, not trust `status` alone.

## Verification Strategy

- UI component tests prove the first visible language is Olhar/Exportacao and score is secondary.
- Hook/API tests prove decision reason and override reason validation.
- Package tests prove blocked dual verdicts do not enter package by default.
- Route tests prove override logs evidence and does not erase the weak verdict.
