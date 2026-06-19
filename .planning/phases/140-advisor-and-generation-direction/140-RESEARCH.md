# Phase 140 Research: Advisor and Generation Direction

**Date:** 2026-06-19
**Status:** complete
**Question:** What do we need to know to plan Phase 140 well?

## Current State

### Preflight

`app/src/server/ai/preflight-analysis.ts` still uses a conventional preflight score schema:

- `overallScore`
- `technicalQuality`
- `textLegibility`
- `visualHierarchy`
- `ctaProminence`
- `composition`
- `brandConsistency`
- `platformReadiness`

The prompt says "expert advertising creative director and performance marketer", but the returned structure is still score/checklist-driven. Phase 140 should add a new art-direction reading layer without breaking existing consumers.

### QA

`app/src/server/ai/creative-qa.ts` builds final-output QA around checklist keys:

- `legibility`
- `ctaOffer`
- `informationPreservation`
- `briefMatch`
- `formatFit`
- `creativeRisk`
- optional `styleFidelity`

This is useful for export/gate reliability, but not enough as the primary creative judgment. Phase 140 should introduce a `Passagem Olhar` prompt section and derive/fill `olharVerdict` from QA/hard failures.

### Score

`app/src/server/ai/creative-score.ts` still asks for numeric `qualityScore` and score breakdown as the core output. That must remain for existing analytics, but Phase 140 should demote it:

- score remains stored
- `olharVerdict` and direction note become the primary server-side signal
- regeneration suggestions become direction notes tied to figure/gestalt/voice/invite

### Generation Prompt

`app/src/server/ai/prompt-builder.ts` already includes:

- `buildOlharAdscaleSection()`
- `VISUAL_HIERARCHY_CONTRACT`
- canonical creative contract
- per-mode rules
- creative diagnosis
- preflight analysis section

It does not yet include:

- client voice prompt section from `buildClientVoicePromptSection()`
- explicit generation direction paragraph summarizing sacred facts, allowed variation and anti-patterns
- an approved-gate for Cenbrap voice injection

### Voice Gate

`138-VOICE-REVIEW.md` is still `status: pending_review`. Phase 140 must not pretend this has been approved. It can add the resolver and tests, but must either:

- keep injection disabled until status is approved; or
- inject only generic global Olhar direction and leave client voice inactive.

Recommended: add code support for voice injection but gate it on explicit approval.

## Recommended Implementation

### Files To Add

- `app/src/server/ai/olhar/base-reading.ts`
- `app/src/server/ai/olhar/base-reading.test.ts`
- `app/src/server/ai/olhar/olhar-qa.ts`
- `app/src/server/ai/olhar/olhar-qa.test.ts`
- `app/src/server/ai/olhar/generation-direction.ts`
- `app/src/server/ai/olhar/generation-direction.test.ts`

### Files To Modify

- `app/src/server/ai/preflight-analysis.ts`
- `app/src/server/ai/preflight-analysis.test.ts` if present, otherwise nearby tests covering preflight/readiness.
- `app/src/server/ai/creative-qa.ts`
- `app/src/server/ai/creative-qa.test.ts`
- `app/src/server/ai/creative-score.ts`
- `app/src/server/ai/creative-score.test.ts`
- `app/src/server/ai/prompt-builder.ts`
- `app/src/server/ai/prompt-builder.test.ts`
- `app/src/lib/hooks/use-derivations.ts`
- `app/src/lib/mock-data.ts`

## Contract Recommendation

### Base Reading

Keep existing `PreflightResult` compatible, but add:

```ts
interface BaseCreativeReading {
  dominantIdea: string;
  gestaltRead: string;
  inviteWeight: "absent" | "weak" | "balanced" | "overpowering";
  thumbnailRead: string;
  brandPresence: "absent" | "weak" | "present" | "dominant";
  risks: string[];
}
```

At most two risks.

### Olhar QA

Build a helper that turns QA/gate evidence into:

- `olharVerdict`
- axes
- `whatWorks`
- `whatBlocks`
- `directionNote`

It should reuse Phase 139 `OlharVerdictPayload` and never collapse export status into art direction.

### Generation Direction

Build a function:

```ts
buildGenerationDirectionSection(input): string[]
```

It should include:

- dominant idea / gestalt to preserve
- sacred facts from canonical creative and export constraints
- allowed variation range
- anti-patterns from Olhar and optionally approved client voice
- explicit second-pass export reminder

## Validation Architecture

Focused checks:

- `cd app && npm test -- src/server/ai/olhar/base-reading.test.ts src/server/ai/olhar/olhar-qa.test.ts`
- `cd app && npm test -- src/server/ai/creative-qa.test.ts src/server/ai/creative-score.test.ts`
- `cd app && npm test -- src/server/ai/olhar/generation-direction.test.ts src/server/ai/prompt-builder.test.ts`

Full check:

- `cd app && npm run build`

Requirement coverage:

| Requirement | Evidence |
|-------------|----------|
| ADVISOR-01 | base-reading schema/prompt tests; risks capped at 2 |
| ADVISOR-02 | QA/score prompt tests assert `Passagem Olhar`, direction note and dual-verdict terms |
| ADVISOR-03 | prompt-builder/generation-direction tests assert sacred facts, allowed variation and anti-patterns |
| ADVISOR-04 | server/API/types expose `olharVerdict` and direction as primary while score remains compatibility-only |

## Risks

| Risk | Mitigation |
|------|------------|
| Prompt changes break factual preservation | Keep Phase 139 export validation and hard rules intact; add regression tests for CTA/facts |
| Voice injection outruns manual approval | Gate Cenbrap voice on `138-VOICE-REVIEW.md` approval or keep inactive |
| Score demotion breaks existing UI | Keep numeric fields in payload; only add primary signal and adjust labels/contract in later UI phase |
| QA becomes vague taste language | Use typed axes and explicit `whatBlocks` notes, not open-ended prose only |

---

*Research complete: 2026-06-19*
