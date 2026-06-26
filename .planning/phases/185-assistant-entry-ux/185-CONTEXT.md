# Phase 185: Assistant Entry UX - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto (recommended defaults selected)

<domain>
## Phase Boundary

Replace the generic `/assistant` start with two primary guided journey cards (`Já tenho peça`, `Produzir do zero`) while preserving freeform chat entry. Show resume state when returning to a guided thread. Does not implement path-specific logic (Phases 186–187) or action wiring (Phase 188).

</domain>

<decisions>
## Implementation Decisions

### Journey cards layout
- Two equal-weight cards above the existing composer in `AssistantStartComposer`
- Desktop: side-by-side grid (2 columns); mobile: stacked full-width
- Card labels: `Já tenho peça` (existing_creative) and `Produzir do zero` (from_zero)
- Short subtitle per card explaining the journey (i18n keys under `assistant.start.journeys`)

### Card interaction
- Clicking a card creates a thread (same as freeform) then PATCHes guided-flow with path + initial step
- existing_creative → step `select_creative`; from_zero → step `collect_brief`
- Navigate to thread after flow upsert succeeds

### Freeform entry (ENTRY-02)
- Composer remains below cards; unchanged submit flow
- Extend `classifyUserIntent` with guided-path heuristics: existing creative vs from-zero keywords
- On first message in unclassified thread: classify → upsert path or return one clarifying question
- Clarifying question: "Você já tem uma peça criativa ou quer produzir do zero?"

### Resume UX (ENTRY-03)
- When thread detail includes `guidedFlow`, show `GuidedFlowResumeBanner` above message list
- Banner shows: path label, current step label, missing fields count, primary next-action hint
- Use guided-flow from thread GET response (Phase 184)

### Mobile parity (ENTRY-04)
- Same cards and composer in `AssistantStartComposer` used by both desktop and mobile layouts
- No duplicate path selectors in sidebar/drawer

### Claude's Discretion
- Card visual styling (icons, colors) — match existing surface tokens
- Step label mapping i18n structure
- Exact heuristic keyword lists for path classification

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AssistantStartComposer` — start surface with client picker and composer
- `AssistantChatCore` / `AssistantMessageList` — thread view
- `useCreateAssistantThread`, `useAssistantThread` hooks
- `guided-flow` repository and `/guided-flow` API (Phase 184)
- `classifyUserIntent` in `intent-classifier.ts`

### Established Patterns
- i18n via `next-intl` (`assistant.start.*`)
- data-testid on assistant components for tests
- `AssistantSurfaceContext` for client selection and pending first message

### Integration Points
- PATCH guided-flow after thread creation on card click
- Thread GET already returns optional `guidedFlow`
- Chat route/orchestrator reads flow for classification on first turn

</code_context>

<specifics>
## Specific Ideas

- Portuguese labels as specified in REQUIREMENTS
- Preserve v13.5 freeform chat — cards are primary, not exclusive

</specifics>

<deferred>
## Deferred Ideas

- Creative upload/select UI — Phase 186
- Brief collection and 3-reference minimum — Phase 187
- Action cards for path steps — Phase 188

</deferred>

---

*Phase: 185-assistant-entry-ux*
*Context gathered: 2026-06-26*
