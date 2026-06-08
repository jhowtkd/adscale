# Feature Landscape: v11.11 Aprendizado → Ação

**Domain:** Beta learning data → actionable product improvements (readiness tuning, stall reduction, share-link self-serve)
**Researched:** 2026-06-08
**Milestone context:** Converting SESS-03 real-session data into three targeted improvements — readiness threshold tuning (post-F-11 override signals), UX interventions for the ~38 min post-preview stall (F-07), and share link self-serve analytics + improvements (F-13). Also closes learning Q2/Q3/Q9 and adds dashboard metrics for median draft→share time and assistance-level correlation.

---

## What Already Exists (do NOT rebuild)

Confirmed in codebase and phase summaries before writing this document:

| Capability | Location | Status |
|------------|----------|--------|
| Readiness score: 6 dimensions, BLOCKING=50, READY=70 | `creative-readiness.ts:45-46` | ✓ Built |
| Readiness override via PATCH preflight (`action: overridden`) | Phase 86 — `preflight/route.ts` | ✓ Built |
| `ReadinessOverrideSignal` aggregate in owner dashboard | `aggregate.ts:277`, `OwnerAnalyticsPanel.tsx:340` | ✓ Built |
| Override event: `readiness_blocked { action: overridden }` | Phase 86 | ✓ Built |
| Uncapped session timeline, credit-by-stage funnel | Phase 87 — `OwnerAnalyticsPanel.tsx` | ✓ Built |
| `recipe_selected` event + funnel row in dashboard | Phase 85 | ✓ Built |
| Share link creation (POST `/api/share`) + gallery page (`/share/[token]`) | `share/route.ts`, `share/[token]/page.tsx` | ✓ Built |
| Share page recipient guide, notes, gallery grid | `share/[token]/page.tsx:91-106` | ✓ Built |
| `mission_completed { missionKey: "share" }` event on share creation | `share/route.ts:39` | ✓ Built |
| `guided_briefing` abandon event (no step breakdown) | Phase 85 | ✓ Built |
| Readiness rerun (preflight re-trigger) | `CreativeReadinessPanel.tsx` | ✓ Built |
| `buildBetaSessionSummary` timing data | `aggregate.ts` | ✓ Built |

---

## Table Stakes

Features users/operators expect. Missing = v11.11 cannot close its learning questions.

### TS-1: Share link open tracking (`share_link_opened` event)

**Why expected:** F-13 asks "do clients use share links without hand-holding?" Without a server-side open event, Q7 (assistance-level correlation) has no denominator — we can't tell if the link was ever opened, let alone opened autonomously. The share page route already exists; one analytics call is all that's missing.

**What to build:**
1. In `app/src/app/share/[token]/page.tsx` (server component), call `recordBetaAnalyticsEvent` after `validateShareToken` succeeds. Event key: `"share_link_opened"`. Properties: `{ campaignId, tokenId: token.substring(0, 8) }` (no PII). Source: `"server"`. `workspaceId` from link data; `sessionId` is null (unauthenticated).
2. Add `"share_link_opened"` to `PHASE_76_BETA_EVENT_KEYS` (or a v11.11 extension constant).
3. Add `"tokenId"` to `ALLOWED_PROPERTY_KEYS` (truncated token, non-PII).
4. In `aggregate.ts`, add `ShareLinkSignal`: group `share_link_opened` events by `campaignId`, count unique opens per campaign.
5. Owner dashboard: "Share link opens" column in the cockpit funnel table or a dedicated small panel (open count, campaigns with ≥1 open).

**Complexity:** Low-Medium — unauthenticated server component can call server-side analytics (no user/session context available; fire-and-forget pattern matches existing `void recordBetaAnalyticsEvent(…).catch(…)`). Four files: event key, allowed properties, aggregate, dashboard panel.

**Dependencies:** `recordBetaAnalyticsEvent` accepts nullable `userId` and `sessionId` (verify signature). Link's `workspaceId` is available from `validateShareToken` return ✓.

---

### TS-2: Post-preview stall analysis in owner dashboard

