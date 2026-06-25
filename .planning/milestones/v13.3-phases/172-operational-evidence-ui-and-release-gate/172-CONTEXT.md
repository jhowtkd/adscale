# Phase 172: Operational Evidence UI and Release Gate - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** `--auto` (conservative defaults; no interactive discussion)

<domain>
## Phase Boundary

Surface **existing** factual issue alerts in owner quality/admin UI, link them to safe evidence destinations, and **visually separate** factual guard issues from promptable corpus-quality learning proposals. Close v13.3 with a release checklist that proves decision intake, source/corpus gates, narrative rollout, settings persistence, and alert surfaces are usable and honest.

In scope (ALERT-01..04):
- UI for `GET /api/admin/quality/learning/factual-alerts` in quality/admin surfaces.
- Evidence links to workspace, `clientProfileId`, slice summary, and corpus queue items — **no** prompts, storage keys, or raw artifact payloads.
- Clear distinction from `LearningProposalsTab` accept/reject flow (no accidental `corpus_quality` rule creation).
- v13.3 milestone release checklist / evidence artifact covering Phases 168–172 surfaces.

Out of scope: new alert detection logic (aggregator already skips `factual_issue` from proposals), prompt injection changes, new admin route group refactor, marketing copy, integrations OAuth, multi-brand dashboard index.
</domain>

<decisions>
## Implementation Decisions

### Alert surface placement (ALERT-01)
- **Do not** add a new top-level admin sidebar route for v13.3 — reuse existing quality surfaces.
- Add a dedicated **`FactualAlertsPanel`** client component that fetches `GET /api/admin/quality/learning/factual-alerts` with optional `workspaceId` / `clientProfileId` query params (same filter pattern as `LearningProposalsTab`).
- Mount in **two places** (both owner-gated):
  1. **`HumanQualityCorpusPanel` → Learning tab** — render `FactualAlertsPanel` **above** `LearningProposalsTab` so global/workspace corpus operators see alerts before proposals.
  2. **`OwnerCalibrationPanel` → Propostas tab** — render `FactualAlertsPanel` **above** `LearningProposalsTab` with `variant="brand"` scoping (`workspaceId` + `clientProfileId` from selected brand).
- Empty state: honest copy when `alerts.length === 0` ("No factual issue slices meet alert thresholds").
- Loading/error: match `LearningProposalsTab` patterns (muted text, 403 → restricted message).
- **No dashboard KPI card** in this phase — alerts belong in quality ops context, not platform dashboard summary.

### Evidence linking (ALERT-02)
- Display per alert: `sliceKey`, `workspaceId`, `clientProfileId`, `rationale` (always `factual_guard_review_required`), and `evidenceRefs.stats` (count, meanSignedDelta, meanAbsError, over/under score counts).
- **Brand link:** `/admin/quality/brands/{clientProfileId}` (opens owner calibration; user can switch to Evidência tab manually — deep-link to tab optional discretion).
- **Corpus evidence link:** link each `corpusItemId` to the existing human-quality queue evaluation context — conservative approach: `/feedback` or corpus panel with item pre-selected if supported; otherwise link to queue with workspace scope and show item id as label. **Never** fetch or render evaluation notes, prompts, `artifactRef` internals, or S3/storage keys.
- **Artifact ids:** show count only if `artifactIds` present; do not link to raw artifact download endpoints.
- Sanitization bar matches Phase 169/166 evidence panels: IDs and aggregate stats only.

### Factual vs corpus-quality distinction (ALERT-03)
- Factual alerts are **read-only operational signals** — **no** Accept, Reject, Generate, or "create rule" actions.
- Visual treatment: warning/destructive-adjacent border or badge ("Factual guard — not a calibration rule"), separate `<section>` with its own heading ("Factual issue alerts" / PT: "Alertas de problema factual").
- Copy must state explicitly: these slices failed factual guard review and **must not** be accepted as `corpus_quality` prompt rules; operator should review corpus items and factual evidence manually.
- `LearningProposalsTab` remains unchanged in behavior below the factual section — proposals continue to offer accept/reject for non-factual failure reasons only (aggregator already excludes `factual_issue`).
- If an alert slice also appears in proposals list (should not happen server-side), UI copy still treats sections independently; planner may add a defensive empty proposals note if needed.

### Release checklist (ALERT-04)
- Add v13.3 milestone release evidence under `.planning/phases/172-operational-evidence-ui-and-release-gate/172-EVIDENCE.json` (and template if following prior gate phases).
- Extend or add runner script (recommended: `app/scripts/run-v13-3-release-gate.mjs` orchestrating existing checks + new surface checks) that records:
  1. **Technical regression** — unit/lint/build (reuse `run-release-gate.mjs` or subset).
  2. **Phase 168** — human decision intake API wired (corpus evaluation → calibration signals).
  3. **Phase 169** — source-labeled corpus promotion + claim gates (`real-quality-release-evidence`, `operational-quality-release-evidence` tests stay green).
  4. **Phase 170** — in-app copy checklist reference (`marketing/brand/in-app-copy-checklist.md` exists and BRAND keys updated).
  5. **Phase 171** — profile/workspace settings persistence routes + tab enablement tests.
  6. **Phase 172** — factual-alerts API route test + new UI component test(s) proving list render, no accept actions, evidence links present.
