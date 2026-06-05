# Phase 59: Feedback-Informed Regeneration - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto (recommended defaults from PROJECT.md, Phase 57–58 decisions, and existing regeneration/score/QA/gate code)

<domain>
## Phase Boundary

Turn hard failures, QA, score issues, and beta feedback categories into bounded correction briefs that drive user-confirmed regeneration without violating the creative contract.

This phase delivers:
- A single regeneration correction-brief builder that merges hard failures, score issues, QA checklist failures/warnings, and optional beta feedback **category** (not raw feedback prose as instructions).
- Contract-preserving brief text for the derivation job (`feedback` column + prompt `Revision Feedback` section) with non-negotiable CTA/format/mode/source-of-truth tail always derived from stored `CreativeContract` (or parent contract), never from user/beta text.
- Pre-confirm UI that surfaces the **primary regeneration reason** (blocking failures and checklist issues) before the user edits or submits feedback.
- Persistence of the correction brief and parent/source linkage on regenerated child derivations for inspectability.
- Route and helper tests for explicit feedback, stored `regenerationSuggestion`, hard-failure reconstruction, and feedback-informed context paths.

This phase does **not** deliver known-failure image fixtures (Phase 60), automatic multi-attempt regeneration loops, provider/model changes, owner debug dashboards, or changes to approval/export policy beyond existing gate behavior.

</domain>

<decisions>
## Implementation Decisions

### Phase cut
- Locked: extend the existing regeneration pipeline (`buildRegenerationSuggestion` / `buildHardFailureRegenerationSuggestion`, regenerate route, `derivation.feedback`, prompt-builder `Revision Feedback`) — do not introduce a parallel regeneration system.
- Build on Phase 57 persisted `creativeContract` / `promptProvenance` and Phase 58 `creative-quality-taxonomy` + normalized score/QA + gate classification.
- Keep regeneration user-confirmed with credit spend; no background auto-retry loops.

### Correction brief builder (AIR-01)
- Locked: add a dedicated server module (e.g. `app/src/server/ai/regeneration-correction-brief.ts`) that returns:
  - `primaryReason`: short human-readable summary for UI (hard failure codes + top QA/score issues).
  - `promptFeedback`: bounded string passed to `createDerivation.feedback` and prompt-builder (max length aligned with route Zod `2000` or stricter internal cap).
  - `structured`: JSON-serializable brief (sources, issue lists, optional `feedbackCategory`) for persistence on the child derivation.
- **Inputs (in priority order):**
  1. `hardFailures` from quality gate (canonical codes + messages).
  2. `scoreIssues` from normalized score (after Phase 58 normalization).
  3. QA issues: checklist items with `failed` (blocking context) and optionally `warning` (advisory context only — cap count).
  4. Optional `feedbackCategory` when a `feedback_reports` row exists for the same `derivationId` with `category: "generation"` (or other mapped categories); use **category label only**, never the report `message` body as a hard instruction.
- Refactor `buildHardFailureRegenerationSuggestion` to delegate its text assembly to this builder (or wrap it) so gate persistence and regenerate route share one code path.
- Import taxonomy display helpers / criterion IDs from `creative-quality-taxonomy.ts` for consistent naming in brief sections.
- Brief sections should be clearly labeled (`Hard failures:`, `Score issues:`, `QA issues:`, `Feedback context:`) so prompt-builder hard rules can treat everything except the contract tail as flexible guidance.

### Contract preservation and feedback safety (AIR-02)
- Locked: the contract-preservation tail MUST always be produced by `buildRegenerationSuggestion` logic from `CreativeContract` (explicit/inherited CTA, `targetFormat`, `generationMode`, restyling asset IDs, factual-source rules) — appended after issue context.
- User-edited dialog text and beta feedback are **issue context only**; they cannot replace or contradict preservation lines (e.g. user cannot type a new CTA or format in feedback and expect it to override contract).
- Regenerate route should prefer parent `creativeContract` JSON when present; fall back to `resolveCtaSemantics` + derivation fields only when contract missing (same pattern as today, but load full contract for brief building).
- Prompt-builder already states feedback is flexible guidance only (`prompt-builder.ts` hard rules); correction brief wording should reinforce that structure (issues first, preservation last).
- Do not pass raw `feedback_reports.message` into prompts; category may add a single line like `Feedback context (generation): user reported a generation-quality issue` without quoting user prose.
- Explicit API `feedback` in POST body still wins for the editable portion when user confirms, but server should **merge** user edits with stored brief (user text = additional revision notes, not a full replacement of gate-derived blocking context) OR reject overrides that attempt to change contract fields — planner picks one approach; default recommendation: prefill dialog with full brief; on submit, if user changed text, wrap as `Additional notes: …` after machine-generated blocking sections.

