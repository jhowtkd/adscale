---
phase: "45"
plan: "01"
subsystem: ai-pipeline
tags: [creative-contract, types, schema, inngest]
one_liner: "CreativeContract + CtaSemantics types with resolveCtaSemantics resolver; styleAssetId added to derivations schema and Inngest event"
dependency_graph:
  requires: []
  provides:
    - CreativeContract interface (app/src/server/ai/creative-contract.ts)
    - CtaSemantics discriminated union
    - resolveCtaSemantics helper
    - styleAssetId column on derivations table (schema + migration 0023)
    - styleAssetId forwarded through Inngest derivation.generate event
  affects:
    - app/src/server/jobs/derivation.ts (consumer in 45-04)
    - app/src/server/ai/prompt-builder.ts (consumer in 45-02)
    - app/src/server/ai/creative-score.ts (consumer in 45-02)
    - app/src/server/ai/creative-qa.ts (consumer in 45-03)
tech_stack:
  added: []
  patterns:
    - Discriminated union types for semantic safety
    - Pure type module (no external imports)
key_files:
  created:
    - app/src/server/ai/creative-contract.ts
    - app/src/server/ai/creative-contract.test.ts
    - app/tests/unit/creative-contract.test.ts
    - app/drizzle/0023_amusing_supreme_intelligence.sql
  modified:
    - app/src/server/db/schema.ts
    - app/src/app/api/campaigns/[id]/derivations/route.ts
decisions:
  - "creative-contract.ts placed in app/src/server/ai/ alongside other AI modules (Claude's discretion)"
  - "resolveCtaSemantics: absent kind NOT returned in v11.1 (reserved for future explicit opt-out)"
  - "styleAssetId in Inngest event: null for non-restyling modes, body-supplied value for restyling"
  - "No FK constraint on styleAssetId — stores asset ID string, not FK to campaign_assets"
metrics:
  duration_seconds: 183
  tasks_completed: 2
  files_changed: 6
  completed_date: "2026-06-01"
---

# Phase 45 Plan 01: Creative Contract Foundation Types Summary

CreativeContract + CtaSemantics types with resolveCtaSemantics resolver; styleAssetId added to derivations schema and Inngest event.

## What Was Built

### Task 1: creative-contract.ts (TDD)

Created `app/src/server/ai/creative-contract.ts` — a pure type module with:

```typescript
export type CtaSemantics =
  | { kind: "explicit"; text: string }
  | { kind: "inherited" }
  | { kind: "absent" };

export interface CreativeContract {
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  targetFormat: string;
  ctaSemantics: CtaSemantics;
  baseAssetId: string | null;
  styleAssetId: string | null;
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
}

export function resolveCtaSemantics(
  ctaText: string | null | undefined,
  _mode: CreativeContract["generationMode"]
): CtaSemantics {
  if (ctaText && ctaText.trim().length > 0) {
    return { kind: "explicit", text: ctaText };
  }
  return { kind: "inherited" };
}
```

Tests written in TDD flow: `app/tests/unit/creative-contract.test.ts` (6 resolver tests + 2 type shape tests), plus `app/src/server/ai/creative-contract.test.ts` (6 resolver tests).

### Task 2: Schema + Migration + Route

- `app/src/server/db/schema.ts`: Added `styleAssetId: text("style_asset_id")` after `ctaText` in derivations table
- Migration: `app/drizzle/0023_amusing_supreme_intelligence.sql` — `ALTER TABLE "adscale_app"."derivations" ADD COLUMN "style_asset_id" text`
- `app/src/app/api/campaigns/[id]/derivations/route.ts`: Extracts `styleAssetId` from request body, forwards in `inngest.send` as `styleAssetId: generationMode === "restyling" ? (requestedStyleAssetId ?? null) : null`

## Deviations from Plan

None — plan executed exactly as written. The implementation was pre-created in a prior session but not committed; tests were confirmed passing and TypeScript compiled cleanly before committing.

## Commits

- `7c16a1b` test(45-01): add failing tests for CreativeContract types and resolveCtaSemantics
- `c3c0e88` feat(45-01): create creative-contract.ts with CreativeContract, CtaSemantics, resolveCtaSemantics
- `2edcbbb` feat(45-01): add styleAssetId to derivations schema + migration + route event payload
- `b7d132a` feat(45-01): add CreativeContract types, CtaSemantics, resolveCtaSemantics (planning docs + additional test)

## Self-Check: PASSED

- ✅ `app/src/server/ai/creative-contract.ts` exists and exports `CreativeContract`, `CtaSemantics`, `resolveCtaSemantics`
- ✅ `app/src/server/db/schema.ts` contains `styleAssetId` in derivations table
- ✅ Migration `drizzle/0023_amusing_supreme_intelligence.sql` exists with ALTER TABLE ADD COLUMN
- ✅ Route.ts sends `styleAssetId` in Inngest event for restyling derivations
- ✅ All commits exist in git log
