# Phase 185-01 Summary — Journey Cards and Start Composer

**Status:** complete
**Requirements:** ENTRY-01, ENTRY-04

## Delivered

- `AssistantJourneyCards` with `existing_creative` and `from_zero` cards, i18n, responsive grid
- `AssistantStartComposer` renders cards above composer; `startJourney` creates thread + upserts guided-flow
- `useUpsertGuidedFlow` hook wrapping PATCH guided-flow API with `initialStepForPath`
- i18n keys under `assistant.start.journeys` (pt-BR + en)

## Verification

- `npm test -- AssistantJourneyCards.test.tsx` — pass
- `npm test -- AssistantStartComposer.test.tsx` — pass
