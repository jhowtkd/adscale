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
| `prompt-builder.ts` | Load voice by `clientProfileId`; merge corpus_quality section |
| `derivationJob` | Pass `clientProfileId` to voice + rules loaders; log applied IDs |
| `buildBrandTasteProfile` | Accept corpus evaluation signals in addition to calibration_signals |
| `/feedback` owner panel | Add brand selector + calibration sub-panel |

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
