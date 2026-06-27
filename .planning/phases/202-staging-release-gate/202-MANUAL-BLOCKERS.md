# Phase 202 Manual Blockers

**Status:** closed — requirements waived by product owner on 2026-06-27

The values below remain historically accurate but no longer block v13.8. They were accepted as permanent milestone debt and must not be rewritten as completed evidence.

## Cannot automate in local dev

| Gap | Blocker | Operator action |
|-----|---------|-----------------|
| Human staging walks | No staging credentials in agent environment | Run `docs/staging/guided-journeys-v13-8-runbook.md` on staging |
| Operational sample (≥5 guided starts) | Zero starts in `200-EVIDENCE.json` | Observe real starts; set `operationalSample.guidedStarts` ≥ 5 |
| Live Inngest lifecycle | Unverified | Confirm one action to completion/failure; update `inheritedDebt.liveInngestLifecycle` |

## Evidence file updates

Edit `.planning/phases/200-real-staging-evidence-and-release-gate/200-EVIDENCE.json`:

```json
{
  "stagingEvidence": {
    "status": "recorded",
    "paths": [
      { "path": "existing_creative", "status": "pass", "note": "..." },
      { "path": "from_zero", "status": "pass", "note": "..." }
    ]
  },
  "operationalSample": {
    "status": "sufficient",
    "guidedStarts": 5
  },
  "inheritedDebt": {
    "liveInngestLifecycle": "verified",
    "note": "Action completed/failed with job ref"
  }
}
```

## Gate commands

```bash
cd app && npm run v13-8-release-gate          # must exit 0 without bypass
```

Current result (2026-06-27): **blocked** (staging pending) without `--allow-pending-staging`; **pass** with bypass.
