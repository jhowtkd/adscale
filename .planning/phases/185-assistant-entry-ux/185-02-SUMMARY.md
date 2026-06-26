# Phase 185-02 Summary — Freeform Classification and Resume Banner

**Status:** complete
**Requirements:** ENTRY-02, ENTRY-03

## Delivered

- `classifyGuidedPath` in `intent-classifier.ts` with heuristic keywords and Portuguese clarify question
- Orchestrator upserts guided-flow on classified freeform first turn; short-circuits on clarify
- `GuidedFlowResumeBanner` in thread view with path, step, missing count and next-action hint
- `AssistantChatCore` renders banner when `guidedFlow` present on thread GET

## Verification

- `npm test -- intent-classifier.test.ts` — pass
- `npm test -- GuidedFlowResumeBanner.test.tsx` — pass