- Checklist document (recommended: `172-RELEASE-CHECKLIST.md` in phase dir) with manual smoke steps:
  - Owner opens Learning tab → sees factual alerts section when data exists.
  - Owner opens brand Propostas tab → sees brand-scoped factual alerts.
  - Click brand link → lands on brand calibration page.
  - Confirm proposals section still accepts/rejects only promptable proposals.
  - Settings profile/workspace round-trip after refresh.
- **Operational vs technical split** carries forward from Phase 169: milestone can pass with `insufficient_sample` operational status; checklist must record both statuses honestly.
- `milestoneVersion`: `v13.3`.

### Testing bar
- API: existing `factual-alerts/route.test.ts` stays green; extend if UI adds query-key helpers.
- UI: component test for `FactualAlertsPanel` — renders alerts, shows stats, has evidence/brand links, **asserts no accept/reject buttons**.
- Integration: extend `HumanQualityCorpusPanel` learning tab test block to expect factual alerts fetch (`/api/admin/quality/learning/factual-alerts`).
- Release: new `tests/unit/release/v13-3-release-evidence.test.ts` (or extend operational release test) validating checklist requirement IDs ALERT-01..04 map to evidence fields.

### Claude's Discretion
- Exact PT-BR/EN strings for alert headings and warning copy (owner/admin audience — technical honesty OK).
- Whether to add `?tab=evidence` deep-link on brand URL.
- Whether factual alerts use a compact table vs card list (match `LearningProposalsTab` card stack for consistency).
- Corpus item link implementation detail if queue deep-link is awkward (item id display + copy button acceptable fallback).
- Release gate script structure: single orchestrator vs extending `check-operational-quality-release-evidence.mjs`.
</decisions>

<specifics>
## Specific Ideas

- **Separation principle:** `factual_issue` → human factual review alert only; `brief_mismatch` / `off_brand` / etc. → learning proposals → optional `corpus_quality` rules. Phase 163 research noted LEARN-06 was half-done (skip proposal, no alert UI) — Phase 172 completes the alert half.
- **Reference layout:** `LearningProposalsTab.tsx` — react-query + `apiFetch`, scoped filters, owner 403 handling, card list with metadata.
- **API contract (locked):** `FactualIssueAlert` in `calibration/types.ts` — `workspaceId`, `clientProfileId`, `sliceKey`, `evidenceRefs`, `rationale: "factual_guard_review_required"`.
- **Aggregator context:** `learning-proposal-aggregator.ts` already counts factual alerts separately from proposals; UI should mirror that mental model.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET /api/admin/quality/learning/factual-alerts/route.ts` — owner-gated list endpoint with `workspaceId` / `clientProfileId` filters.
- `listFactualIssueAlerts` / `buildFactualIssueAlerts` — `app/src/server/human-quality/learning/factual-alerts.ts` (thresholds via `buildLearningSliceBuckets` + `meetsLearningSliceThresholds`, `primaryFailureReason === "factual_issue"`).
- `LearningProposalsTab.tsx` — query/mutation pattern, workspace/brand variants, owner restriction UX.
- `HumanQualityCorpusPanel.tsx` — Learning tab (`activeTab === "learning"`) already hosts proposals; tab id `"learning"`.
- `OwnerCalibrationPanel.tsx` — Propostas tab with brand-scoped `LearningProposalsTab`.
- `BrandEvidencePanel.tsx` — safe evidence display pattern (claims withheld, no prompt leakage).
- `app/src/app/api/admin/quality/learning/factual-alerts/route.test.ts` + `factual-alerts.test.ts` — behavioral spec for alert generation.
- Release evidence: `check-operational-quality-release-evidence.mjs`, `operational-quality-release-evidence.test.ts`, `run-release-gate.mjs`.

### Established Patterns
- Owner admin surfaces live under `(dashboard)/admin/quality/*` and `/feedback` (HumanQualityCorpusPanel via OwnerAnalyticsPanel).
- Quality ops use `apiFetch` + TanStack Query; 403 → muted restricted message.
- `factual_issue` labeled in corpus panel as `"Factual issue"` (`FAILURE_REASON_LABELS`) but never surfaced as dedicated alert list.
- Learning proposals expose Accept/Reject → `corpus_quality` rules; factual slices are excluded in `aggregate.ts` — UI must reinforce that boundary.
- v13.3 phases 168–171 locked: client-agnostic decisions, source honesty, curator narrative, settings persistence via BrandKit-style hooks.

### Integration Points
- New: `app/src/components/feedback/FactualAlertsPanel.tsx` (or `admin/quality/` if preferred — follow `LearningProposalsTab` location).
- Edit: `HumanQualityCorpusPanel.tsx` learning tab composition.
- Edit: `OwnerCalibrationPanel.tsx` proposals tab composition.
- New: phase evidence + release checklist + gate script under `.planning/phases/172-*` and `app/scripts/`.
- Tests: `HumanQualityCorpusPanel.test.tsx` learning tab describe block; new panel unit test; release evidence test.
</code_context>

<deferred>
## Deferred Ideas

- Dashboard "attention" KPI for factual alert count — needs product prioritization beyond ops tab.
- Dedicated `/admin/quality/alerts` route — defer unless Learning tab proves too buried.
- Automated remediation or rule creation from factual alerts — contradicts factual guard semantics.
- Email/Slack notification on new factual alerts.
- Deep corpus queue URL with item hash routing — nice-to-have if queue lacks selection API.
</deferred>

---

*Phase: 172-operational-evidence-ui-and-release-gate*
*Context gathered: 2026-06-25*
