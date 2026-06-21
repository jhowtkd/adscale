# Phase 139 Research: Dual Verdict and Export Validator

**Date:** 2026-06-19
**Status:** complete
**Question:** What do we need to know to plan Phase 139 well?

## Phase Target

Phase 139 must make the system capable of carrying two separate verdicts through server-side contracts:

1. `olharVerdict`: art-direction judgment.
2. `exportStatus`: deterministic export/compliance judgment.

The goal is not prettier language. The goal is preventing impossible states like `approved + invalid`, while leaving room for Phase 140/141 to make the user-facing experience better.

## Current Implementation Findings

### Derivation Persistence

`app/src/server/db/schema.ts` has the `derivations` table with:

- `status`
- `qualityScore`
- `scoreStatus`
- `scoreBreakdown`
- `scoreIssues`
- `qaStatus`
- `qaChecklist`
- `qaIssues`
- `qaSuggestions`
- `qualityVerdict`
- `hardFailures`
- `polishSuggestions`
- `qualityGatedAt`
- `creativeContract`
- `promptProvenance`
- `generationLog`

There is no `olharVerdict` or `exportStatus` field yet.

### Current Gate

`app/src/server/ai/creative-quality-gate.ts` has:

- `CreativeHardFailureCode`
- `CreativeQualityVerdict = "invalid" | "improvable" | "acceptable"`
- `classifyCreativeQualityGate()`
- `assertDerivationApprovable()`

Current approvability blocks if `qualityVerdict === "invalid"` or `hardFailures.length > 0`.

### Current Approval Route

`app/src/app/api/derivations/[id]/review/route.ts`:

- accepts `{ status: "approved" | "rejected" }`
- fetches derivation only before approval
- calls `assertDerivationApprovable()`
- updates `status` to `approved` or `rejected`
- records analytics/memory/output-decision evidence

This is the correct insertion point for Phase 139 approval blocking.

### Phase 138 Bridge

`app/src/server/ai/olhar/art-direction-verdict.ts` already maps:

- `generic_template_aesthetic` -> `sem_opiniao`
- `decorative_only_variation` -> `sem_opiniao`
- `missing_dominant_idea` -> `confusa`
- `visual_overload` -> `confusa`

Export/factual failures return null from art-direction mapping.

## Recommended Design

### Files To Add

- `app/src/server/ai/olhar/dual-verdict.ts`
- `app/src/server/ai/olhar/dual-verdict.test.ts`
- `app/src/server/ai/export-validation.ts`
- `app/src/server/ai/export-validation.test.ts`
- `app/src/server/ai/export-validation-cta.test.ts`
- Drizzle migration adding nullable `olhar_verdict` and `export_status` jsonb columns.

### Files To Modify

- `app/src/server/db/schema.ts`
- `app/src/server/repositories/derivation.ts`
- `app/src/server/ai/creative-quality-gate.ts`
- `app/src/app/api/derivations/[id]/review/route.ts`
- `app/src/app/api/derivations/[id]/review/route.test.ts`

## Contract Shape

Recommended `OlharVerdictPayload`:

```ts
type OlharVerdictValue = "pronta" | "quase" | "sem_opiniao" | "confusa";

interface OlharVerdictPayload {
  value: OlharVerdictValue;
  axes: {
    figura: 0 | 1 | 2 | 3;
    gestalt: 0 | 1 | 2 | 3;
    voz: 0 | 1 | 2 | 3;
    convite: 0 | 1 | 2 | 3;
  };
  whatWorks: string[];
  whatBlocks: string[];
  directionNote: string;
  source: "quality_gate" | "manual" | "migration_fallback";
  evaluatedAt: string;
}
```

Recommended `ExportStatusPayload`:

```ts
type ExportStatusValue = "ok" | "ajuste_menor" | "bloqueado";

interface ExportStatusPayload {
  value: ExportStatusValue;
  issues: ExportValidationIssue[];
  setupIssues: ExportValidationIssue[];
  normalizedCta?: {
    expected: string | null;
    observed: string | null;
  };
  evaluatedAt: string;
}
```

## Validation Architecture

Phase 139 should use focused Vitest suites plus build:

- `cd app && npm test -- src/server/ai/olhar/dual-verdict.test.ts src/server/ai/export-validation.test.ts src/server/ai/export-validation-cta.test.ts`
- `cd app && npm test -- src/server/repositories/derivation.test.ts src/app/api/derivations/[id]/review/route.test.ts`
- `cd app && npm run build`

Nyquist coverage must prove:

| Requirement | Automated Evidence |
|-------------|--------------------|
| VERDICT-01 | dual verdict value derivation tests |
| VERDICT-02 | export status classification tests |
| VERDICT-03 | axis-score validation and serialization tests |
| VERDICT-04 | `assertDerivationApprovable()` blocks unless creative and export verdicts allow approval |
| EXPORT-01 | export validator issue classification tests |
| EXPORT-02 | setup mismatch classified as setup issue |
| EXPORT-03 | review route rejects blocked dual-verdict states |
| EXPORT-04 | CTA normalization unit table |

## Risk Notes

| Risk | Mitigation |
|------|------------|
| Schema migration broadens blast radius | Add nullable jsonb columns; no backfill required in Phase 139 |
| Old rows become unapprovable unexpectedly | Keep legacy fallback: if dual verdict absent, existing hard-failure gate remains source of truth |
| Export validator becomes another checklist masquerading as taste | Keep it deterministic and explicitly separate from art-direction verdict |
| Approval route blocks without override UX | In Phase 139, block by default; Phase 141 implements audited override path |

## Planning Recommendation

Use two plans:

1. `139-01`: dual-verdict types, persistence compatibility and approvability semantics.
2. `139-02`: deterministic export validator, CTA normalization and review-route blocking.

---

*Research complete: 2026-06-19*