### Pre-confirm UX (AIR-03)
- Locked: when opening regenerate-with-fixes, user sees **why** regeneration is recommended before confirming:
  - Show `primaryReason` / structured hard-failure list and key QA/score issues in the dialog (read-only summary above the textarea), not only a blob of feedback text.
- Extend `RegenerateFeedbackDialog` (and `buildRegenerationFeedback` in `app/src/lib/derivation-regeneration-feedback.ts`) to accept `primaryReason` + optional issue breakdown from API or client-side brief preview.
- Optional: expose a lightweight GET field on derivation list/detail responses (`regenerationPrimaryReason`) computed server-side to avoid duplicating brief logic in the client — planner decides; minimum is client calling a shared brief builder via API or embedding `primaryReason` when `regenerationSuggestion` is set.
- i18n: add PT-BR/EN keys for “What we’ll try to fix” / blocking vs advisory labels consistent with Phase 58 `review.hardFailureCodes.*` titles.
- One-click regenerate without dialog remains for polish-only paths; invalid/hard-failure paths should always show the summary dialog (existing `handleRequestRegenerate` preset behavior).

### Persistence on regenerated derivations (AIR-04)
- Locked: child derivations created by `POST /api/derivations/[id]/regenerate` must record:
  - `parentId` (already set).
  - `feedback` = final `promptFeedback` string used for generation.
  - New persisted JSON for the correction brief used (e.g. `regenerationCorrectionBrief` jsonb on `derivations`, or nested under `promptProvenance` on the child) including: parent derivation ID, source contract snapshot or reference, issue sources, and `feedbackCategory` if any.
- Child generation should inherit parent's `creativeContract` fields (mode, format, CTA semantics, brand/product/offer, source package) when building the new contract — do not reset contract to minimal fallback if parent had full contract JSON.
- Do not expose full brief internals to beta feedback diagnostics; owner/developer inspect via derivation row only.

### Tests and route behavior (AIR-05)
- Locked: extend `app/src/app/api/derivations/[id]/regenerate/route.test.ts` and unit tests for the brief builder to cover:
  1. Explicit user `feedback` in body (merged safely with brief).
  2. Parent `regenerationSuggestion` when feedback omitted.
  3. Hard-failure reconstruction when suggestion empty but `hardFailures` present (existing partial coverage — align with unified brief).
  4. Brief includes QA checklist failures and score issues when present on parent.
  5. Optional `feedbackCategory` context when linked report exists (mock repository).
- Keep bounded feedback size test (`2001` chars → 400).
- Add unit tests mirroring `creative-score.test.ts` patterns for brief assembly and preservation tail.

### Scope guardrails
- Phase 59 may add one Drizzle migration for `regeneration_correction_brief` (or extend `prompt_provenance`) and repository typings.
- Phase 59 may update `use-campaign-workspace.ts`, `DerivationCard`, and review modal regenerate entry points for primary-reason display.
- Phase 59 should not change hard-failure taxonomy codes (Phase 58) or prompt contract invariants (Phase 57) except importing shared wording.
- Linking multiple feedback reports → use most recent open report for derivation context only.

### Claude's Discretion
- Exact JSON shape for `regenerationCorrectionBrief` vs stuffing metadata into existing `promptProvenance`.
- Whether to add a small `GET` preview endpoint vs computing brief client-side from expanded derivation DTO fields.
- Merge strategy for user-edited dialog text vs machine brief (wrap vs replace sections).
- Whether QA `warning` items appear in prompt feedback or only in UI primary reason.

</decisions>

<specifics>
## Specific Ideas

