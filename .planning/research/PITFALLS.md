# Domain Pitfalls

**Domain:** Adding beta learning loops, product analytics, and evidence-driven friction fixes to an existing creative SaaS (ADScale v11.8)  
**Researched:** 2026-06-07  
**Overall confidence:** HIGH (grounded in shipped v11.4–v11.7 code + operator runbook; MEDIUM for industry patterns from WebSearch)

## Critical Pitfalls

Mistakes that cause rewrites, invalid learning conclusions, or privacy incidents.

### Pitfall 1: Instrumenting After Sessions Start

**What goes wrong:** Operator runs 1–2 beta sessions before `product_events` / `beta_sessions` exist. Cockpit abandonment, credit surprises, and readiness overrides are lost forever; learning questions (Q1–Q10) cannot be answered from data.

**Why it happens:** Pressure to "just run beta" while dashboard work is deferred; assumption that `feedback_reports` + mission insights are "enough."

**Consequences:** Anecdotal fixes, no funnel baseline, milestone fails its "learn before build" gate.

**Prevention:**
- Ship server-side event ingest at API boundaries (readiness POST, preview queue, batch queue, share create) **before** session 1.
- Gate operator runbook step 1 on a smoke event appearing in owner export.
- Treat `67-BETA-RUNBOOK.md` session setup as blocked until instrumentation checklist passes.

**Detection:** Empty `product_events` rows for a workspace that completed a cockpit path; operator notes with stage tags but no matching events.

**Roadmap phase:** Instrumentation & event schema (P1 — must precede operator sessions).

---

### Pitfall 2: Conflating Qualitative Feedback With Funnel Analytics

**What goes wrong:** Mission insights (`category: mission` in `feedback_reports`), free-text feedback, and funnel counts are merged into one "health score" without schema separation. Owner dashboard shows high "healthy" mission credit signals while users still abandon preview.

**Why it happens:** v11.7 reused `feedback_reports` for mission insights (correct for triage); v11.8 adds quantitative funnels without a distinct `product_events` layer.

**Consequences:** Over-weighting prompt dismissals as success; under-counting silent drop-off (users who never submit insight prompts).

**Prevention:**
- Keep **events** (stage entered/completed/abandoned, credit delta) in `product_events`.
- Keep **opinions** (sentiment, optional text) in `feedback_reports` / mission insights.
- Dashboard shows both side-by-side; never derive funnel conversion from insight sentiment alone.
- Correlate via optional `feedback_report_id` on frustration events, not merged tables.

**Detection:** Funnel shows 0% preview completion but mission credit signals show `healthyCount > 0`; operator reports "they loved it" with no `preview_approved` event.

**Roadmap phase:** Owner dashboard & aggregation (P1).

---

### Pitfall 3: Operator-Assisted Sessions Inflate Success Metrics

**What goes wrong:** Operator guides users through readiness blocks, picks recipes, and explains credits. Funnel shows 100% mission completion; unassisted users would stall at the same steps.

**Why it happens:** v11.8 is explicitly operator-led; no `session_mode` or `operator_present` dimension on events.

**Consequences:** False confidence in cockpit UX; fixes target wrong friction (polish vs self-serve clarity).

**Prevention:**
- Add `beta_sessions` with `operator_id`, `cohort_label`, `assistance_level` (hands-on / observe-only).
- Tag events with `session_id`; analysis defaults to operator sessions but flags steps where operator clicked on behalf of user.
- Runbook requires operator to note "user vs operator action" for blocking steps.
- Learning doc answers must state: "under operator assistance."

**Detection:** Median time draft → share is 2× runbook estimate only when operator is absent; all sessions have identical paths.

**Roadmap phase:** Operator session entity & runbook execution (P1).

---

### Pitfall 4: Privacy Leakage via CSV Export and Small Cohorts

**What goes wrong:** Owner exports events + feedback to CSV for 3–5 beta users. Columns include `userId`, `optionalText`, route breadcrumbs, or workspace names — re-identification is trivial at n=3.

**Why it happens:** Export built for debugging convenience; k-anonymity not considered for operator-scale cohort.

**Consequences:** Violates v11.4 privacy handoff intent; beta users' creative workflow details exposed in spreadsheets.

**Prevention:**
- CSV export uses **pseudonymous session labels** (`session_01`, `workspace_hash`); no email, no full diagnostic JSON.
- Strip `optionalText` from bulk export; link to `/feedback` detail for qualitative review.
- Enforce minimum cohort size (n≥3) before showing cross-workspace aggregates; show "insufficient data" otherwise.
- Reuse existing sanitize rules: no prompts, tokens, signed URLs in events.

**Detection:** Export file contains `@` in user columns or prompt substrings in properties.

