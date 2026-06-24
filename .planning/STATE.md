---
gsd_state_version: 1.0
milestone: v13.2
milestone_name: Calibração Multi-Marca
status: verifying
stopped_at: Completed 166-02-PLAN.md
last_updated: "2026-06-24T17:42:28.437Z"
last_activity: 2026-06-24
progress:
  total_phases: 11
  completed_phases: 10
  total_plans: 24
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-23)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Phase 166 — Per-Brand Evidence Gate

## Current Position

Phase: 166 of 167 (per-brand evidence gate)
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-06-24

Progress: [█████░░░░░] 1/2 plans in Phase 166

## Performance Metrics

**Velocity:** (v13.2 not started)

| Phase | Plans | Status |
|-------|-------|--------|
| 163 | 3/3 | Complete |
| 164 | 3/3 | Complete |
| 165 | 3/3 | Complete |
| 166 | 1/2 | In progress |
| Phase 162-per-brand-voice-configuration P02 | 12min | 2 tasks | 19 files |
| Phase 163 P0 | 0 | 0 tasks | 6 files |
| Phase 163-corpus-learning-proposals P01 | 5 | 3 tasks | 10 files |
| Phase 163-corpus-learning-proposals P02 | 6 | 2 tasks | 11 files |
| Phase 163-corpus-learning-proposals P03 | 16 | 3 tasks | 4 files |
| Phase 164-prompt-rule-application P01 | 8 | 3 tasks | 8 files |
| Phase 164-prompt-rule-application P02 | 5 | 2 tasks | 7 files |
| Phase 164-prompt-rule-application P03 | 3 | 2 tasks | 1 files |
| Phase 165-owner-calibration-panel P01 | 6 | 3 tasks | 6 files |
| Phase 165-owner-calibration-panel P02 | 4 | 3 tasks | 9 files |
| Phase 165-owner-calibration-panel P03 | 8 | 3 tasks | 5 files |
| Phase 166-per-brand-evidence-gate P01 | 3 | 2 tasks | 5 files |
| Phase 166-per-brand-evidence-gate P02 | 8 | 2 tasks | 6 files |

## Accumulated Context

### Decisions

- [v13.2]: Replace Cenbrap hardcode with per-clientProfile Olhar/voice configuration
- [v13.2]: Owner-only operation — no workspace admin or end-user calibration UI
- [v13.2]: Corpus global evaluations feed per-brand profiles and `corpus_quality` rules
- [v13.2]: Prompt-builder is primary generation impact surface
- [v13.2]: No freeform voice editor — inspectable profile + approved rules only
- [Phase 162-per-brand-voice-configuration]: Extracted voice-prompt-section.ts for shared prompt builder between hardcoded and DB-derived voices
- [Phase 162-per-brand-voice-configuration]: Upsert targets client_profile_id PK for idempotent Cenbrap seed
- [Phase 162-per-brand-voice-configuration]: buildDerivationPrompt async for DB voice lookup in generation-direction
- [Phase 162-per-brand-voice-configuration]: Review gate uses DB reviewStatus; no campaign string fallback for voice injection
- [Phase 163]: Enrich rows with feedbackArtifactId in generate before aggregate to keep buildClientLearningProposals pure
- [Phase 163]: Match approved corpus_quality rules via rationale prefix like cross-client.ts
- [Phase 163]: Extract buildLearningSliceBuckets for shared threshold logic between proposals and factual alerts
- [Phase 163]: Factual alerts computed on read via primaryFailureReason filter; no persistence table for v1
- [Phase 163]: Vertical slice test proves full corpus learning chain with mocked db; staging smoke operator-approved
- [Phase 164]: Brand-taste categories = all RULE_CATEGORIES except corpus_quality
- [Phase 164]: Corpus cap remains prompt-time slice until Plan 164-02 adds DB deprecation
- [Phase 164]: Auto-retry finalize merges both appliedBrandRuleIds and appliedCorpusRuleIds
- [Phase 164]: Accept-time corpus cap enforcement is primary; loader cap is legacy safety net
- [Phase 164]: Oldest corpus_quality deprecation uses approvedAt ASC with createdAt fallback
- [Phase 164]: Cross-profile isolation tested via mock-based two-profile fixture without TEST_DATABASE_URL
- [Phase 165]: Profile API adds fixtureOnly and corpusSignalsNote server-side for PANEL-04 honesty without client evaluateClaimsMatrix
- [Phase 165]: Rules API returns approved and candidate in parallel; rejected/deprecated excluded from panel read payload
- [Phase 165]: Panel-level profile 403 gate blocks tabs before child panels render (PANEL-05)
- [Phase 165]: calibration-status-copy uses neutral PT-BR labels; warning when fixtureOnly or zero real_customer
- [Phase 165]: LearningProposalsTab clientProfileId optional — corpus Learning tab unchanged
- [Phase 165]: Fixture-only proposal accept requires checkbox ack before POST acknowledgeFixtureOnly
- [Phase 166]: Dedicated GET .../evidence API — do not bloat profile cache
- [Phase 166]: Evidência tab on OwnerCalibrationPanel (separate from Profile)
- [Phase 166]: buildPerBrandEvidenceReport scopes claims per clientProfileId (fixes multi-brand aggregate bug)
- [Phase 166]: missingConditions PT-BR operator strings from taste-profile thresholds
- [Phase 166]: FIXTURE_ONLY_CAVEAT_PT duplicated server-side to match calibration-status-copy
- [Phase 166]: withheldClaims filters claimsBlocked to customer-real and commercial quality keys
- [Phase 166]: Dedicated fixture-caveat-banner in Evidência tab separate from status row bannerText
- [Phase 166]: Exported SOURCE_LABELS from BrandTasteProfilePanel for evidence source table reuse

### Blockers/Concerns

- 5 Jhonatan Cenbrap decisions still pending (carry-forward from v12.9)
- Fixture-only corpus — customer-real claims blocked until sample/source sufficiency
- Cenbrap parity regression risk during voice migration (Phase 162)

### Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v13.2+ | Workspace admin read-only calibration | Deferred | v13.2 scoping |
| v13.2+ | Freeform voice constitution editor | Deferred | v13.2 scoping |
| v13.2+ | Auto-prioritize uncalibrated brands | Deferred | v13.2 scoping |

## Session Continuity

Last session: 2026-06-24T17:42:28.433Z
Stopped at: Completed 166-02-PLAN.md
Resume file: None
