# Phase 40: Roteamento e contratos - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the silent `configureAndGenerate` shortcut in the campaign workspace so that choosing any option in **Derivar criativo** routes to the correct **next step** (a config surface), never queues generation from the 2×2 chooser.

This phase delivers:
- Flow state machine and routing contracts (DRV-07)
- Copy/i18n alignment for the chooser modal (DRV-08)

This phase does **not** deliver full config UI (creativity, CTAs, format pickers) — that is Phase 41–42. Phase 40 may ship **shell config modals** with Back + disabled/stub Confirm so routing is testable end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Intent state model
- Introduce a typed derivation intent: `manual_art` | `auto_art` | `single_format` | `batch_format`
- Extract flow state into a dedicated hook `useDerivationFlow` (new file under `app/src/lib/hooks/`) rather than growing `campaigns/[id]/page.tsx` further
- Hook owns: `activeStep` (`chooser` | intent keys | `null`), `selectedIntent`, `openChooser()`, `selectIntent(intent)`, `backToChooser()`, `closeFlow()`
- `configureAndGenerate` must **not** be callable from `selectIntent` — only from a future `confirmConfig()` method (stub in Phase 40, implemented in 41–42)
- Map DerivarModal `onSelect` payload to intents explicitly:
  - `art_variation + auto:false` → `manual_art`
  - `art_variation + auto:true` → `auto_art`
  - `format_adaptation + batch:false` → `single_format`
  - `format_adaptation + batch:true` → `batch_format`

### Modal transition UX
- **Separate modals**, not a single multi-step wizard inside one Dialog
- Pattern matches **EstilizarModal**: chooser closes, intent-specific config modal opens
- User can **Back** from config modal → returns to Derivar chooser (re-opens chooser, clears intent)
- User **Cancel/close** on config modal → closes entire flow (`activeStep = null`), no generation
- Estilizar flow stays independent — no shared state with derivation flow

### Config surface in Phase 40 (shell only)
- Add two shell components registered in the workspace page:
  - `ArtVariationConfigModal` — props: `intent: 'manual_art' | 'auto_art'`, `open`, `onBack`, `onClose`, `onConfirm` (Confirm disabled or no-op with toast "Em breve" **not acceptable** — prefer disabled Confirm with helper text "Configuração na próxima etapa" only if absolutely needed for demo; **preferred:** empty body with title reflecting intent + Back/Cancel, Confirm hidden until Phase 41)
- `FormatAdaptationConfigModal` — props: `intent: 'single_format' | 'batch_format'`, same shell contract
- Phase 40 success = routing works; Phase 41/42 replace shell bodies and wire Confirm → `configureAndGenerate`

### Copy & i18n (DRV-08)
- Move all Derivar chooser strings from hardcoded PT in `DerivarModal.tsx` to **next-intl**
- Namespace: `workspace.derivar` (new keys), reusing tone from existing `generation.modes.*` where labels overlap
- Fix typo: **"Variir tamanhos" → "Variar tamanhos"**
- Add matching keys in `messages/en.json` and `messages/pt-BR.json`
- Option descriptions must accurately state that the **next step is configuration**, not instant generation (update copy accordingly)

### API contract (unchanged in Phase 40)
- No backend changes in Phase 40
- `configureAndGenerate` in `use-campaign-workspace.ts` remains the single entry to PATCH campaign + queue derivations — just not called from chooser anymore

### Claude's Discretion
- Exact hook file name and whether shell modals live in one file vs two
- Whether `DerivarModal` `onSelect` signature changes to pass `DerivationIntent` directly vs keeping mode+config adapter in page
- Minor animation timing when swapping modals (reuse existing Dialog animations from v10)

</decisions>

<specifics>
## Specific Ideas

- User expectation (from product discussion): each of the four tiles should lead to the function the label describes — Phase 40 is the plumbing; user should never feel "it generated without asking"
- Chooser copy should mirror the distinction already explained to users: same-format art variations (top row) vs format adaptation (bottom row)
- Follow EstilizarModal footer pattern: Back (secondary) + primary action on the right when Confirm exists in later phases

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DerivarModal.tsx` — 2×2 chooser; only needs i18n + new `onSelect` contract
- `EstilizarModal.tsx` — reference for Dialog + footer + form submit pattern
- `use-campaign-workspace.ts` — `configureAndGenerate` already PATCHes `generationMode`, `creativeLevel`, `ctaVariants`, `targetFormats`
- `messages/pt-BR.json` / `en.json` — `generation.creativeLevel`, `generation.modes.*` keys for Phase 41 reuse

### Established Patterns
- Workspace modals dynamically imported or co-located under `components/workspace/`
- Campaign workspace page holds modal open booleans today (`showDerivarModal`, `showEstilizarModal`) — consolidate derivation booleans into `useDerivationFlow`
- v10 Dialog animations via shadcn/base-ui Dialog components

### Integration Points
- `campaigns/[id]/page.tsx` — `handleDerivarSelect` (lines ~180–206) is the primary change: route, don't generate
- `ActionCards` → `onOpenDerivar` → opens chooser only
- `DerivationGrid` → `onAddNew` → opens chooser only

</code_context>

<deferred>
## Deferred Ideas

- Credit cost preview before Confirm — DRV-11, future milestone
- Full manual/AI config fields — Phase 41
- Format pickers — Phase 42
- Remember last-used derivation settings per workspace — DRV-12

</deferred>

---

*Phase: 40-roteamento-e-contratos*
*Context gathered: 2026-06-01*
