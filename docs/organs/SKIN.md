# Skin — Organ Deep Dive

> Character-level map of ADScale export / factual readiness.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Siblings: [`CORTEX.md`](./CORTEX.md) · [`HANDS.md`](./HANDS.md) · [`GAZE.md`](./GAZE.md)  
> Code name: `exportStatus` · Atlas name: **Skin**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Skin is

Skin decides whether a derivation **may leave the body** for ads, delivery packages, and client approval packs. It judges **facts, brand, CTA, format, and setup integrity** — not whether the piece has soul (that is **Gaze**).

| Layer | Path |
|-------|------|
| Core classifier | `app/src/server/ai/export-validation.ts` |
| Payload + blocking helpers | `app/src/server/ai/olhar/dual-verdict.ts` |
| Gate orchestration | `app/src/server/ai/creative-quality-gate.ts` |
| Approval / package policy | `app/src/server/ai/client-approval-package.ts` |
| UI mapping | `app/src/lib/derivation-display.ts` → `getExportDisplay` |
| Review surface | `app/src/components/workspace/DerivationReviewSheet.tsx` |

**Thesis:** a piece can be **pronta** in Gaze and **bloqueado** in Skin (or the reverse). The two truths must not collapse.

---

## 2. When Skin runs

```text
Hands complete image
  → score + creative-qa
  → quality-gate classifies hardFailures
  → validateExportReadiness({ contract, observedCtaText, hardFailures })
  → persist exportStatus ⟂ olharVerdict
  → assertDerivationApprovable (Gaze AND Skin)
```

Skin does **not** call image models. It reclassifies gate evidence into an export payload.

Also consulted (read-only) when packaging / approving / some Cortex quick jobs that require an approvable source.

---

## 3. Status vocabulary

| Value | Meaning | Blocks approve/package? |
|-------|---------|-------------------------|
| `ok` | Clear to leave | No |
| `ajuste_menor` | Warning / soft mismatch (e.g. punctuation-only CTA drift) | No (`isBlockingExportStatus` is only `bloqueado`) |
| `bloqueado` | Hard export / setup blocker | **Yes** |

Payload (`ExportStatusPayload`):

```ts
{
  value: ExportStatusValue;
  issues: ExportValidationIssue[];      // export blockers / warnings
  setupIssues: ExportValidationIssue[]; // campaign setup bucket
  normalizedCta?: { expected, observed };
  evaluatedAt: string;
}
```

Issue severity: `blocker` | `warning`.

---

## 4. Core function — `validateExportReadiness`

File: `export-validation.ts`

**Inputs:** `CreativeContract`, optional `observedCtaText`, `hardFailures[]` (optional width/height reserved).

**Algorithm:**

```text
for each hardFailure:
  if art-direction code → ignore (Gaze territory)
  if campaign_identity_drift → setupIssues (code mapped to setup_mismatch)
  if cta_drift and normalize(expected) === normalize(observed)
    → warning issue (ajuste_menor path)
  if in BLOCKING_EXPORT_CODES → blocker issue
  else → ignore

derive value:
  any blocker (issues or setupIssues) → bloqueado
  else any warning OR (legacy) empty setup path → ajuste_menor
  else → ok

always attach normalizedCta when expected or observed CTA exists
```

### CTA normalization (`normalizeExportCtaText`)

Before drift decisions, Skin collapses:

- NBSP → space  
- curly quotes → straight  
- unicode dashes → `-`  
- whitespace squeeze + trim  
- trailing punctuation strip  
- lowercasing  

So `Shop Now!` vs contract `Shop Now` becomes **warning**, not hard block (see tests).

---

## 5. Failure taxonomy

### Ignored (Gaze only)

`generic_template_aesthetic` · `decorative_only_variation` · `missing_dominant_idea` · `visual_overload`

With only these present → Skin returns **`ok`**.

### Setup bucket

| Gate code | Export issue code | Notes |
|-----------|-------------------|-------|
| `campaign_identity_drift` | `setup_mismatch` | Lands in `setupIssues`; severity blocker → status **`bloqueado`** today |

### Blocking export codes

