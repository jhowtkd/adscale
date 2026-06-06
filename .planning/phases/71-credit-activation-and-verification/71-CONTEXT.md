# Phase 71: Credit Activation and Verification - Context

**Gathered:** 2026-06-06
**Status:** Implemented

<domain>
## Phase Boundary

Phase 71 connects mission progression to credit semantics: expected cost before generation, balance in mission context, gated upgrade prompts, owner signals for healthy vs frustrated spend, and QA/UAT evidence for the full v11.7 loop.

Depends on Phases 68-70 (progression, missions, mission insights).

</domain>

<decisions>
## Implementation Decisions

### Credit estimates (CRED-01)
- Preview and regeneration: single `image_derivation` / `regeneration` cost (5 credits = 1 ad).
- Batch: minimum estimate of 3 variants (`from` label) aligned with typical recipe output.
- Estimates attach to mission API response on `mission.credit` for credit-consuming steps only.

### Balance context (CRED-02)
- `creditContext` on `GET /api/workspace/missions` with remaining credits/ads and access kind.
- `MissionCreditBanner` on active credit-consuming mission in `MissionPathCard`.

### Upgrade gating (CRED-03)
- `shouldShowUpgradePrompt` requires value moment (readiness+ completed) before any billing CTA.
- Prompt when: insufficient credits for active step, exhausted balance after preview, or post-preview low balance.

### Owner signals (CRED-04)
- `GET /api/feedback/mission-credit-signals` (platform owner) classifies mission insights as healthy vs frustration.
- Panel on `/feedback` when viewing mission category.

### QA
- Unit tests: mission credits, upgrade gating, signal classification, MissionPathCard credit UI.
- UAT checklist: `71-UAT-EVIDENCE.md` for Jovem Aprendiz → Analista Criativo path.

</decisions>

<code_context>
## Integration Points

- `app/src/server/progression/missions/credits.ts` — estimates
- `app/src/lib/progression/credit-activation.ts` — upgrade gating
- `app/src/server/progression/missions/service.ts` — creditContext enrichment
- `app/src/components/dashboard/MissionCreditBanner.tsx`
- `app/src/server/feedback/mission-credit-signals.ts`
- `app/messages/en.json`, `pt-BR.json` — `dashboard.missions.credits`

</code_context>

---

*Phase: 71-credit-activation-and-verification*
