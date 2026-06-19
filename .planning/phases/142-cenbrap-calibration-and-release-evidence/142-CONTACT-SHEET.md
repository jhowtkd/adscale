# Phase 142 — Cenbrap Calibration Contact Sheet

Captured: 2026-06-19T17:17:02.985Z
Status: insufficient_sample
Mode: live

## Calibration authority

Jhonatan's `entra`, `quase`, and `nao_entra` decisions are the calibration authority in Phase 142.
System `olharVerdict` and `exportStatus` values are evidence being calibrated — not the final truth.
Rows without operator decisions stay `manual_pending` until entered below.

## Sample guidance

- **Cenbrap art-direction agreement rate**: 0/5 (need 5 more)

## Metrics snapshot

- Campaigns: 2
- Derivations: 2
- Operator decisions: 0
- Agreement rate: withheld (insufficient comparable decisions)
- Missing dual verdict rows: 0
- Missing human decision rows: 2

## Row readiness (Phase 144 gate)

| Readiness | Count | Notes |
|-----------|------:|-------|
| `review_ready` | 2 | Requires `olharVerdict` + `exportStatus` + safe `outputRef` |
| `missing_dual_verdict` | 0 | All derivation rows have dual verdict |
| `missing_output_ref` | 0 | All rows have safe `derivation:` output refs |
| `manual_pending` | 2 | Awaiting Jhonatan's `entra/quase/nao_entra` decisions |

**Phase 143 history:** First live run (2026-06-19T16:44:10Z) had `evaluatedCampaignCount=0` — see [143-BLOCKERS.md](../143-live-cenbrap-calibration-run/143-BLOCKERS.md). Corpus seeding in Phase 144-01 resolved `insufficient_campaigns`.

**Source labels:** Both campaigns are `synthetic_fixture` — operational calibration only, not real customer evidence. Agreement rate and quality claims remain withheld.

## Campaign: Cenbrap Calibration — NR1 Convite

- Campaign ID: `676e1c08-0813-4f1e-adff-0e96c01e6a57`
- Client: Cenbrap
- Client profile: —
- Selection signals: client_contains_cenbrap, campaign_name_cenbrap, campaign_name_nr1

| derivation | outputRef | olharVerdict | exportStatus | packageEligible | override | humanDecision | mismatchReason | reviewer | reviewedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
`a92788f7` | derivation:a92788f7-18d7-4289-99eb-bab8a0fa2f80 | pronta | ajuste_menor | yes | no | manual_pending | — | — | —

### Manual decision capture

For rows still marked `manual_pending`, record Jhonatan's decision and mismatch reason here before closing Phase 142:

#### Derivation `a92788f7-18d7-4289-99eb-bab8a0fa2f80`
- humanDecision: manual_pending
- mismatchReason: 
- reviewer: Jhonatan
- reviewedAt: 

## Campaign: Cenbrap Calibration — NR1 Gestalt

- Campaign ID: `9d338b9a-e15a-4029-ae95-728c17e77c3a`
- Client: Cenbrap
- Client profile: —
- Selection signals: client_contains_cenbrap, campaign_name_cenbrap, campaign_name_nr1

| derivation | outputRef | olharVerdict | exportStatus | packageEligible | override | humanDecision | mismatchReason | reviewer | reviewedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
`01faf2a6` | derivation:01faf2a6-7808-406b-aeff-efd0169be9a1 | quase | ok | yes | no | manual_pending | — | — | —

### Manual decision capture

For rows still marked `manual_pending`, record Jhonatan's decision and mismatch reason here before closing Phase 142:

#### Derivation `01faf2a6-7808-406b-aeff-efd0169be9a1`
- humanDecision: manual_pending
- mismatchReason: 
- reviewer: Jhonatan
- reviewedAt: 