| Code | Wound |
|------|-------|
| `wrong_brand` | Wrong brand |
| `cta_drift` | CTA ≠ contract (unless normalization-only → warning) |
| `unsupported_offer` | Offer outside brief |
| `unreadable_required_text` | Mandatory text illegible |
| `invalid_format_layout` | Mapped to `invalid_format_ratio` |
| `replaced_source_subject` | Source subject swapped |
| `cropped_critical_content` | Critical crop |
| `invented_factual_entity` | Invented entity |
| `unauthorized_brand_or_ip` | Unauthorized brand/IP |
| `style_reference_contamination` | Style-ref facts leaked into base |

`MINOR_EXPORT_CODES` is currently empty — soft export issues today come mainly from the CTA normalization path.

---

## 6. Shared door with Gaze

`assertDerivationApprovable` (quality-gate):

1. `qualityVerdict === invalid` or hard failures → not approvable  
2. Gaze blocking (`sem_opiniao` / `confusa`) → not approvable  
3. Skin `bloqueado` → not approvable  

`isDerivationBlockedByVerdictPayloads` (dual-verdict): true if either organ blocks.

### Call sites

| Surface | Behavior |
|---------|----------|
| `POST .../derivations/[id]/review` | Approve / `entra` requires door open (409 when blocked) |
| `delivery-package` | Source must be approvable before spawning format children |
| `client-approval-package` | Filters / marks blocked items; override detection if status approved while blocked |
| Cortex quick jobs | Some handlers call `assertDerivationApprovable` on source |

**Override:** `isDerivationApprovalOverride` — derivation `approved` **and** still blocked by verdicts (human force-path). Package eligibility can allow override; default door stays closed.

---

## 7. Face (UI)

| Helper | Job |
|--------|-----|
| `getExportDisplay(exportStatus)` | Label key `exportStatus.*`, blocking flag, tone |
| `DerivationReviewSheet` | Shows export badge + `issues` + `setupIssues` lists separately from Olhar |
| `DerivationCard` | Compact export display |

Copy must keep **Exportação** language distinct from **Passagem Olhar** (product rule from v12.7).

---

## 8. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Hands / gate | hardFailures + contract + observed CTA | after generate |
| Out ⟂ Gaze | dual verdict row | same persist step |
| Out → Human | review / package / delivery | blocking door |
| Out → Nerve | `exportStatus` in decision snapshot | output-learning |
| Out → Taste | `systemExportStatus` on calibration signals | brand-taste |
| Out → Marrow | Cenbrap calibration separates export bloqueado from art entra | olhar-calibration |
| In ← Contract | expected CTA / facts | `ctaSemantics`, identity fields |

---

## 9. Safety invariants

1. **Never classify art failures as export issues.**  
2. **Only `bloqueado` blocks** via `isBlockingExportStatus`.  
3. **CTA typography drift ≠ brand lie** — normalize before hard-blocking.  
4. **Setup ≠ art** — `campaign_identity_drift` goes to `setupIssues` (still bloqueado while severity is blocker).  
5. **Dual door** — Skin alone cannot greenlight a `confusa` Gaze piece.  
6. **Payload validation** — `normalizeExportStatusPayload` rejects malformed JSONB before UI/API trust it.

---

## 10. What Skin is not

- Not Gaze (no figura/gestalt/voz/convite)  
- Not Hands (no generation)  
- Not the numeric quality score  
- Not Energy  
- Not automatic “human override” logic beyond detecting approved-while-blocked state

---

## 11. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `export-validation.ts` | Classifier + CTA normalize |
| 2 | `export-validation.test.ts` | Behavioral contract |
| 3 | `olhar/dual-verdict.ts` | Payload + `isBlockingExportStatus` |
| 4 | `creative-quality-gate.ts` | Persist + `assertDerivationApprovable` |
| 5 | `client-approval-package.ts` | Package eligibility / override |
| 6 | `lib/derivation-display.ts` | UI mapping |
| 7 | `api/derivations/[id]/review/route.ts` | Approve door |

---

## 12. Maintenance

1. New factual failure code → add to `BLOCKING_EXPORT_CODES` (or setup set) **and** keep art-direction set exclusive.  
2. Soft export issues → prefer `MINOR_EXPORT_CODES` or explicit warning paths (like CTA normalize); don’t silently treat blockers as `ajuste_menor`.  
3. If setup should become non-blocking someday → change setup severity / `deriveExportStatusValue`; update tests + this doc (today setup → `bloqueado`).  
4. UI copy: never merge export badges into Olhar labels.  
5. Update atlas Skin card when the public `exportStatus` contract changes.
