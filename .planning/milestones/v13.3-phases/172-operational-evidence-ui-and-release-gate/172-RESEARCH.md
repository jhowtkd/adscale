---
phase: 172-operational-evidence-ui-and-release-gate
status: complete
created: 2026-06-25
---

# Phase 172 Research: Operational Evidence UI and Release Gate

## Objective

Surface existing `factual_issue` alerts in owner quality/admin UI with safe evidence links, visually separate them from promptable learning proposals, and close v13.3 with an auditable release gate covering Phases 168–172.

## Existing Implementation Facts

### Factual alerts backend (complete — no new detection logic)

- `GET /api/admin/quality/learning/factual-alerts/route.ts` — owner-gated; optional `workspaceId` / `clientProfileId` query filters via Zod.
- `listFactualIssueAlerts` / `buildFactualIssueAlerts` in `app/src/server/human-quality/learning/factual-alerts.ts` — buckets evaluated corpus rows where `primaryFailureReason === "factual_issue"` and slice meets learning thresholds.
- `FactualIssueAlert` contract in `app/src/server/human-quality/calibration/types.ts`:
  - `workspaceId`, `clientProfileId`, `sliceKey`, `rationale: "factual_guard_review_required"`, `evidenceRefs: { corpusItemIds, artifactIds?, stats }`.
- `learning-proposal-aggregator.ts` counts factual alerts separately from proposals — UI should mirror this split.
- Route tests: `factual-alerts/route.test.ts` + `factual-alerts.test.ts` already green.

### Learning proposals UI (reference pattern)

- `LearningProposalsTab.tsx` — TanStack Query + `apiFetch`, workspace/brand `variant`, 403 → muted restricted copy, scoped query params.
- Accept/Reject/Generate actions create or reject `corpus_quality` rules — factual slices are excluded server-side in aggregator; UI must reinforce read-only boundary for alerts.
- Mounted in:
  - `HumanQualityCorpusPanel.tsx` — `activeTab === "learning"` (workspace-scoped proposals).
  - `OwnerCalibrationPanel.tsx` — Propostas tab (brand-scoped with `workspaceId` + `clientProfileId`).

### Safe evidence display precedent

- `BrandEvidencePanel.tsx` — claims withheld lists, source labels, no prompt/artifact leakage.
- Phase 166/169 evidence panels — IDs and aggregate stats only; never render evaluation notes, prompts, or storage keys.

### Release gate precedent

- `run-operational-quality-release-gate.mjs` + `check-operational-quality-release-evidence.mjs` — separates `technicalRegression.status` from `operationalEvidence.status`; milestone can pass as `tech_debt` / `insufficient_sample`.
- Phase 169 release tests: `real-quality-release-evidence.test.ts`, `operational-quality-release-evidence.test.ts`.
- Phase 170 deliverable: `marketing/brand/in-app-copy-checklist.md` (BRAND-04 gate).
- Phase 171 deliverables: profile/workspace settings routes + `settings-nav.test.ts`, hook tests.

### Gap (what Phase 172 completes)

- LEARN-06 was half-done in Phase 163: aggregator skips `factual_issue` from proposals but no dedicated alert list UI existed.
- v13.3 has no milestone-level release artifact tying 168–172 surfaces together.

## Recommended Implementation Shape

### 1. `FactualAlertsPanel` client component

Create `app/src/components/feedback/FactualAlertsPanel.tsx` colocated with `LearningProposalsTab`:

- Fetch `GET /api/admin/quality/learning/factual-alerts?workspaceId=&clientProfileId=` using same filter pattern as proposals.
- Props: optional `workspaceId`, `clientProfileId`, `variant: "workspace" | "brand"`.
- Section: own `<section>` with heading ("Factual issue alerts" / PT: "Alertas de problema factual"), warning/destructive-adjacent border, badge copy ("Factual guard — not a calibration rule").
- Per alert card/row: `sliceKey`, `workspaceId`, `clientProfileId`, `rationale`, `evidenceRefs.stats` (count, meanSignedDelta, meanAbsError, over/under counts).
- **Read-only** — no Accept, Reject, Generate, or rule-creation actions.
- Empty: "No factual issue slices meet alert thresholds".
- Loading/error/403: match `LearningProposalsTab` patterns.

### 2. Mount in two owner surfaces (no new sidebar route)

Per locked decision — reuse existing tabs:

1. `HumanQualityCorpusPanel` learning tab — render `FactualAlertsPanel` **above** `LearningProposalsTab` (global/workspace scope).
2. `OwnerCalibrationPanel` Propostas tab — render **above** `LearningProposalsTab` with `variant="brand"` and brand filters.

