# Research: v13.2 Architecture

## Question

How do multi-brand taste calibration features integrate with existing ADScale architecture?

## Current Integration Points

```
clientProfileId
    ├── resolveClientVoice() [HARDCODED → REPLACE]
    ├── buildBrandTasteProfile(signals)
    ├── listApprovedCalibrationRules(categories)
    ├── client_learning_proposals (corpus aggregator)
    └── prompt-builder sections
            ├── Olhar ADScale (global)
            ├── brand-taste rules (PROFILE/RULE categories)
            └── corpus_quality rules (NEW WIRING)
```

## New Components

| Component | Type | Responsibility |
|-----------|------|----------------|
| `client_profile_voice_config` | DB table | Structured voice: matchTerms, promptLines, olharOverlayRef, status |
| `voice-config-repository.ts` | Server module | CRUD + resolve by `clientProfileId` |
| `resolveBrandVoice()` | Function | Replace `resolveClientVoice` string matching |
| `BrandCalibrationPanel` | Owner UI | Per-brand profile, rules list, proposals queue |
| `corpus-proposal-aggregator.ts` | Server | Slice evaluations → `client_learning_proposals` |
| Cenbrap seed migration | One-time | Import `CENBRAP_VOICE` into config for existing profile |

## Modified Components

| Component | Change |
|-----------|--------|
| `client-voice.ts` | Delegate to DB config; deprecate `REGISTERED_VOICES` |
| `prompt-builder.ts` / `taste-loader` | Centralize section assembly; reorder to Olhar → voice → brand-taste → corpus_quality |
| `derivationJob` | Wire `getApprovedRuleConstraints` (brand-taste rules) — **gap today:** only `corpus_quality` loaded |
| `generation-direction.ts` | Resolve voice by `clientProfileId` from DB, not campaign name |
| `recordCalibrationSignal` | Wire from production review APIs, not only Cenbrap scripts |
| `buildBrandTasteProfile` | Optional corpus evaluation bootstrap into signals |
| `/feedback` or `/admin/quality/brands` | Per-brand profile, rules, proposals panel |

## Code Gaps Verified (2026-06-23)

| Gap | Location | v13.2 fix |
|-----|----------|-----------|
| Brand-taste rules not in generation | `derivation.ts` loads only `corpus_quality` | Phase 164: add `getApprovedRuleConstraints` |
| Prompt section order | Taste/corpus may inject before Olhar/voice | Phase 164: `taste-loader` with spec order |
| Calibration signals script-only | `record-cenbrap-calibration-decisions.ts` | Phase 163+: wire `recordCalibrationSignalFromOutputDecisionEvent` |
| Cenbrap triple hardcode | `resolveClientVoice`, `matchCenbrapCampaign`, calibration runners | Phase 162: single `clientProfileId` resolver |
| Fixture ack on accept | `proposals.ts` may lack design-spec acknowledgment | Phase 163: enforce on accept |

## Data Flow (target)

```
1. completed derivation
   → captureCorpusCandidate (v13.1)
   → auto-promote (0051)

2. owner evaluates in global corpus
   → human_quality_evaluation + feedback_artifact

3. aggregator (≥3 evals, |delta|≥15)
   → client_learning_proposal (proposed)

4. owner accepts proposal
   → calibration_rule (corpus_quality, approved)

5. next derivation for clientProfileId
   → load voice config + approved rules
   → prompt-builder injects sections
   → generation log records rule IDs
```

## Suggested Build Order

1. **Voice config schema + resolver** — unblock all brands; seed Cenbrap
2. **Cenbrap hardcode removal + parity tests** — no regression on existing flows
3. **Corpus → proposal aggregator wiring** — connect evaluations to proposals
4. **Accept → rule → prompt application** — close generation loop
5. **Owner UI per brand** — profile, rules, proposals (read + accept/reject)
6. **Evidence gates per brand** — extend claims matrix for multi-brand honesty

## Dependencies

- v13.1 global corpus evaluations (done)
- Migrations 0051/0052 (exist; verify applied in prod)
- `getHumanFailureCorrectionDirectives` for corpus_quality directive text
- `requirePlatformOwner` on all new routes

---
*Architecture research for: v13.2 Calibração Multi-Marca*
*Researched: 2026-06-23*
