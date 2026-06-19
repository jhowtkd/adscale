---
phase: 144
slug: cenbrap-corpus-seeding-and-calibration-rerun
status: planning
created: 2026-06-19
---

# Phase 144 - Research

## Code Map

| Area | Files | Current Capability | Phase 144 Use |
| --- | --- | --- | --- |
| Live calibration | `app/scripts/run-cenbrap-calibration.ts` | Runs live or template; writes canonical JSON/contact sheet | Re-run after corpus seeding and verify `mode=live` |
| Campaign repository | `app/src/server/repositories/campaign.ts` | `createCampaign`, `getCampaigns`, campaign fields | Seed/import Cenbrap campaign records conservatively |
| Derivation repository | `app/src/server/repositories/derivation.ts` | `createDerivation`, `updateDerivationStatus`, `updateDerivationDualVerdict` | Ensure rows have output refs and dual verdict |
| DB schema | `app/src/server/db/schema.ts` | `workspaces`, `campaigns`, `derivations`, `outputDecisionEvents` | Understand minimum safe insert/update shape |
| Existing seed scripts | `app/scripts/seed-visual-foundations.ts`, `app/scripts/seed-testsprite.ts` | Idempotent local fixtures and manifest pattern | Reuse script shape, not TestSprite semantics |
| Phase 143 evidence | `.planning/phases/143-live-cenbrap-calibration-run/*` | Live run result, blockers, verification | Source of truth for why Phase 144 was replanned |

## Minimum Data Shape

For a row to become `review_ready`, it needs:

- campaign selected by Cenbrap signals:
  - campaign/client/client profile contains `cenbrap`; or
  - explicit Cenbrap campaign name such as NR1/Cenbrap campaign.
- derivation row:
  - same workspace/campaign;
  - `isPreview=false`;
  - `outputKey` present and safe;
  - status compatible with review (`completed`, `approved` or `rejected`);
  - `olharVerdict` present;
  - `exportStatus` present.

The calibration can include rows without decisions. It cannot ask for decisions without visible system verdict context.

## Existing Paths for Corpus

### Path A - Existing real campaigns

Search the connected DB for campaigns where client/name/profile should match Cenbrap but the current matcher missed them. If found, either improve selection signals or document the naming mismatch.

### Path B - Operator import / seed into calibration environment

Create a dedicated, idempotent operator seed/import script that:

- resolves a target workspace without printing secrets;
- creates or updates two Cenbrap campaigns;
- creates reviewable derivations with safe `outputKey` placeholders only when those outputs are acceptable as calibration artifacts;
- populates dual verdict payloads explicitly;
- writes a manifest under `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json`.

This is acceptable for operational calibration only if the artifact labels whether the rows are `real_customer`, `operator_imported`, or `synthetic_fixture`.

### Path C - Blocked

If the operator cannot provide a target workspace or campaign data, keep the milestone blocked with `operator_data_unavailable`. Do not fake review rows.

## Risks

| Risk | Why It Matters | Handling |
| --- | --- | --- |
| Synthetic rows look like real evidence | Claims become dishonest | Label corpus source on every artifact |
| Campaigns exist but matcher misses them | False `insufficient_campaigns` | Add an inspection query/report before seeding |
| Derivations lack output refs | Contact sheet cannot support review | Classify as `missing_output_ref` |
| Derivations lack dual verdict | Jhonatan sees rows without system context | Route to QA/regeneration first |
| Existing decisions pollute calibration | Phase 145 should capture explicit decisions | Keep decision count as observed, but do not treat it as Jhonatan approval unless reviewer/source matches |
| DB writes hit wrong environment | Could contaminate production | Require explicit env/source logging, no secret output |

## Recommended Implementation Shape

1. Add or run a corpus inspector that reports candidate Cenbrap campaigns and missing fields.
2. If none exist, add an idempotent operator seed/import script with a clear `--confirm` or dry-run default.
3. Ensure seeded/imported derivations include dual verdict payloads and safe output refs.
4. Re-run `run-cenbrap-calibration.ts` without `--template`.
5. Update contact sheet readiness and Phase 143/144 blockers.

## Validation Architecture

Automated:

- Inspector reports zero/current campaign count without leaking secrets.
- Seed/import script has dry-run and idempotency behavior.
- Focused tests for calibration still pass.
- Live rerun produces `mode=live`.
- JSON check confirms `evaluatedCampaignCount >= 2` and `review_ready > 0`, or blocker artifact exists.

Manual:

- Operator confirms target environment and corpus source label.
- Operator confirms synthetic/imported rows are acceptable for calibration scope.
- Jhonatan only proceeds to Phase 145 when contact sheet rows are visually reviewable.
