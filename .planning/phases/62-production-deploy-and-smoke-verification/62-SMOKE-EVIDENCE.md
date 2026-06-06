# Smoke Test Evidence — v11.6 (scaffold)

**Local only — gitignored. Do not commit.**

## Metadata

| Field | Value |
|-------|-------|
| Deploy ref (SHA) | `b09fbe9` (origin/main at scaffold time; confirm in Render Events) |
| Date (UTC) | 2026-06-05 |
| Operator | _(pending)_ |
| Production URL | `https://adscale.jhonatansoares.com` |
| Migration verify | ☐ pending — run `npm run verify:migration-0027` in Render Shell |
| Offline preflight | ☐ partial — audit PASS; migration SKIP (no DATABASE_URL); health FAIL (DNS from agent env) |
| Checklist version | [`production-smoke-checklist.md`](../../../docs/ops/production-smoke-checklist.md) |

## Offline preflight output (sanitized)

```
Step A: migration audit — PASS (28 journal entries, ends 0027_fine_morlun)
Step B: migration 0027 — SKIP (DATABASE_URL not set locally)
Step C: health check — FAIL (fetch failed from CI/agent network)
```

## Env inventory summary

| Variable group | Status | Notes |
|----------------|--------|-------|
| _(fill from Render Dashboard)_ | pending | See `docs/ops/production-env-inventory.md` |

## Migration result

| Column | Present |
|--------|---------|
| creative_contract | pending |
| prompt_provenance | pending |
| regeneration_correction_brief | pending |

## Results (browser smoke)

| ID | pass/fail | Notes | Debug IDs | Sanitized log excerpt |
|----|-----------|-------|-----------|---------------------|
| SMK-01a | pending | | | |
| SMK-01b | pending | | | |
| SMK-01c | pending | | | |
| SMK-01d | pending | | | |
| SMK-01e | pending | | | |
| SMK-01f | pending | | | |
| SMK-01g | pending | | | |
| SMK-01h | pending | | | |
| SMK-01i | pending | | | |
| SMK-01j | pending | | | |
| SMK-01k | pending | | | |
| SMK-01l | pending | | | |
| SMK-01m | pending | | | |
| SMK-01n | pending | | | |
| SMK-01o | pending | | | |

## Defects

_(none recorded yet)_

## Sign-off

| | |
|-|-|
| Overall result | ☐ PASS ☐ FAIL |
| Operator signature | |
| Next action | Complete Render checkpoint (Task 2), then browser smoke (Task 3) |