**Why expected:** Q10 identified a ~38 min stall after preview but only from a single fixture session. SESS-03 generates real session data; the owner needs a view that surfaces campaigns stuck in the post-preview state across sessions. Without this, the stall remains anecdotal and v11.11 has no evidence base for UX interventions.

**What to build:**
1. In `aggregate.ts`, add `PostPreviewStallSignal`: for each session, compute `stall_ms = timestamp(batch_generation_started OR session_ended) − timestamp(cockpit_stage_completed: "preview")`. If gap > 15 min and batch was started, classify as "stall-then-proceed". If gap > 15 min and session ended without batch, classify as "stall-then-abandoned".
2. Aggregate: median stall, stall rate (sessions with stall / sessions with preview completed), stall→proceed rate.
3. Owner dashboard: "Post-preview stall" panel — median stall time, stall rate, and a list of campaigns with active post-preview stalls (preview done, batch not started, last activity > 15 min ago).

**Complexity:** Medium — requires event timestamp comparison across two event types within a session. The session grouping and timeline are already available; this is a derived aggregate on top of existing data.

**Dependencies:** `cockpit_stage_completed` for preview stage must be accurately instrumented (F-06 from Phase 85 ✓). Batch generation start event must exist or be inferred from `credit_spend { stage: "batch" }`.

---

### TS-3: Readiness override breakdown by dimension in dashboard

**Why expected:** Phase 86 built the override workflow and the `ReadinessOverrideSignal` aggregate, but the aggregate groups overrides by workspace/campaign — not by *which dimension* triggered the block. To tune thresholds, the owner needs to know whether overrides cluster around `offerClarity`, `textLegibility`, `ctaProminence`, etc. Without per-dimension breakdown, threshold tuning is guesswork.

**What to build:**
1. In `preflight/route.ts`, when emitting the override event, include `blockingDimensions: string[]` — the list of dimension IDs with score < BLOCKING_SCORE_THRESHOLD at override time.
2. Add `"blockingDimensions"` to `ALLOWED_PROPERTY_KEYS`.
3. In `aggregate.ts`, extend `ReadinessOverrideSignal` with a `dimensionBreakdown: Record<ReadinessDimensionId, number>` field — count overrides per dimension.
4. Owner dashboard: in the readiness override signals panel, add a dimension bar or table showing which dimensions are overridden most.

**Complexity:** Medium — requires passing dimension scores through the override PATCH handler. The dimension data is already computed in `buildCreativeReadiness`; it needs to be preserved at the override call site.

**Dependencies:** Override PATCH handler must have access to the preflight result at override time (may require refetching preflight from DB or passing in request body). Verify `preflight/route.ts` Phase 86 implementation.

---

### TS-4: Learning answers Q2/Q3/Q9 — closure with real session data

**Why expected:** Q2 (guided briefing skip patterns), Q3 (readiness rerun rate), and Q9 (stale approval package badge understanding) are currently "TBD" in `79-LEARNING-ANSWERS.md`. These cannot be answered with fixture data; they require real SESS-03 sessions. Closing them is the epistemic goal of v11.11.

**What to build (operational + minimal code):**
- Q2: `cockpit_stage_abandoned { stage: "guided_briefing", stepId }` was instrumented in Phase 85. Update LEARNING-ANSWERS with real session citations.
- Q3: Count `readiness_blocked` events per campaign in real sessions (multiple rerun = high credit sensitivity). Owner dashboard: "readiness rerun rate" metric (already in aggregate; needs citation in answers).
- Q9: Observe `stale_badge_viewed` or operator notes. If no event exists, add `"approval_package_refreshed"` event on the "Refresh" action in the delivery panel and document findings.

**Complexity:** Low (code for Q9 event if missing) / Operational (update answer doc with session citations).

**Dependencies:** SESS-03 sessions must complete first. Q9 code is conditional on whether a refresh event exists in the delivery panel.

---

## Differentiators

Features that go beyond the baseline; high-value when combined with SESS-03 evidence.

### D-1: Readiness threshold algorithm tuning

**Why valuable:** The current `BLOCKING_SCORE_THRESHOLD = 50` and `READY_SCORE_THRESHOLD = 70` are arbitrary starting values (v11.6). Post-F-11 override data reveals which threshold is calibrated wrong. Adjusting one constant can eliminate false positives for an entire dimension class without touching UI — the highest-leverage tuning action in the milestone.