**Roadmap phase:** Owner dashboard & CSV export (P1); Privacy review before first export.

---

### Pitfall 5: Fixing Friction Before Evidence Threshold

**What goes wrong:** Team ships 5 UX fixes after one loud session or one feedback report, without frequency/impact rubric. Changes confound the learning loop (variable changes mid-experiment).

**Why it happens:** SaaS instinct to "ship fast"; operator empathy overrides milestone cap.

**Consequences:** Cannot attribute improvement; remaining sessions measure different product; scope creep into speculative features.

**Prevention:**
- Rubric: fix only if **≥2 sessions** show same stage drop-off OR **blocking runbook step** OR **high-severity feedback** with matching events.
- Cap at 5 fixes; defer rest to v11.9 backlog with evidence links.
- No AI model / generation behavior changes — copy, validation, CTA, credit display only (per FEATURES anti-features).
- Each fix references `session_id` + event IDs in PR description.

**Detection:** Friction-fix PRs merge before 3 sessions complete; fixes touch unrelated modules.

**Roadmap phase:** Evidence-driven friction fixes (P1 — **after** dashboard + ≥3 sessions).

---

### Pitfall 6: Trusting Inferred Mission Completion as Ground Truth

**What goes wrong:** `inferMissionCompletions` marks `guided_briefing` complete when any campaign has objective + audience, `strategy_recipe` when formats exist on campaign — without user actually using cockpit modals. Funnel shows missions "done" while users skipped guided briefing.

**Why it happens:** Progression v11.7 optimized for activation signals, not strict cockpit path fidelity.

**Consequences:** Mission conversion funnel lies; wrong prioritization vs stage events.

**Prevention:**
- Funnel **primary source** = `product_events` with explicit `mission_*` / `cockpit_*` stage keys.
- Use inferred completion only as secondary "workspace maturity" indicator, labeled "inferred."
- Add events at modal open/confirm/skip for guided briefing, recipe, preview gate.

**Detection:** `guided_briefing` mission complete in progression API but zero `briefing_*` events in session.

**Roadmap phase:** Instrumentation hooks in campaign workspace (P1).

---

## Moderate Pitfalls

### Pitfall 7: localStorage Insight Gating Skews Sample

**What goes wrong:** `hasMissionInsightBeenPrompted` gates per **browser**, not per workspace/session. Operator testing on same machine never sees prompts again; second beta user on shared demo laptop gets no prompts.

**Why it happens:** Phase 70 chose localStorage to avoid prompt fatigue (INS-04).

**Prevention:**
- Analytics must not treat "no mission insight row" as satisfaction.
- For v11.8, prefer server-side `product_events` for `insight_prompt_shown` / `insight_dismissed`.
- Document localStorage limitation in learning answers; optionally scope storage key by `workspaceId` if changing gating.

**Roadmap phase:** Instrumentation (P1); optional insight gating fix if data gap proven.

---

### Pitfall 8: Silent Insight Capture Failures

**What goes wrong:** `MissionInsightProvider` swallows API errors (`catch { // Non-blocking }`). Owner sees low insight volume; assumes users are happy.

**Prevention:**
- Log `mission_insight.client_failed` with requestId (no body).
- Monitor error rate during beta; cross-check with stage events.
- Do not use insight volume as sole frustration signal.

**Roadmap phase:** Instrumentation observability (P2).

---

### Pitfall 9: Breadcrumb Diagnostics Lost on Reload

**What goes wrong:** v11.4 breadcrumbs are in-memory (20 entries, reset on full page reload). Abandonment analysis from feedback diagnostics misses steps before reload.

**Prevention:**
- Persist cockpit stage transitions in `product_events` server-side.
- Do not rely on feedback `diagnosticContext.breadcrumbs` for funnel drop-off.

**Roadmap phase:** Instrumentation (P1).

---

### Pitfall 10: Credit Surprise Attribution Errors

**What goes wrong:** Single "credit_friction" moment conflates readiness rerun, preview, and batch estimate mismatch. Learning Q8 ("where do credit surprises happen") stays unanswered.

**Prevention:**
- Emit separate events: `credit_estimate_shown`, `credit_spent`, with `surface: readiness | preview | batch`.
- Include `estimated_credits` and `actual_credits` on spend events where API authoritative.
- Map to runbook credit table in `67-BETA-RUNBOOK.md`.

**Roadmap phase:** Instrumentation at preflight/spend gates (P1).

---

### Pitfall 11: Workspace Isolation Breaks in Owner Global View

**What goes wrong:** Platform owner sees all workspaces on `/feedback` without filtering; cohort funnel accidentally mixes beta workspace A with internal dogfood B.

