# Phase 130: Score Calibration and Rubric Alignment - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 130 makes automatic quality scores auditable against human visual judgment from the Phase 129 corpus, surfaces systematic divergences grouped by failure reason / generation mode / format, and registers versioned rubric/gate adjustment **proposals** backed by corpus evidence.

This phase does **not** apply prompt/gate/rubric code changes (Phase 132), measure learning impact (Phase 131), or define the milestone release gate (Phase 133). Comparison uses the frozen `qualitySnapshot` captured at corpus selection time — not live re-scoring.

</domain>

<decisions>
## Implementation Decisions

### Superfície do operador
- Ship **both** CLI evidence generation and a **read-only** owner/feedback UI surface.
- Extend `HumanQualityCorpusPanel` with a calibration tab/section — do not create a separate top-level panel.
- UI shows **aggregate summary** (MAE, signed bias, slice counts) plus **drill-down per corpus item** (auto vs human score, delta, failure reason, factual pass).
- Access: **platform-owner and workspace admin** (broader than Phase 129 corpus queue, which was platform-owner only for selection/evaluation APIs).

### Fluxo de propostas de ajuste (CALIB-03)
- **Auto-propose** adjustments when systematic divergence in a slice exceeds thresholds — not manual-only.
- Per-item divergence flag threshold: **|delta| ≥ 15** (automatic minus human visual score).
- Minimum **3 evaluated items per slice** (failure reason × mode × format group) before auto-generating a proposal for that slice.
- All adjustments persist with status **`proposed` only** in this phase. Phase 132 accepts/applies code changes — no `accepted` workflow in 130.

### Escopo e evidência do relatório
- Primary report scope: **global multi-workspace rollup** (not workspace-scoped-only). CLI and API should aggregate evaluated corpus across workspaces for milestone-level calibration evidence.
- Support **cohort filter** (`baseline`, `pre_learning`, `post_learning`) — operator can narrow the report without splitting into mandatory separate reports per cohort.
- Minimum **5 evaluated corpus items globally** before report status is `ok`; below that return `insufficient_corpus` honestly.
- Persist versioned evidence as **JSON** under `.planning/phases/130-score-calibration-and-rubric-alignment/` (mirror Phase 128/123 evidence pattern for CI).

### Separação visual vs factual (CALIB-04 — locked from v12.5)
- `visualMetrics` and `factualMetrics` remain separate report buckets — never blend into a single pass metric.
- Include explicit `highVisualButFactualFail` guard list; factual pass rate cannot offset visual calibration conclusions.

### Claude's Discretion
- Exact tab/section layout inside `HumanQualityCorpusPanel`.
- API route paths and pagination/caps for global rollup payload size.
- Exact `insufficient_corpus` / slice-too-small messaging in UI and CLI.
- `check-score-calibration-evidence.mjs` schema details and template JSON file.
- `failure-bridge.ts` edge cases when human reason and snapshot hard failures disagree.
- Whether workspace admin global rollup requires an extra guard beyond existing auth patterns.

</decisions>

<specifics>
## Specific Ideas

- Operator workflow should feel like the existing internal corpus queue: careful judgment tooling in owner/feedback, not campaign review path.
- Calibration UI is **read-only** — evaluation still happens in the corpus queue; calibration is for audit and proposal surfacing.
- CLI remains the source of truth for CI-checkable milestone evidence; UI is for human review of the same report shape.
- Global rollup supports v12.5 milestone closure without forcing per-workspace manual runs.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HumanQualityCorpusPanel.tsx`: extend with calibration tab — already shows quality snapshot, failure reasons, and queue UX.
- `OwnerAnalyticsPanel.tsx`: parent surface for internal owner tooling.
- `human-quality/corpus.ts`: frozen `qualitySnapshot`, `visualScore`, `factualPass`, `primaryFailureReason` enums.
- `human-quality/service.ts` + `repositories/human-quality-corpus.ts`: add evaluated join query; today only pending list exists.
- `creative-score-ceilings.ts`, `observable-rubric.ts`, `creative-quality-taxonomy.ts`: proposal targets for CALIB-03.
- `check-output-learning-evidence.mjs` + `128-EVIDENCE.json`: metric separation and evidence checker pattern.

### Established Patterns
- Postgres canonical; bounded snapshots; no prompts/signed URLs in reports.
- Phase 128 `qualityMetrics` / `factualMetrics` JSON bucket separation.
- Platform-owner auth on corpus routes — extend carefully for workspace admin + global rollup.
- Evidence JSON in `.planning/phases/*` validated by `check-*.mjs` scripts.

### Integration Points
- New `human-quality/calibration/` module (compare, aggregate, adjustments).
- New `listEvaluatedCorpusWithEvaluations` repository join (`status = evaluated`).
- Optional `GET` calibration API under `/api/feedback/` namespace.
- `app/scripts/run-score-calibration.ts` → `130-EVIDENCE.json`.
- `rubric_calibration_adjustments` Postgres table for versioned proposals.

</code_context>

<deferred>
## Deferred Ideas

- Applying accepted rubric/gate/ceiling code edits — Phase 132 (QUALITY-*).
- Learning impact measurement on comparable samples — Phase 131 (IMPACT-*).
- Milestone release gate orchestration — Phase 133 (QA-22–24).
- Re-scoring corpus derivations with current analyzers (stale snapshot comparison is intentional).
- ML score calibration (Platt scaling, isotonic regression).
- Workspace-member or external reviewer access to calibration reports.
- Owner dashboard trend lines over time.

</deferred>

---

*Phase: 130-score-calibration-and-rubric-alignment*
*Context gathered: 2026-06-17*