**What to build:**
1. After TS-3 data is available: identify dimensions with override rate > 50%. For those dimensions, raise the blocking threshold 5–10 points (e.g., `ctaProminence` from 50 → 40 if rarely truly blocking).
2. Change is a code constant update in `creative-readiness.ts:45-46`, plus a migration note in LEARNING-ANSWERS.
3. Before/after comparison: record pre-tuning override rate from SESS-03, run 1–2 post-tuning sessions, confirm override rate drops.

**Complexity:** Low (code change) / Medium (requires evidence gate: TS-3 data must exist and show clear dimension clustering). Do not tune without data.

**Dependencies:** TS-3 (dimension breakdown in dashboard). Minimum 3 SESS-03 sessions with at least 2 override events across sessions for statistical grounding.

---

### D-2: Post-preview "continue batch" nudge on campaign card

**Why valuable:** The ~38 min stall likely reflects the operator losing context after preview — returning to the campaign list and not knowing which campaign is awaiting batch approval. A small "Preview done — start batch?" badge on the campaign card surfaces the pending decision without requiring the operator to open the cockpit.

**What to build:**
1. Campaign list query: add a derived status `"preview_done_pending_batch"` — campaign has a completed preview derivation but no `credit_spend { stage: "batch" }` event in the last 24h.
2. Campaign card UI: add a subtle amber indicator or chip "Continue → batch" that links directly to the cockpit at the post-preview step.
3. No new backend infrastructure — derive status client-side from campaign + derivation metadata already loaded.

**Complexity:** Low-Medium — requires checking derivation status (at least one preview-mode derivation in `approved` state) plus absence of batch generation. Status derivation can be done from existing campaign+derivations query.

