# Phase 62 Verification: Guided Briefing Cockpit

**Verified:** 2026-06-05

## Success Criteria (ROADMAP)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | User starts from weak/empty brief and sees one question at a time | PASS | `GuidedBriefingPanel` + `isBriefWeak` gate in `campaigns/[id]/page.tsx` |
| 2 | User can answer product/offer, audience, promise, objections, CTA, platforms, constraints | PASS | `GUIDED_BRIEFING_STEP_ORDER` in `guided-briefing.ts` |
| 3 | User can accept, edit, or skip each suggestion | PASS | Panel actions + `useGuidedBriefing` |
| 4 | Answers persist to campaign draft and normal form fields | PASS | `PATCH` campaign + `savePilot` with product/offer/objective/etc. |
| 5 | PT-BR and EN flows preserve generation language behavior | PASS | `guidedBriefing` i18n; suggestions use UI locale only |

## Requirements

- [x] GUIDE-01
- [x] GUIDE-02
- [x] GUIDE-03
- [x] GUIDE-04
- [x] GUIDE-05

## Automated Checks

```
npm test -- src/server/ai/guided-briefing.test.ts src/lib/hooks/use-guided-briefing.test.tsx src/components/workspace/GuidedBriefingPanel.test.tsx
→ 14 passed

npm run lint → 0 errors
npm run build → success
```

## Manual Smoke (recommended)

1. Open draft campaign with empty brief in piloto state.
2. Confirm guided panel shows step 1 (product/offer).
3. Accept suggestion → verify campaign PATCH in network tab.
4. Complete flow → verify pilot save and transition to ações.
5. Switch locale EN/PT-BR → step titles update.

## Known Limitations

- Suggestions are rule-based, not LLM-refreshed per step (deferred in CONTEXT).
- Full form toggle does not auto-return to guided when brief becomes strong.
