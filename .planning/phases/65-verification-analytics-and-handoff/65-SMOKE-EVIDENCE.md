# Smoke Test Evidence — v11.6 Creative Strategy Cockpit

**Operator-owned browser verification (CQA-02)**

## Metadata

| Field | Value |
|-------|-------|
| Milestone | v11.6 Creative Strategy Cockpit |
| Date (UTC) | 2026-06-05 |
| Operator | _(pending production run)_ |
| App URL | `https://adscale.jhonatansoares.com` (or staging) |
| Git ref at test | `a41de15` (update after deploy) |
| Automated preflight | 55 cockpit tests pass locally |

## Cockpit path checklist

| ID | Step | pass/fail | Notes |
|----|------|-----------|-------|
| SMK-C01 | Open campaign draft workspace | pending | |
| SMK-C02 | Upload base creative | pending | |
| SMK-C03 | Run Creative Readiness → see 6 dimensions | pending | |
| SMK-C04 | Blocking issues appear above suggestions | pending | |
| SMK-C05 | Rerun readiness after brief edit | pending | |
| SMK-C06 | Guided briefing on weak brief (one question at a time) | pending | |
| SMK-C07 | Accept / edit / skip suggestions → form fields update | pending | |
| SMK-C08 | Derivar opens strategy recipe panel (3 recipes) | pending | |
| SMK-C09 | Recipe tradeoff copy visible | pending | |
| SMK-C10 | Override recipe settings | pending | |
| SMK-C11 | Generate preview → credit line visible | pending | |
| SMK-C12 | Preview gate: approve batch or revise recipe | pending | |
| SMK-C13 | Batch queued → preview gate hidden | pending | |
| SMK-C14 | Approve derivations | pending | |
| SMK-C15 | Create client approval package + share link | pending | |
| SMK-C16 | Public share page loads signed assets | pending | |
| SMK-C17 | Stale badge after rejection → refresh package | pending | |

## Offline automated evidence (2026-06-05)

```
cd app
npm test -- [cockpit matrix — see 65-HANDOFF.md]
→ 14 files, 55 tests passed

npm run lint → 0 errors
npm run build → PASS
```

## Sign-off

| | |
|-|-|
| Automated CQA-01 | ☑ PASS |
| Browser CQA-02 | ☐ pending operator |
| Overall | ☐ PASS ☐ FAIL |
