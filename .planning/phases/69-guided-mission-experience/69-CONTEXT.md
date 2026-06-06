# Phase 69: Guided Mission Experience - Context

**Gathered:** 2026-06-06
**Status:** Implemented

<domain>
## Phase Boundary

Phase 69 turns the Phase 68 progression foundation into a guided mission path that teaches the core ADScale creative workflow by doing. Users see a resumable mission list with learning copy, deep-link CTAs, and completion inferred from real product events.

This phase does not build insight prompts (Phase 70), credit upgrade prompts (Phase 71), or manual checkboxes.

</domain>

<decisions>
## Implementation Decisions

### Mission model
- Extend the progression system with a separate missions module rather than duplicating evidence logic.
- 11 missions in recommended order: setup → upload → readiness → guided briefing → strategy recipe → preview → batch → review → regeneration → export → share.
- Mission completion inferred from existing DB records (campaigns, assets, derivations, creative plans, exports, share links) reusing Phase 68 evidence patterns where 1:1.
- Mission status: `completed`, `active`, `blocked`, `upcoming` — first incomplete mission with met prerequisites is active.

### API and UI
- New `GET /api/workspace/missions` endpoint returns mission list, active mission, and progress percent.
- Dashboard `MissionPathCard` below `AdsScientistProgressCard` — collapsible list, compact by default.
- Learning copy in i18n (`dashboard.missions.items.*`) for EN and pt-BR.
- Deep links reuse Phase 68 href pattern (`/campaigns/{id}?tab=...`).

### Evidence inference (mission-specific)
- **guided_briefing:** campaign with objective + (audience OR tone OR offer)
- **strategy_recipe:** creative_plans row OR campaign targetFormats/ctaVariants configured
- **preview:** derivation with isPreview=true and status completed/approved
- **batch:** non-preview derivation created
- **review:** derivation approved or rejected
- **regeneration:** derivation with parentId set

### Tone
- Playful "cientista pop" lab metaphor consistent with Phase 68.
- Practical ad-creation language explaining why each step matters.

</decisions>

<code_context>
## Integration Points

- `app/src/server/progression/missions/` — definitions, evidence, status, service
- `app/src/app/api/workspace/missions/route.ts`
- `app/src/lib/hooks/use-missions.ts`
- `app/src/components/dashboard/MissionPathCard.tsx`
- `app/messages/en.json`, `app/messages/pt-BR.json`

</code_context>

---

*Phase: 69-guided-mission-experience*
