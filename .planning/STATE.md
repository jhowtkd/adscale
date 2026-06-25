---
gsd_state_version: 1.0
milestone: v13.5
milestone_name: Assistente Conversacional de Ações
status: executing
stopped_at: Completed 181-assistant-surface-03-PLAN.md
last_updated: "2026-06-25T21:15:57.596Z"
last_activity: 2026-06-25
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25 — v13.5 started)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v13.5 Assistente Conversacional de Ações — chat-first action flow with minimum contracts per action.

## Current Position

Phase: 181 of 183 (in progress)
Plan: 3 of 5 complete
Status: Ready to execute
Last activity: 2026-06-25

Progress: [#---------] 1/7 phases

## Performance Metrics

| Phase | Plans | Status |
|-------|-------|--------|
| 177 | 1/1 | Complete |
| 178 | 0/1 | Pending |
| 179 | 0/1 | Pending |
| 180 | 1/4 | In Progress |
| 181 | 1/5 | In Progress |
| 182 | 0/1 | Pending |
| 183 | 0/1 | Pending |
| Phase 177-multi-client-foundation P01 | 11 | 5 tasks | 24 files |
| Phase 180-action-contracts P02 | 5 | 2 tasks | 4 files |
| Phase 180-action-contracts P01 | 2 | 2 tasks | 9 files |
| Phase 180-action-contracts P03 | 8 | 2 tasks | 5 files |
| Phase 180-action-contracts P04 | 5 | 2 tasks | 5 files |
| Phase 181-assistant-surface P01 | 12 | 3 tasks | 9 files |
| Phase 181-assistant-surface P02 | 15 | 3 tasks | 11 files |
| Phase 181-assistant-surface P03 | 18 | 3 tasks | 13 files |

## Accumulated Context

### Decisions (v13.5)

- [v13.5]: The assistant is chat-first, not form-first; it asks for the minimum required for the next useful action.
- [v13.5]: Quick actions and complete campaign flow use separate action contracts.
- [v13.5]: Quick restyling must not require a full campaign brief.
- [v13.5]: Complete campaign flow still requires a stronger minimum brief before preview/batch generation.
- [v13.5]: Actions with write, credit, memory, export/package, or long-job impact require confirmed action cards.
- [v13.5]: Model provider is abstracted behind `AssistantModelClient`; MiniMax M3 is the first adapter.
- [v13.5]: Context sent to the provider is broad but allowlisted; do not send secrets, raw signed URLs, internal evidence payloads, or unrelated customer data.
- [v13.5]: Provider reasoning/thinking is not displayed and not persisted.
- [v13.5]: Review inside assistant reuses existing workspace review components rather than duplicating review logic.
- [v13.5]: Object model for the assistant is `Cliente > Campanha > Thread`; no new project/folder entity in this milestone.
- [Phase 177]: Brand kit ambiguity returns HTTP 409 instead of mutating an arbitrary profile.
- [Phase 177]: Mem0 isolation uses profile-suffixed user ids plus metadata filters on search.
- [Phase 177]: Legacy workspace brand-kit endpoints accept optional `clientProfileId` query/body field.
- [Phase 180]: Binary intent classifier runs server-side in orchestrator before model stream; ambiguous dual-match short-circuits with Portuguese clarify.
- [Phase 181]: campaignId=null query sentinel filters client-level assistant threads on GET /api/assistant/threads
- [Phase 181]: Assistant chat streaming uses fetch + readAssistantSseStream with AbortController, not EventSource

### Carry-forward from v13.4

- v13.4 shipped operational evidence infrastructure with accepted tech debt.
- Live operational pass remains pending: run live corpus seed on owner workspace with migrated DB, then refresh evidence and release gate.
- `172-EVIDENCE.json` remains the v13.3/v13.4 operational evidence artifact until live manifest exists.
- Customer-real claims remain blocked until operational evidence passes; v13.5 must not weaken claim honesty.

### Blockers/Concerns

- **Provider-data risk:** assistant context must be allowlisted from the start because v13.5 is customer-facing and multi-client.
- **Scope risk:** "idea to final package" is the happy path, not full workspace parity for every advanced edge case.
- **Operational tech debt:** live seed/smoke from v13.4 remains outside this milestone unless explicitly pulled in.

### Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v13.5+ | Meta/Google/TikTok integrations | Deferred | distribution after assistant operating loop |
| v13.5+ | Full workspace parity inside chat | Deferred | after happy path proves value |
| v13.5+ | Project/folder entity above campaign | Deferred | after usage data on Cliente > Campanha > Thread |
| v14+ | Manual approve/deprecate calibration rules | Deferred | after operational evidence closed |
| v14+ | Uncertainty queue routing automation | Deferred | needs real operating data |
| v14+ | Multi-brand evidence dashboard | Deferred | after first real profile proves path |

## Session Continuity

Last session: 2026-06-25T21:15:57.594Z
Stopped at: Completed 181-assistant-surface-03-PLAN.md
Resume file: None
Next command: `$gsd-execute-phase 181` plan 02