**Dependencies:** TS-2 (stall analysis confirms the nudge is warranted; don't build a nudge without evidence the stall is real across sessions). Derivation `generationMode` field distinguishes preview vs batch ✓.

---

### D-3: Share link assistance-level correlation in owner analytics

**Why valuable:** F-13 asks whether share links are self-serve or require hand-holding. The `assistance_level` property is already recorded on beta sessions. Correlating `share_link_opened` events (TS-1) with the session's `assistance_level` answers: "do sessions marked `autonomous` or `minimal_guidance` still result in link opens, or do only `hands_on` sessions drive client engagement?"

**What to build:**
1. In `aggregate.ts`, join `share_link_opened` events with the session's `assistance_level` tag (from session-level beta events or session metadata).
2. Compute: share-link open rate by assistance level (hands_on vs guided vs autonomous).
3. Owner dashboard: add a "Share link engagement" breakdown row to the existing session analytics section.

**Complexity:** Medium — requires joining two event streams (share open on share link route, session metadata on operator session). Sessions from share opens have no `sessionId`; join must be via `campaignId` + time window or via explicit session correlation in the share creation event.

**Dependencies:** TS-1 (share_link_opened event must exist). `assistance_level` must be stored on beta sessions from Phase 76/77 ✓.

---

### D-4: Dashboard — median draft→share time by assistance level

**Why valuable:** Q10 found median session time ~90 min from a single fixture. Real SESS-03 data should compute: median time from campaign creation to share link creation, broken down by assistance level. This surfaces whether assisted sessions are faster (operator does the work) or slower (client needs more hand-holding), and gives the owner a target for self-serve improvements.

**What to build:**
1. In `buildBetaSessionSummary`, compute `draftToShareMs` from first `cockpit_stage_entered { stage: "guided_briefing" }` to `mission_completed { missionKey: "share" }`.
2. Aggregate: median `draftToShareMs` overall and by `assistance_level`.
3. Owner dashboard: add "Median draft → share" stat card alongside the existing credit/readiness summary cards.

**Complexity:** Low — `buildBetaSessionSummary` already computes timing fields. This is a new derived metric + one stat card.

**Dependencies:** SESS-03 sessions must be present. `mission_completed { missionKey: "share" }` event fires at share creation ✓.

---

## Anti-Features

Features to explicitly NOT build in v11.11.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Client authentication on share page | Clients should review without creating accounts — friction kills self-serve | Keep share page fully public; track opens server-side (TS-1) |
| Email/push notifications for post-preview stall | Email infrastructure (Resend) not yet wired into transactional product flows | Use in-app nudge on campaign card (D-2); revisit email in a future milestone |
| Automated readiness threshold tuning (ML/heuristic loop) | Only 3–5 sessions of data — not enough signal for automation | Manual constant adjustment with evidence gate (D-1); automate when N > 50 sessions |
| Client approval/rejection from share page | Changes delivery contract (share is read-only by design; approval is operator's responsibility) | Revisit in a future "client collaboration" milestone if demand is validated |
| New cockpit stages or workflow surfaces | Confounds stall analysis — can't separate stall from confusion with a changed UI | Freeze cockpit shape; only add nudge on campaign card (D-2) |
| Share link expiry extension UI | Expiry is already generous; no evidence of expiry complaints from SESS-03 | If a session shows expiry friction, extend the constant; no UI needed |
| Credit model changes or new generation modes | Generation pipeline is stable; v11.11 targets data-driven UX, not AI changes | Defer to post-beta milestone |
| Third-party analytics SDK | Adds PII risk and complexity; beta scale doesn't require it | Continue with `beta_analytics_events` table |
| LGPD compliance work | Separate milestone, explicitly out of scope | Dedicated post-beta compliance milestone |

---

## Feature Dependencies

```
TS-1 (share_link_opened) → D-3 (assistance-level correlation)
TS-2 (post-preview stall analysis) → D-2 (campaign card nudge — confirm stall is real before building UX)
TS-3 (dimension breakdown) → D-1 (threshold tuning — need dimension data to tune)
SESS-03 real sessions → TS-4 (Q2/Q3/Q9 closure) → D-1 (threshold tuning evidence gate)
Phase 85 F-06 (preview funnel instrumentation) → TS-2 (stall start timestamp)
D-4 (draft→share median) → SESS-03 sessions (no synthetic data)
D-3 depends on D-4 for context (both use assistance_level correlation)
```

Order of operations:
1. TS-1 through TS-3 ship (analytics instrumentation) — no SESS-03 data needed
2. SESS-03 real sessions run (human gate)
3. TS-4 closes with citations, D-1 tunes thresholds, D-2 nudge confirmed by stall data
4. D-3 and D-4 aggregate in dashboard from real session events

---

## MVP Recommendation

Prioritize (in order):

1. **TS-1 share_link_opened event + dashboard panel** — closes F-13/Q7; low complexity; ships before sessions
2. **TS-3 override breakdown by dimension** — enables D-1; data needed from first real session; medium complexity
3. **TS-2 post-preview stall analysis panel** — surfaces F-07 evidence; confirms D-2 is warranted
4. **TS-4 Q9 approval refresh event** (if missing) — small code addition; rest of Q2/Q3/Q9 is operational
5. **D-4 median draft→share stat card** — low complexity; high signal value post-SESS-03
6. **D-1 threshold tuning** — wait for TS-3 dimension data; change is a 2-line constant update with evidence
7. **D-2 campaign card post-preview nudge** — wait for TS-2 stall confirmation; medium complexity; high operator UX value
8. **D-3 share link assistance-level correlation** — depends on TS-1 + session data; adds context to F-13 closure

Defer: Client approval on share page, email stall notifications — no evidence of demand and infrastructure not ready.

---

## Sources

- Codebase direct inspection: `app/src/server/ai/creative-readiness.ts`, `app/src/app/api/share/route.ts`, `app/src/app/share/[token]/page.tsx`
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md`
- `.planning/milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-LEARNING-ANSWERS.md`
- `.planning/phases/86-readiness-override/86-01-SUMMARY.md`
- `.planning/phases/87-owner-dashboard-polish/87-01-SUMMARY.md`
- `.planning/phases/89-sess-03-operator-uat/89-SESS-03-EVIDENCE.md`
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md`
- `.planning/PROJECT.md`
- Confidence: HIGH for table stakes (all assertions verified against live source files and phase summaries); MEDIUM for differentiators (dependent on SESS-03 evidence that does not yet exist)