**Prevention:**
- `beta_sessions.cohort_label` + `workspace_id` filter on all aggregations.
- Default dashboard to active beta cohort only.
- CSV export requires explicit cohort selection.

**Roadmap phase:** Owner dashboard (P1).

---

### Pitfall 12: Migration Lag Produces Empty Progression Funnel

**What goes wrong:** Operator runs sessions before `0032_workspace_progression.sql` applied in target env. Mission path empty; false "0% mission start."

**Prevention:**
- Runbook prerequisite checklist (already in v11.7.1 handoff).
- Dashboard shows migration status warning if `workspace_progression` row missing for beta workspace.

**Roadmap phase:** Operator session prep (P1).

---

### Pitfall 13: Whack-a-Mole Friction Fixes Without Regression Tests

**What goes wrong:** Fix readiness false positive by loosening gate; preview quality regressions. Or copy change breaks PT-BR parity.

**Prevention:**
- Each friction fix adds focused test (mirror v11.5 fixture pattern where applicable).
- Run `npm test` + build before session N+1.
- No prompt/model changes in friction-fix phase.

**Roadmap phase:** Friction fixes (P1).

---

### Pitfall 14: Answering Learning Questions With Navigation Metrics Only

**What goes wrong:** Team answers Q4–Q6 ("does preview predict batch satisfaction?") using click funnels, not **output acceptance** (approve vs regenerate vs reject rates).

**Why it happens:** Traditional SaaS analytics bias (per AI beta playbook — MEDIUM confidence).

**Prevention:**
- Track `derivation_approved`, `derivation_rejected`, `regeneration_requested` per session after preview.
- Operator notes batch satisfaction explicitly in session log.
- Q5 requires paired preview + batch outcomes in same `session_id`.

**Roadmap phase:** Learning questions synthesis (P1).

---

## Minor Pitfalls

### Pitfall 15: Third-Party Analytics Sprawl

**What goes wrong:** Someone adds PostHog/GA4 mid-milestone for "better charts." Conflicts with cookie banner (`analytics: false` default), duplicates first-party events, triggers privacy review delay.

**Prevention:** Stick to first-party `product_events` per STACK.md; defer vendor until cohort > ~20 workspaces.

**Roadmap phase:** Instrumentation (scope guard).

---

### Pitfall 16: Sentry Sample Rate Hides Correlated Failures

**What goes wrong:** `tracesSampleRate: 0.1` — operator cannot find trace for reported issue.

**Prevention:** Use Sentry for errors only; product funnel in Postgres. Bump sample rate temporarily during beta week if needed.

**Roadmap phase:** Operator session support (P2).

---

### Pitfall 17: Over-Instrumenting Before Metrics Contract

**What goes wrong:** 50 event types, no one knows which answer Q1–Q10. Dashboard noise.

**Prevention:** Start with event list in FEATURES.md "Mapping to v11.6 Learning Questions" (~15 core events). Add events only when a learning question lacks signal.

**Roadmap phase:** Instrumentation schema design (P1).

---

### Pitfall 18: Operator Notes Unstructured

**What goes wrong:** Free-form session notes don't map to runbook stages; can't join to events.

**Prevention:** Structured fields per `67-BETA-RUNBOOK.md` stage table; store in `beta_sessions.stage_notes` jsonb keyed by stage.

**Roadmap phase:** Operator session entity (P1).

---

### Pitfall 19: Gamification Confound on Skip Signals

**What goes wrong:** Users skip missions to explore UI; `mission_skipped` counted as frustration via `classifyMissionInsightSignal`.

**Prevention:** Interpret skips with `missionKey` + subsequent stage events; distinguish "skip to proceed" vs "skip from confusion."

**Roadmap phase:** Dashboard interpretation guide (P2).

---

### Pitfall 20: Double-Counting Prompt Actions

**What goes wrong:** `markMissionInsightPrompted` runs before API success; dismiss records signal but localStorage blocks retry; event + insight both fire for same moment.

**Prevention:** Idempotency key on insight ingest; event log `insight_prompt_shown` once per session+moment server-side.

