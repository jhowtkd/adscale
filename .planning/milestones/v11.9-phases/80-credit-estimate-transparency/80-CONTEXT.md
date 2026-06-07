# Phase 80: Credit Estimate Transparency - Context

**Gathered:** 2026-06-07  
**Status:** Ready for planning

<domain>
## Phase Boundary

Clarify credit cost **before** batch derivation: itemized batch estimate on the preview gate, visible workspace balance, and blocked approve action when balance is insufficient. Extends v11.8 F-01 (`PreviewGatePanel` credit copy) — does **not** enrich analytics events (Phase 81) or change delivery/approval package UX (Phase 82).

**Requirements in scope:** CRED-01, CRED-02, CRED-04.

</domain>

<decisions>
## Implementation Decisions

### Batch estimate breakdown (CRED-01)
- Show **compact formula**, not a per-piece list: `N × 5 créditos = total` (reuse `countDerivationJobs` × `IMAGE_DERIVATION_CREDIT_COST`).
- **Replace** the current single `batchCost` line with the formula + total (inline in the credit box).
- **Mode-aware label:**
  - `art_variation` → count CTAs (e.g. `3 CTAs × 5 créditos = 15`)
  - `format_adaptation` → count formats (e.g. `2 formatos × 5 créditos = 10`)
- **Preview spend stays separate** from batch breakdown: keep existing `previewSpent` line above batch formula (do not combine into one running total).

### Insufficient balance (CRED-02)
- When `saldo < estimativa do batch`: **disable** "Aprovar batch" button.
- Show explicit copy: **estimativa X · saldo Y** (localized PT-BR / EN).
- Server-side `spendCreditsOrApiError` / 402 remains as backstop — UI must prevent the happy-path click when blocked.

### Balance visibility
- **Always** show workspace credit balance in the preview gate credit section (alongside preview spent + batch formula).
- Balance source: wire from existing workspace/billing data (dashboard stats or equivalent) — planner chooses fetch path; no new billing subsystem.

### Preview disclaimer (CRED-04)
- **Keep subtle tone** — existing muted `creditEstimateNote` style; ensure PT-BR and EN strings are consistent and present.
- No extra alert icon or aggressive warning treatment in this phase.

### Claude's Discretion
- Exact i18n key names and layout spacing within `PreviewGatePanel` credit box.
- How `batchCreditEstimate`, job count, and `generationMode` are passed from `page.tsx` / `use-strategy-recipe` / `use-campaign-workspace`.
- Whether to show formula only when `batchCredits > 0` or also handle `batchCostPending` edge case with copy-only state.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PreviewGatePanel.tsx` — credit box with `previewSpent`, `batchCost`, `creditEstimateNote` (F-01).
- `estimateCreditCost` / `countDerivationJobs` in `server/ai/strategy-recipes.ts` — job count and cost math.
- `StrategyRecipePanel` already shows `creditBatchEstimate` — align wording with preview gate.
- `spendCreditsOrApiError` in `server/billing/gates.ts` — server block on insufficient credits.
- `CREDIT_COSTS.image_derivation` (5) in `server/billing/credits.ts`.

### Established Patterns
- Credit copy under `strategyRecipes.previewGate` namespace (`next-intl`).
- Campaign workspace passes `batchCredits={batchCreditEstimate ?? 0}` from `campaigns/[id]/page.tsx`.
- Beta events on preview gate: `cockpit_stage_entered/completed/abandoned` — do not regress instrumentation.

### Integration Points
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — `PreviewGatePanel` props (add balance, job count, mode).
- `use-strategy-recipe.ts` / `use-campaign-workspace.ts` — resolved recipe config for `countDerivationJobs`.
- Workspace credit balance: `dashboard/stats` API or billing access pattern (not currently on campaign page).

</code_context>

<specifics>
## Specific Ideas

- User prefers **low-noise UX**: formula over long line-item lists.
- Mode-aware labels (CTAs vs formatos) help operators map estimate to recipe config without opening settings.

</specifics>

<deferred>
## Deferred Ideas

- Per-CTA/per-format line-item list in breakdown — user chose compact formula instead.
- Combined running total (preview + batch) — keep separate lines.
- Stronger disclaimer with alert styling — out of scope for this phase.
- Credit surprise ranking / event payload changes — Phase 81 (CRED-03).

</deferred>

---

*Phase: 80-credit-estimate-transparency*  
*Context gathered: 2026-06-07*
