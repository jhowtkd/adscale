# Phase 40: Roteamento e contratos — Research

**Researched:** 2026-06-01
**Phase requirement IDs:** DRV-07, DRV-08

## Summary

Phase 40 is a **frontend routing refactor** in the campaign workspace. No API or schema changes. The fix is to extract derivation flow state from `campaigns/[id]/page.tsx`, stop calling `configureAndGenerate` from the Derivar chooser, and open intent-specific shell modals before Phases 41–42 add real config fields.

## Current Implementation

| File | Role | Problem |
|------|------|---------|
| `DerivarModal.tsx` | 2×2 chooser | Hardcoded PT strings; calls `onSelect(mode, config)` |
| `campaigns/[id]/page.tsx` | `handleDerivarSelect` | Immediately calls `configureAndGenerate` with hardcoded CTAs/formats |
| `use-campaign-workspace.ts` | `configureAndGenerate` | Correct PATCH + queue — keep as sole generate entry |
| `EstilizarModal.tsx` | Restyling flow | Reference for Dialog + footer pattern |

## Recommended Architecture

```
ActionCards / DerivationGrid
        ↓ openChooser()
   DerivarModal (chooser)
        ↓ selectIntent(intent)
   useDerivationFlow state
        ↓
   ArtVariationConfigModal  (manual_art | auto_art)
   OR
   FormatAdaptationConfigModal (single_format | batch_format)
        ↓ confirmConfig() — Phase 41/42 only
   configureAndGenerate()
```

### Hook contract (`useDerivationFlow`)

```typescript
export type DerivationIntent =
  | "manual_art"
  | "auto_art"
  | "single_format"
  | "batch_format";

export type DerivationFlowStep = "chooser" | DerivationIntent;

// Returns:
// - activeStep: DerivationFlowStep | null
// - selectedIntent: DerivationIntent | null
// - isChooserOpen, isArtConfigOpen, isFormatConfigOpen (derived)
// - openChooser(), selectIntent(i), backToChooser(), closeFlow()
// - confirmConfig() — stub in Phase 40 (no-op / not exposed in UI)
```

### DerivarModal API change (preferred)

Change `onSelect` to pass `DerivationIntent` directly instead of `(mode, config)` — reduces adapter logic in page and prevents future mismapping.

## i18n

- Add `workspace.derivar` namespace in `pt-BR.json` and `en.json`
- Keys: `title`, `description`, four option `title`/`description` pairs, shell modal titles for each intent
- Update descriptions to say user will **configure** on the next step
- Fix typo: `variir` → `variar`

Existing related keys under `generation.modes.*` can inform tone but should not be reused directly (different UX context).

## Validation Architecture

| Behavior | Requirement | Test type | Command |
|----------|-------------|-----------|---------|
| `selectIntent` never calls `configureAndGenerate` | DRV-07 | unit | `npm test -- use-derivation-flow` |
| Each intent opens correct derived modal flag | DRV-07 | unit | same |
| `backToChooser` reopens chooser | DRV-07 | unit | same |
| `closeFlow` resets all steps | DRV-07 | unit | same |
| DerivarModal uses i18n keys | DRV-08 | unit | `npm test -- DerivarModal` |
| EN + PT keys present for all chooser strings | DRV-08 | manual grep | `grep workspace.derivar messages/*.json` |
| Chooser click does not PATCH campaign | DRV-07 | integration smoke | mock workspace hook in page test |
| Estilizar still opens independently | DRV-10 overlap | manual UAT | separate from Phase 40 plan scope |

**Framework:** Vitest (existing in `app/`)
**Quick run:** `cd app && npm test -- --run src/lib/hooks/use-derivation-flow.test.ts`
**Full suite:** `cd app && npm test -- --run`

## Risks

| Risk | Mitigation |
|------|------------|
| Page.tsx still calls generate via old handler | Delete/replace `handleDerivarSelect` body entirely |
| Both chooser + config modals open at once | Derive open flags exclusively from `activeStep` |
| Regression on Estilizar | Do not touch `showEstilizarModal` state |

## Out of Scope (Phase 40)

- Creativity profile UI, CTA inputs, format pickers (Phase 41–42)
- Backend validation changes
- Credit preview

---
*Phase: 40-roteamento-e-contratos*