- Auto mode selected recommended defaults: unify scattered suggestion builders; treat beta feedback as categorized context per REQUIREMENTS out-of-scope rule (“no raw beta feedback in prompts”).
- Highest-impact gap: `buildHardFailureRegenerationSuggestion` and score-only `buildRegenerationSuggestion` do not yet merge QA checklist issues; gate stores them separately on the derivation row.
- Second gap: explicit user feedback in regenerate route **replaces** stored suggestion entirely — risks losing blocking failure context (AIR-02/03); merging/wrapping is the recommended fix.
- Third gap: regenerate route rebuilds a minimal `CreativeContract` without parent `creativeContract` JSON — child may lose brand/product/offer/source package for preservation tail.
- `RegenerateFeedbackDialog` today shows only editable textarea; users cannot see structured “what will be fixed” without reading the whole suggestion string.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/creative-score.ts` — `buildRegenerationSuggestion`, `buildHardFailureRegenerationSuggestion`, `ctaTextFromContract`.
- `app/src/server/ai/creative-quality-gate.ts` — persists `regenerationSuggestion` after hard failures via `buildHardFailureRegenerationSuggestion`.
- `app/src/server/ai/creative-quality-taxonomy.ts` — canonical dimension IDs and shared regex patterns (Phase 58).
- `app/src/server/ai/creative-qa.ts` — `qaChecklist`, `qaIssues` on derivations.
- `app/src/server/ai/creative-contract.ts` — persisted contract shape (Phase 57).
- `app/src/app/api/derivations/[id]/regenerate/route.ts` — `resolveRegenerationFeedback`, child `createDerivation` with `parentId` + `feedback`.
- `app/src/lib/derivation-regeneration-feedback.ts` — UI preset when opening dialog.
- `app/src/components/workspace/RegenerateFeedbackDialog.tsx` — pre-confirm editor.
- `app/src/lib/hooks/use-campaign-workspace.ts` — `handleRequestRegenerate` opens dialog when preset non-empty.
- `app/src/server/jobs/derivation.ts` — passes `derivation.feedback` into scoring and prompt build.
- `app/src/server/ai/prompt-builder.ts` — `Revision Feedback` section; hard rules that feedback cannot override contract.
- `app/src/server/repositories/feedback.ts` — `FeedbackCategory` for beta reports linked by `derivationId`.

### Established Patterns
- Regeneration suggestion stored on parent in `regeneration_suggestion` text column; child stores only `feedback` text today.
- Credit gate `action: "regeneration"` with idempotency key including feedback string.
- Active child guard via `getActiveChildrenByParent` (429 when regeneration in flight).
- Integration test `review-export.test.ts` asserts `parentId` linkage.

### Integration Points
- `app/src/server/ai/regeneration-correction-brief.ts` (new) — brief builder + types.
- `app/src/server/ai/creative-score.ts` — delegate/wrap hard-failure suggestion.
- `app/src/server/ai/creative-quality-gate.ts` — use unified brief when refreshing suggestion.
- `app/src/app/api/derivations/[id]/regenerate/route.ts` — resolve brief, persist on child, load parent contract.
- `app/src/server/db/schema.ts` + `app/drizzle/*` — optional `regeneration_correction_brief` jsonb.
- `app/src/server/repositories/derivation.ts` — create/update typings.
- `app/src/server/jobs/derivation.ts` — ensure child uses parent contract + brief feedback.
- `app/src/lib/derivation-regeneration-feedback.ts`, `RegenerateFeedbackDialog.tsx`, messages `en.json` / `pt-BR.json`.
- `app/src/app/api/derivations/[id]/regenerate/route.test.ts` + new unit tests for brief module.

</code_context>

<deferred>
## Deferred Ideas

- Synthetic/sanitized quality fixtures and full manual verification guide (Phase 60).
- Automatic multi-attempt regeneration or credit-spend loops without user confirm.
- Passing beta feedback message body or screenshots into prompts.
- Owner analytics on regeneration success rates by failure category.
- New hard-failure codes or ML classifiers beyond Phase 58 taxonomy.

</deferred>

---

*Phase: 59-feedback-informed-regeneration*
*Context gathered: 2026-06-05*
