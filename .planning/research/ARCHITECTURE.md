# Research: Architecture for v11.7.1 Stabilization

## Existing Integration Points

- `app/src/lib/feedback/types.ts` and `app/src/server/repositories/feedback.ts` define feedback categories consumed by AI correction brief code and owner triage.
- `app/src/server/mission-insights/sanitize.ts` is the runtime boundary for mission insight payloads.
- `app/src/server/repositories/progression.ts` persists workspace progression snapshots.
- `app/src/server/progression/evidence.ts` and mission href helpers create mission/progression CTA links.
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` and `app/src/lib/hooks/use-campaign-workspace.ts` control campaign workspace state.

## Suggested Build Order

1. Restore build/typecheck and add a regression test around mission feedback category handling if practical.
2. Validate `missionKey` against known mission definitions at the API sanitization boundary.
3. Replace select-then-insert progression snapshot persistence with an atomic conflict-safe upsert.
4. Make campaign workspace consume mission/progression resume targets while preserving default behavior.
5. Apply migration and complete UAT evidence.

## Data Flow Notes

Mission insights and feedback records are durable product-learning data. Invalid mission keys should be rejected before record creation so owner summaries and credit signals remain trustworthy.
