---
phase: 71-credit-activation-and-verification
plan: combined
subsystem: progression-billing
tags: [credits, missions, upgrade-gating, owner-signals, qa]
requires: [phase-68, phase-69, phase-70]
provides: [credit-aware-missions, owner-credit-signals, v11.7-qa]
affects: [MissionPathCard, workspace-missions-api, feedback-triage]
tech-stack:
  added: []
  patterns: [mission-credit-estimates, value-moment-upgrade-gating, insight-signal-classification]
key-files:
  created:
    - app/src/server/progression/missions/credits.ts
    - app/src/lib/progression/credit-activation.ts
    - app/src/components/dashboard/MissionCreditBanner.tsx
    - app/src/server/feedback/mission-credit-signals.ts
    - app/src/app/api/feedback/mission-credit-signals/route.ts
  modified:
    - app/src/server/progression/missions/service.ts
    - app/src/lib/progression/missions/types.ts
    - app/src/components/dashboard/MissionPathCard.tsx
    - app/src/app/(dashboard)/feedback/page.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json
decisions:
  - Batch mission shows minimum 3-variant credit estimate with "from" label
  - Upgrade CTA requires readiness+ value moment before any billing link
  - Owner healthy/frustration split uses mission_insight diagnostic classification
metrics:
  duration: "~45m"
  completed: "2026-06-06"
---

# Phase 71: Credit Activation and Verification Summary

**One-liner:** Mission path shows ad/credit cost and balance before generation, gates upgrade prompts after value moments, and gives owners healthy-vs-frustration credit signals with full QA matrix.

## What Shipped

1. **CRED-01/02** — Preview, batch, and regeneration missions expose estimated ads/credits; active panel shows remaining balance.
2. **CRED-03** — Billing upgrade link appears only after readiness+ value moment and on insufficiency/exhaustion.
3. **CRED-04** — Owner `/feedback` panel + API summarizing healthy vs frustration mission insights.
4. **QA-01..04** — 32 automated tests + `71-UAT-EVIDENCE.md` for progression-to-Analista path.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- feat(71-01): mission credit estimates and API enrichment
- feat(71-01): MissionCreditBanner and MissionPathCard credit UI
- feat(71-02): owner mission credit signals API and feedback panel
- test(71-02): credit activation and signal classification tests
- docs(71): verification, UAT evidence, and milestone completion

## Self-Check: PASSED

- All key files exist on disk
- 32/32 targeted tests passed
- Lint: 0 errors
