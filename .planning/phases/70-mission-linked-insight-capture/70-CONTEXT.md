# Phase 70: Mission-Linked Insight Capture - Context

**Gathered:** 2026-06-06
**Status:** Implemented

<domain>
## Phase Boundary

Phase 70 captures structured beta learning at mission moments (readiness, preview, rejection, regeneration, share/export) without blocking workflow. Insights reuse the feedback_reports pipeline with mission-specific metadata and owner triage visibility.

This phase does not implement credit cost display (Phase 71).

</domain>

<decisions>
## Implementation Decisions

### Storage model
- Reuse `feedback_reports` with `category: "mission"` and `type: "other"`.
- Mission metadata lives in `diagnosticContext.source = "mission_insight"` plus moment, missionKey, sentiment, reason, action, optionalText.
- No new DB migration — category is free-form text validated at API boundary.

### Prompt UX
- Lightweight bottom sheet dialog (non-blocking, dismissible).
- One prompt per workspace per moment (localStorage gate).
- Skip/dismiss still records a product signal (INS-04).

### Moments
- `readiness_first`, `preview_first`, `rejection_first`, `regeneration_first`, `export_first`, `share_first`, `mission_skipped`, `credit_friction`.

### Owner visibility
- Extend `/feedback` triage with mission category filter and insight summary panel.

### Sanitization
- Extend feedback sanitize patterns; mission-specific allowlist for diagnostic fields.
- Tests assert no secrets, prompts, or unrelated user content leak through.

</decisions>

<code_context>
## Integration Points

- `app/src/server/mission-insights/` — sanitize, service
- `app/src/app/api/workspace/mission-insights/route.ts`
- `app/src/components/mission-insights/` — provider + prompt UI
- `app/src/lib/mission-insights/` — types, storage, reasons
- Emission hooks in readiness, derivations, review, regenerate, export, share, mission skip, credit friction
- `app/src/app/(dashboard)/feedback/page.tsx` — owner triage

</code_context>

---

*Phase: 70-mission-linked-insight-capture*
