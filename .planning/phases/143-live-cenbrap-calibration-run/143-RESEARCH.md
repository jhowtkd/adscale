---
phase: 143
slug: live-cenbrap-calibration-run
status: planning
created: 2026-06-19
---

# Phase 143 - Research

## Code Map

| Area | Files | Current Capability | Phase 143 Use |
| --- | --- | --- | --- |
| Calibration CLI | `app/scripts/run-cenbrap-calibration.ts` | Writes live or template calibration JSON/contact sheet | Execute without `--template`; verify that output is truly live |
| Live service | `app/src/server/olhar-calibration/service.ts` | Lists workspaces, selects Cenbrap campaigns, reads derivations and decision events | Produce real Cenbrap sections from `DATABASE_URL` |
| Metric domain | `app/src/server/olhar-calibration/cenbrap-calibration.ts` | Builds rows, metrics, sample guidance and contact sheet | Classify missing verdicts, package eligibility and sample status |
| Release evidence | `app/src/server/olhar-calibration/olhar-release-evidence.ts` | Converts calibration into release-facing evidence | Do not refresh claims yet; use as compatibility check only |
| Existing evidence | `.planning/phases/142-cenbrap-calibration-and-release-evidence/*` | Template calibration, template evidence, contact sheet shell | Replace or explicitly explain why replacement is blocked |
| Milestone audit | `.planning/milestones/v12.7-MILESTONE-AUDIT.md` | Source of tech-debt truth and operator actions | Phase 143 starts from its blockers, not from roadmap optimism |

## Existing Building Blocks

- `run-cenbrap-calibration.ts` defaults to:
  - `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json`
  - `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md`
- The CLI accepts `--workspace-id`, `--all-workspaces`, `--output`, `--contact-sheet` and `--template`.
- `service.ts` considers all workspaces when no workspace id is passed.
- `matchCenbrapCampaign` keeps campaign selection conservative.
- `buildCenbrapCalibrationReport` already emits sample guidance and missing-data counters.
- `renderContactSheetMarkdown` is the operator-facing bridge into Phase 144.

## Operational Risk

| Risk | Why It Matters | Required Handling |
| --- | --- | --- |
| `DATABASE_URL` missing or pointed to empty/local DB | Script can emit template fallback and still finish | Record `db_unavailable` or `no_live_database` blocker; do not call it pass |
| Fewer than two Cenbrap campaigns | Cannot satisfy CENLIVE-02 | Record `insufficient_campaigns` with observed count |
| Campaigns exist but no output derivations | Jhonatan has nothing to judge | Record `no_output_derivations` and route campaign/output generation follow-up |
| Derivations lack `olharVerdict` or `exportStatus` | Old rows cannot prove dual verdict behavior | Count as `missing_dual_verdict`; do not infer |
| Decision events already exist but are not Jhonatan decisions | Agreement metric would be polluted | Keep decision capture for Phase 144; identify existing events as source candidates only |
| Contact sheet leaks prompt/media secrets | Evidence artifact becomes unsafe | Verify safe refs only; no signed URL, no prompt payload |

## Live Run Acceptance Shape

`142-CENBRAP-CALIBRATION.json` should be considered usable for Phase 144 only when:

- `mode` is `live`;
- `metrics.evaluatedCampaignCount >= 2`;
- at least one reviewable derivation row exists;
- rows expose safe ids/refs, `olharVerdict`, `exportStatus`, package eligibility and override marker;
- missing verdict rows are explicit in metrics or row status;
- `sampleGuidance` remains honest if the sample is still small.

If those conditions fail, Phase 143 can still complete only with a blocker artifact that names the exact failure and next operator action.

## Recommended Phase Shape

1. Run a readiness check that confirms whether a live database is configured without printing secret values.
2. Execute the live calibration script without `--template`.
3. Inspect the produced JSON and contact sheet for live mode, campaign count, decision count and safe evidence.
4. Classify all missing dual-verdict rows and insufficient-campaign states.
5. Write `143-LIVE-RUN.md` and, when needed, `143-BLOCKERS.md`.

## Open Questions for Execution

- Which environment should be treated as canonical for `DATABASE_URL`: local `.env.local`, shell env, staging, or production?
- Should Phase 143 update the existing Phase 142 artifact paths in place, or keep a timestamped Phase 143 copy plus a synced canonical file?
- If there are enough campaigns but not enough dual verdict rows, should execution regenerate QA/verdicts in Phase 143 or hand that to a follow-up phase?
