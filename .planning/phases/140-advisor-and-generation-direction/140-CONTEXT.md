# Phase 140: Advisor and Generation Direction - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Source:** v12.7 roadmap, Phase 138/139 artifacts, live AI prompt/QA/score code

<domain>
## Phase Boundary

Phase 140 changes the system language and generation direction from UX/checklist scoring to senior art-direction judgment.

It should make preflight, QA, scoring and generation prompts speak in `Olhar` terms: dominant idea, gestalt, voice, invite, sacred facts, allowed variation and anti-patterns. It must keep Phase 139 export compliance as the second pass.

This phase does not redesign the workspace review UI or override UX. Those belong to Phase 141.

</domain>

<decisions>
## Implementation Decisions

### Leitura do Base

- Replace the current preflight framing with `Leitura do base`.
- The reading should return: dominant idea, gestalt read, invite weight, thumbnail read, brand presence and at most two real pre-generation risks.
- Keep technical metadata, but make it subordinate to creative reading.
- Avoid generic `overallScore` as the primary mental model in prompt language.

### Passagem Olhar

- Post-generation QA and score should produce art-direction verdict notes before numeric scoring.
- QA language should distinguish `Olhar` from `Exportacao`.
- Numeric `qualityScore` remains stored for analytics/backward compatibility, but is not the primary product signal.
- Regeneration suggestions should read like direction, not compliance tickets.

### Generation Direction

- Prompt builder should inject a concise direction paragraph:
  - gestalt to preserve
  - sacred facts
  - allowed variation range
  - explicit anti-patterns
  - client voice overlay only when safe
- Cenbrap voice is currently `pending_review`; Phase 140 may wire the resolver, but active injection should be gated by the review artifact or kept conservative until approval.

</decisions>

<specifics>
## Current Code Facts

- `app/src/server/ai/preflight-analysis.ts` still defines score-like dimensions: `technicalQuality`, `textLegibility`, `visualHierarchy`, `ctaProminence`, `composition`, `brandConsistency`, `platformReadiness`.
- `app/src/server/ai/creative-qa.ts` builds a QA prompt around checklist keys and status values.
- `app/src/server/ai/creative-score.ts` builds a numeric scoring prompt and stores `qualityScore`, `scoreBreakdown`, `scoreIssues`, `regenerationSuggestion`.
- `app/src/server/ai/prompt-builder.ts` already injects `buildOlharAdscaleSection()` but does not yet inject client voice or a compact generation direction paragraph.
- `app/src/server/ai/voices/client-voice.ts` and `voices/cenbrap.ts` exist from Phase 138.
- `app/src/server/ai/olhar/dual-verdict.ts` and `app/src/server/ai/export-validation.ts` exist from Phase 139.
- Frontend derivation types still expose numeric score and legacy quality fields; full UI reprioritization belongs to Phase 141, but server/API payloads can start carrying primary `olharVerdict` and direction notes.

</specifics>

<deferred>
## Deferred Ideas

- Workspace card/modal redesign: Phase 141.
- Override reason and audit trail UX: Phase 141.
- Real Cenbrap campaign calibration: Phase 142.
- Full multi-client voice management UI: future requirement.

</deferred>

---

*Phase: 140-advisor-and-generation-direction*
*Context gathered: 2026-06-19*
