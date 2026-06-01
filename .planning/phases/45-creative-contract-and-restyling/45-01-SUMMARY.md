---
phase: 45-creative-contract-and-restyling
plan: "01"
subsystem: ai-contract
tags: [creative-contract, cta-semantics, schema, inngest, restyling]
dependency_graph:
  requires: []
  provides:
    - CreativeContract interface
    - CtaSemantics union type
    - resolveCtaSemantics helper
    - styleAssetId DB column on derivations
    - styleAssetId in derivation.generate Inngest event
  affects:
    - app/src/server/ai/ (downstream plans consume CreativeContract)
    - app/src/server/jobs/derivation.ts (reads styleAssetId from event in 45-04)
tech_stack:
  added: []
  patterns:
    - discriminated-union for semantic variants
    - pure type module (no runtime deps)
    - drizzle nullable text column
key_files:
  created:
    - app/src/server/ai/creative-contract.ts
    - app/drizzle/0023_amusing_supreme_intelligence.sql
    - app/tests/unit/creative-contract.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/app/api/campaigns/[id]/derivations/route.ts
    - app/drizzle/meta/_journal.json
    - app/drizzle/meta/0023_snapshot.json
decisions:
  - "creative-contract.ts lives in app/src/server/ai/ alongside prompt-builder.ts and creative-score.ts"
  - "resolveCtaSemantics always returns inherited for empty/null/undefined — absent kind reserved for future opt-out"
  - "styleAssetId stored as nullable text column on derivations (not event-only) for Phase 47 UI inspectability"
  - "styleAssetId forwarded as null for non-restyling modes to keep event shape consistent"
metrics:
  duration_mins: ~15
  completed_date: "2026-06-01"
  tasks_completed: 2
  files_changed: 7
---

# Phase 45 Plan 01: Creative Contract Foundation Summary

**One-liner:** Typed `CreativeContract` interface and `resolveCtaSemantics` resolver with TDD coverage, plus `styleAssetId` DB column and Inngest event payload thread-through for restyling jobs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create creative-contract.ts (TDD) | `7c16a1b`, `c3c0e88` | creative-contract.ts, creative-contract.test.ts |
| 2 | styleAssetId schema + migration + route | `2edcbbb` | schema.ts, route.ts, 0023_*.sql, meta/ |

## Interface Snapshot

### CtaSemantics

```ts
export type CtaSemantics =
  | { kind: "explicit"; text: string }
  | { kind: "inherited" }
  | { kind: "absent" };
```

### CreativeContract

```ts
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
```

### resolveCtaSemantics

```ts
export function resolveCtaSemantics(
  ctaText: string | null | undefined,
  _mode: CreativeContract["generationMode"]
): CtaSemantics
```

Resolution rules:
- Non-empty string → `{ kind: "explicit", text: ctaText }`
- null, undefined, or empty string (any mode) → `{ kind: "inherited" }`
- `absent` is never returned (reserved for future explicit opt-out)

## Migration File

**File:** `app/drizzle/0023_amusing_supreme_intelligence.sql`

```sql
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "style_asset_id" text;--> statement-breakpoint
CREATE INDEX "derivations_workspace_created_at_idx" ON "adscale_app"."derivations" USING btree ("workspace_id","created_at");
```

## Inngest Event Change

`derivation.generate` event data now includes:
```ts
styleAssetId: generationMode === "restyling" ? (requestedStyleAssetId ?? null) : null,
```

Extracted from request body as `body.styleAssetId` (nullable string, validated as non-empty string only).

## Threat Mitigations Applied

- **T-45-01 (Tampering):** `styleAssetId` accepted as nullable string only; validated with `typeof === "string" && length > 0`; no eval or path join; job resolves asset from DB within workspace scope.
- **T-45-02 (Info disclosure):** Internal Inngest event; no client exposure.

## Test Coverage

8 tests in `app/tests/unit/creative-contract.test.ts`:
- 3 × null-for-each-mode → inherited
- 1 × non-empty string → explicit with text
- 1 × empty string → inherited
- 1 × undefined → inherited
- 2 × CreativeContract shape validation

Full suite: **552 tests pass, 1 skipped** — no regressions.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The contract types are complete; `creative-contract.ts` exports are production-ready. `styleAssetId` is wired through the DB column and event payload. Downstream consumption (job reading `styleAssetId` from event) is the work of Plan 45-04.

## Self-Check: PASSED

- [x] `app/src/server/ai/creative-contract.ts` exists
- [x] `app/drizzle/0023_amusing_supreme_intelligence.sql` exists
- [x] `app/tests/unit/creative-contract.test.ts` exists (8 tests pass)
- [x] `schema.ts` contains `styleAssetId`
- [x] `route.ts` sends `styleAssetId` in Inngest event
- [x] Commits: `7c16a1b`, `c3c0e88`, `2edcbbb` exist