### 3. Evidence linking (sanitized)

- Brand link: `/admin/quality/brands/{clientProfileId}` (deep-link `?tab=evidence` optional discretion).
- Corpus items: link to `/feedback` (human-quality queue context) with visible `corpusItemId` label; copy-button fallback if deep selection unsupported. **Never** fetch or render prompts, evaluation notes, `artifactRef`, or S3 keys.
- `artifactIds`: show count only when present; no download links.

### 4. v13.3 release gate (ALERT-04)

Add under `.planning/phases/172-operational-evidence-ui-and-release-gate/`:

- `172-EVIDENCE.template.json` + runtime `172-EVIDENCE.json`
- `172-RELEASE-CHECKLIST.md` — manual smoke steps from CONTEXT
- `app/scripts/check-v13-3-release-evidence.mjs` — validates evidence schema + requirement mapping
- `app/scripts/run-v13-3-release-gate.mjs` — orchestrates:
  1. Technical regression (unit/lint/build subset via existing gate scripts)
  2. Phase 168 — evaluation route + human-quality service tests
  3. Phase 169 — `real-quality-release-evidence` + `operational-quality-release-evidence` tests
  4. Phase 170 — `in-app-copy-checklist.md` + narrative copy tests
  5. Phase 171 — settings route/hook/nav tests
  6. Phase 172 — factual-alerts route + `FactualAlertsPanel` + panel integration tests
- `app/tests/unit/release/v13-3-release-evidence.test.ts` — ALERT-01..04 map to evidence `requirements[]`

Preserve operational vs technical split: root status may be `tech_debt` / `insufficient_sample` while technical regression passes.

## Validation Architecture

### Test infrastructure

- Framework: Vitest via `cd app && npm test -- --run ...`
- Config: `app/config/vitest.config.ts`

### Required automated coverage

| Requirement | Automated target |
|-------------|------------------|
| ALERT-01 | `FactualAlertsPanel.test.tsx` list render; `HumanQualityCorpusPanel.test.tsx` + `OwnerCalibrationPanel.test.tsx` fetch `/factual-alerts` |
| ALERT-02 | Panel test asserts brand link href + corpus item ids/stats visible; no prompt/storage fields |
| ALERT-03 | Panel test asserts no Accept/Reject/Generate buttons; warning copy present |
| ALERT-04 | `v13-3-release-evidence.test.ts` + gate script dry-run |

### Commands

```bash
# Panel unit
cd app && npm test -- --run src/components/feedback/FactualAlertsPanel.test.tsx

# Integration mounts
cd app && npm test -- --run src/components/feedback/HumanQualityCorpusPanel.test.tsx src/components/admin/OwnerCalibrationPanel.test.tsx

# API (existing)
cd app && npm test -- --run src/app/api/admin/quality/learning/factual-alerts/route.test.ts tests/unit/human-quality/learning/factual-alerts.test.ts

# Release gate
cd app && npm test -- --run tests/unit/release/v13-3-release-evidence.test.ts
```

### Manual verification (release checklist)

- Owner opens Learning tab → factual alerts section when data exists
- Owner opens brand Propostas tab → brand-scoped alerts
- Brand link lands on calibration page
- Proposals section still accepts/rejects promptable proposals only
- Settings profile/workspace round-trip after refresh

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Operator accepts factual slice as corpus_quality rule | Read-only panel + explicit warning copy; no action buttons |
| Evidence links leak prompts or storage keys | IDs/stats only; panel test forbids forbidden field names |
| Release gate overclaims customer-real proof | Reuse Phase 169 operational/technical split in v13.3 evidence |
| Alerts buried in Learning tab | Accept for v13.3; dedicated route deferred |
| Corpus queue lacks item deep-link | `/feedback` + item id label + copy button fallback |

## Architectural Responsibility Map

| Tier | Responsibility |
|------|----------------|
| API route | Already exists — no changes unless query-key export needed |
| Server | `factual-alerts.ts` — no changes in this phase |
| Client panel | New `FactualAlertsPanel` — fetch, render, link |
| Composition | `HumanQualityCorpusPanel`, `OwnerCalibrationPanel` — mount ordering |
| Release | Scripts + evidence JSON + checklist under phase dir |

## Open Questions (resolved by CONTEXT)

- New sidebar route? **No** — reuse Learning / Propostas tabs.
- Dashboard KPI? **Deferred**.
- Table vs cards? **Claude's discretion** — match `LearningProposalsTab` visual density.

---

## RESEARCH COMPLETE

Phase 172 is UI composition + release gate only. Backend factual-alert detection is done; executors wire a read-only panel, mount it twice, and close v13.3 with honest milestone evidence.
