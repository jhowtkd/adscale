# Phase 144 — Corpus Source Inspection and Seeding Run

## Environment Readiness

| Field | Value |
|-------|-------|
| `inspected_at` | 2026-06-19T19:00:00.000Z |
| `env_source` | `app/.env.local` |
| `secret_exposed` | false |
| `selected_source` | `app/.env.local` (scripts import `./load-env` first) |

### Source detection

| Source | `DATABASE_URL` |
|--------|----------------|
| Shell environment | absent |
| `app/.env.local` | present (value not recorded) |
| Root `.env.local` | not checked (calibration scripts use `app/.env.local`) |

No database connection string, credentials, prompts, or signed URLs appear in this document.

## Corpus Inspection (pre-seed)

Conservative Cenbrap matcher (`matchCenbrapCampaign`, score ≥ 3): `client` or client profile contains `cenbrap`, or campaign name includes supporting terms (`cenbrap`, `nr1`, `cenbrap em dobro`).

| Metric | Count |
|--------|------:|
| Workspaces scanned | 2 |
| Candidate Cenbrap campaigns | 0 |
| Campaigns with output derivations (`outputKey`, not preview) | 0 |
| Campaigns with dual verdict coverage (`olharVerdict` + `exportStatus`) | 0 |

### Workspace summary (safe)

| Workspace | Member email (label only) | Cenbrap candidates |
|-----------|---------------------------|-------------------:|
| Dev Admin's Workspace | dev@adscale.local | 0 |
| Example Test Creative Lab | visual-foundations@example.test | 0 |

### Matcher mismatch check

No campaigns contained Cenbrap-like client/profile/name signals that the matcher missed. The connected database is empty for Cenbrap calibration — consistent with Phase 143 `insufficient_campaigns`.

## Seeding decision

| Field | Value |
|-------|-------|
| `path` | B — operator seed into calibration environment |
| `reason` | Zero existing Cenbrap candidates; idempotent seed script required |
| `source_label` | `synthetic_fixture` (operational calibration only, not real customer evidence) |
| `target_workspace` | Dev Admin's Workspace (`dev@adscale.local`, first workspace by inspection order) |

## Seed execution

| Field | Value |
|-------|-------|
| `seeded_at` | 2026-06-19T17:11:33.464Z |
| `command` | `cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --confirm --workspace-email=dev@adscale.local` |
| `mode` | applied (`--confirm`) |
| `target_workspace` | Dev Admin's Workspace (`dev@adscale.local`) |
| `source_label` | `synthetic_fixture` |
| `manifest` | [144-CORPUS-MANIFEST.json](./144-CORPUS-MANIFEST.json) |

### Pre-seed migration note

Local `app/.env.local` database was missing `derivations.olhar_verdict` / `export_status` columns. Applied `drizzle/0047_derivation_dual_verdict.sql` before seeding (schema drift fix — no secrets logged).

## Campaign minimum gate

| Gate | Result |
|------|--------|
| Minimum campaigns (≥ 2) | **pass** — 2 matched |
| Matcher signals | `client_contains_cenbrap` + `campaign_name_cenbrap` + `campaign_name_nr1` on both |
| Output derivations | 2 campaigns × 1 derivation with safe `outputKey` |
| Dual verdict coverage | 2 derivations with `olharVerdict` + `exportStatus` |
| `operator_data_unavailable` blocker | **not triggered** |
| Phase 145 blocked by corpus | **no** — minimum gate met; live rerun (144-02) still required for `review_ready` |

### Seeded campaigns (safe summary)

| Campaign name | Source label | Olhar | Export | Output ref |
|---------------|--------------|-------|--------|------------|
| Cenbrap Calibration — NR1 Gestalt | synthetic_fixture | quase | ok | `derivation:01faf2a6-...` |
| Cenbrap Calibration — NR1 Convite | synthetic_fixture | pronta | ajuste_menor | `derivation:a92788f7-...` |

Full ids and keys are in `144-CORPUS-MANIFEST.json`. Rows are operational calibration fixtures — not real customer evidence.

## Verification (144-01)

```bash
test -f .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md
cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --dry-run
test -f .planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-MANIFEST.json
```

Post-seed inspection: 2 candidate campaigns, 2 with dual verdict coverage across 2 workspaces scanned.

## Dual-verdict readiness pass (144-02-01)

| Field | Value |
|-------|-------|
| `inspected_at` | 2026-06-19T17:15:49.288Z |
| `command` | `cd app && npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only` |
| `candidate_cenbrap_campaigns` | 2 |
| `campaigns_with_output_derivations` | 2 |
| `campaigns_with_dual_verdict_coverage` | 2 |

### Derivation row classification

| Metric | Count |
|--------|------:|
| Total candidate derivations (`outputKey`, not preview) | 2 |
| `review_ready` (dual verdict + safe `outputRef`) | 2 |
| `missing_dual_verdict` | 0 |
| `missing_olhar` | 0 |
| `missing_export` | 0 |
| `missing_both` | 0 |
| `missing_output_ref` | 0 |
| `legacy_derivation` | 0 |

### Per-campaign summary (safe)

| Campaign | Output derivations | Dual verdict | Package eligible | Source label |
|----------|-------------------:|:------------:|:----------------:|--------------|
| Cenbrap Calibration — NR1 Gestalt | 1 | yes (`quase` / `ok`) | yes | synthetic_fixture |
| Cenbrap Calibration — NR1 Convite | 1 | yes (`pronta` / `ajuste_menor`) | yes | synthetic_fixture |

All rows passed readiness inspection — no QA/regeneration routing required. Rows are `synthetic_fixture` operational calibration only, not real customer evidence.
