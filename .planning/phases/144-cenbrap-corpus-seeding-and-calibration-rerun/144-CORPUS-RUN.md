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

## Campaign minimum gate

_Pending seed execution — see Task 144-01-03 update below._