**Roadmap phase:** Instrumentation (P2).

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|----------------|------------|
| **Event schema & server ingest** | Logging prompts/PII in `properties` jsonb | Allowlist keys; mirror `mission-insights/sanitize.ts` patterns |
| **Event schema & server ingest** | Client-only capture for credit/readiness | Hook at API route + Inngest handler — server authoritative |
| **Campaign workspace hooks** | Modal open without complete/abort events | Emit `stage_entered` + `stage_completed` \| `stage_abandoned` |
| **beta_sessions table** | Sessions not linked to events | Require `session_id` on all events during operator window |
| **Operator runbook execution** | Sessions before instrumentation | Hard gate in runbook + checklist artifact |
| **Operator runbook execution** | Operator does steps for user | `assistance_level` + structured notes |
| **Owner funnel on `/feedback`** | Mixing feedback volume with conversion | Separate panels: Events funnel vs Feedback triage |
| **CSV export** | Raw user content in export | Pseudonymous columns; qualitative drill-down in app only |
| **Cohort aggregation** | n=3 statistical overconfidence | Show counts + qualitative weight; label "directional only" |
| **Friction fixes (≤5)** | Fix before ≥2 session evidence | Enforce rubric in phase plan acceptance criteria |
| **Friction fixes (≤5)** | Generation/model changes | UX/copy/validation/credit display only |
| **Learning questions doc** | Answering from inference not events | Each answer cites event counts + session IDs |
| **Privacy audit** | CSV + small cohort re-ID | Minimum cohort threshold; no optionalText in export |

## Integration Pitfalls (ADScale-Specific)

| Integration point | Risk | Prevention |
|-------------------|------|------------|
| `feedback_reports` ← mission insights | Category drift if API bypassed | Keep Zod + sanitize boundary; no raw SQL inserts |
| `workspace_progression` snapshots | Stale snapshot vs live events | Events are source of truth for v11.8 funnel |
| `mission-credit-signals` API | Becomes pseudo-dashboard without events | Extend, don't replace, new funnel API |
| `use-campaign-workspace.ts` hooks | Missing instrumentation on skip paths | Audit all `maybePromptMissionInsight` call sites for matching events |
| Credit preflight / `CREDIT_COSTS` | Estimate ≠ actual not visible | Log both on spend |
| Creative readiness panel | False positive blocks not recorded | `readiness_blocked` + operator override event |
| Share link / approval package | Q7 hand-holding invisible | `share_link_opened_external` vs `share_created` |
| Better Auth workspace scope | Cross-tenant leak in owner aggregate | Always filter `workspace_id` |
| Render migration timing | Events table missing in prod | `npm run db:migrate` in preDeploy before sessions |

## Prevention Strategy (Milestone-Level)

1. **Metrics contract first** — Map ≤15 events to `67-LEARNING-QUESTIONS.md` before writing migrations.
2. **Instrumentation → sessions → dashboard → fixes → answers** — Strict ordering; no parallel "quick fixes" during sessions 1–3.
3. **Two lanes of truth** — `product_events` for behavior, `feedback_reports` for voice; correlate, don't merge.
4. **Session envelope** — Every beta run tied to `beta_sessions.id` with operator metadata.
5. **Evidence rubric for fixes** — ≥2 sessions or blocking severity; max 5; no AI model changes.
6. **Privacy by export design** — Pseudonymous CSV; qualitative detail stays in owner triage UI.
7. **Label inference** — Progression/mission inference secondary to explicit stage events.
8. **Write learning answers last** — Populate template only after ≥3 sessions with event citations.

## Warning Signs During Beta

| Signal | Likely problem |
|--------|----------------|
| Dashboard funnel empty but users completed cockpit | Instrumentation not deployed or wrong `workspace_id` |
| 100% mission completion, operators report confusion | Inference heuristics or operator-assist inflation |
| High feedback, flat funnel | Qualitative lane overweighted |
| Flat feedback, bad funnel | Insight gating / silent API failures |
| Fixes merged before session 3 | Evidence threshold violated |
| CSV has emails or long text fields | Export privacy failure |
| Learning doc cites "feel" not counts | Questions unanswered by data |

## Sources

- ADScale shipped code: `MissionInsightProvider.tsx`, `mission-insights/storage.ts`, `progression/missions/evidence.ts`, `feedback/mission-credit-signals.ts`, `/feedback` triage page
- `.planning/phases/56-verification-and-privacy-audit/56-HANDOFF.md` — privacy boundaries
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` — operator path
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md` — decision gate
- `.planning/research/FEATURES.md`, `.planning/research/STACK.md` — v11.8 instrumentation plan
- [AI Product Beta Playbook](https://udit.co/blog/raw/ai-product-beta-launch-strategy) — output-layer instrumentation, acceptance rate (MEDIUM confidence)
- [Google Cloud — Continuous Evaluation](https://cloud.google.com/blog/topics/developers-practitioners/from-vibe-checks-to-continuous-evaluation-engineering-reliable-ai-agents) — whack-a-mole fixes, confirmation bias (MEDIUM confidence)
- [Privacy-First Analytics for Hosted Apps](https://solitary.cloud/designing-privacy-first-analytics-for-hosted-applications-a-) — aggregate early, small cohort thresholds (MEDIUM confidence)

---
*Pitfalls research for: v11.8 Beta Learning Loop*  
*Researched: 2026-06-07*
