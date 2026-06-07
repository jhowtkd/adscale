# Phase 73: Mission Resume UX - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 73 makes mission and progression CTAs resume into the intended campaign workflow surface. Users who click "Continuar missão" or progression next-action links should land on the correct pilot/actions context with scroll anchors, not only the generic campaign detail page.

This phase does not add new missions, change progression mechanics, apply migrations, or run full beta UAT. Those belong to Phase 74 or future milestones.

</domain>

<decisions>
## Implementation Decisions

### Route Contract
- Use existing `?tab=` query param on `/campaigns/[id]` as the resume contract.
- Valid tab keys: `assets`, `readiness`, `briefing`, `recipe`, `generate`, `review`, `export`, `share`.
- Optional `mode=preview` for preview mission deep links.

### Deep Link Behavior
- Campaign workspace parses `tab` and `mode` on load after campaign data is ready.
- Apply deep link once per unique tab/mode pair (ref guard prevents re-trigger loops).
- Default workspace behavior unchanged when no `tab` param is present.

### CTA Sources
- `buildMissionHref` and `buildEvidenceHref` generate resume URLs for mission cards and progression next actions.
- Mission anchor IDs (`mission-assets`, `mission-readiness`, etc.) exist in campaign workspace for scroll targets.

### Verification
- Unit tests cover href generation for representative missions (upload/assets, export, share).
- Unit tests cover `applyCampaignDeepLink` routing for readiness, generate/preview, review/export/share.
- Build and focused progression suite must pass.

</decisions>

<code_context>
## Existing Code Insights

### Implemented in commit 0f5481de
- `app/src/lib/campaign/deep-link-tab.ts` — parse, apply, scroll helpers
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — consumes `?tab=` on load
- `app/src/server/progression/missions/hrefs.ts` — mission CTA href builder
- `app/src/server/progression/evidence.ts` — progression CTA href builder
- Mission anchor IDs in campaign workspace and pilot panels

### Gap Closed in Phase 73 Verification
- Added `hrefs.test.ts` for mission/progression href contract
- Expanded `deep-link-tab.test.ts` for review/export/share routing

</code_context>

---

*Phase: 73-mission-resume-ux*
*Context gathered: 2026-06-07*
