# Feature Landscape

**Domain:** Operator-guided beta learning loop for creative SaaS (cockpit + Ads Scientist progression)  
**Researched:** 2026-06-07  
**Milestone:** v11.8 Loop de Aprendizado Beta  
**Confidence:** HIGH for gaps vs existing build; MEDIUM for industry patterns (verified via multiple SaaS analytics sources, applied to ADScale's 3–5 session scale)

## Context: What Already Exists

v11.8 is a **measurement-and-fix** milestone, not a greenfield product. The following are shipped and should be **extended**, not replaced:

| Module | Shipped in | What it provides today |
|--------|-----------|------------------------|
| Beta runbook + stage tags | v11.6.1 (`67-BETA-RUNBOOK.md`) | Operator session script; feedback mapped to cockpit stages |
| Learning questions | v11.6.1 (`67-LEARNING-QUESTIONS.md`) | 10 decision-gate questions (readiness, recipe/preview, delivery/credit, process) |
| Feedback capture + triage | v11.4 | `feedback_reports`, `/feedback` owner list/detail, status, private notes |
| Mission insights | v11.7 | Structured prompts at 8 moments; stored as `category=mission` in `feedback_reports` |
| Mission credit signals | v11.7 | `summarizeMissionCreditSignals()` — healthy vs frustration counts on `/feedback` |
| Mission completion inference | v11.7 | 11 missions inferred from DB records (campaigns, derivations, exports, shares) |
| Cockpit workflow | v11.6 | Readiness → guided briefing → recipe → preview → batch → approval package |
| Progression ladder | v11.7 | Ads Scientist status from evidence keys |

**Gap:** Mission completion is **binary per workspace** (inferred from durable records). There is **no first-class funnel event stream**, **no per-stage abandonment timestamps**, **no cohort comparison**, and **no CSV export** for owner synthesis. Learning questions Q1–Q10 cannot be answered reliably from today's data alone.

---

## Table Stakes

Features users (operators and product owner) expect for a credible operator-run beta. Missing these = sessions produce anecdotes, not decisions.

| Feature | Why Expected | Complexity | Notes | Learning Qs |
|---------|--------------|------------|-------|-------------|
| **Operator session ledger** | Runbook exists but notes are ad-hoc; 3–5 sessions need comparable structure | Low | Extend runbook with per-session template: workspace ID, cohort tag, operator, start/end, pass/fail per stage, 2–3 quotes. Can start as markdown + later DB row. | Q10 |
| **Stage-tagged structured notes** | BETA-02 already maps stages; operator needs one place to file stage + severity without hunting `/feedback` | Low | Reuse `feedback_reports` with `category` + `diagnosticContext.cockpitStage` OR operator-only session note API. Links to existing triage. | All |
| **Cockpit funnel by workspace** | Owner must see where beta users stall (readiness → briefing → recipe → preview → batch → share) | Medium | Derive from existing tables + new lightweight `product_events` or stage-transition log. Align stages with `MISSION_ORDER` / runbook. | Q1–Q6, Q10 |
| **Mission conversion rate** | Milestone explicitly requires mission funnel instrumentation | Medium | % workspaces reaching each of 11 missions; time-to-complete between missions. Builds on `inferMissionCompletions()` — add **first-seen timestamps** and **abandonment** (active mission unchanged >N days). | Q10 |
| **Credit friction by stage** | Q8 asks where surprises happen; `credit_friction` moment exists but isn't stage-scoped | Low–Med | Extend mission insight / event payload with `cockpitStage` + `creditAction` (readiness_rerun, preview, batch_estimate). Extends `mission-credit-signals.ts`. | Q7–Q9 |
| **Readiness signal capture** | Q1–Q3 need override/rerun/false-positive data | Medium | Log: blocking issues shown, user proceeded anyway, rerun count, cached vs fresh analysis. Source: readiness API + campaign `creativeDiagnosis*` fields. | Q1–Q3 |
| **Recipe & preview outcomes** | Q4–Q6 need default vs chosen recipe and preview→batch path | Medium | Log: default recipe, selected recipe, override flags, preview approved/revised/abandoned, preview quality gate pass/fail. Source: derivation flow + `creative_plans`. | Q4–Q6 |
| **Share & approval package signals** | Q7, Q9 need delivery-path evidence | Low–Med | Log: share link created, public page opened (optional), package refresh triggered, stale badge seen. Source: `share_links`, approval package APIs. | Q7, Q9 |
| **Owner dashboard at `/feedback`** | PROJECT.md requires owner dashboard with actionable signals | Medium | Extend existing page: cohort filter, funnel summary cards, mission conversion strip, link to friction backlog. **Not** a new nav surface. | All |
| **CSV export** | Owner needs offline synthesis and stakeholder sharing | Low | Export filtered `feedback_reports` + aggregated funnel/mission metrics. Privacy: no prompts, no raw assets. | All |
| **Friction backlog (≤5 fixes)** | Milestone caps scope at evidence-driven fixes | Low (process) / Med (fixes) | Triage view: cluster by stage + frequency + severity; top 5 become fix tickets. Uses existing report status + internal notes. | Decision gate |
| **Learning-question answer sheet** | BETA-03 questions are the decision gate; answers must be explicit | Low | Template mapping each Q1–Q10 to metrics + qual quotes + verdict (pass/fail/inconclusive). Filled after 3–5 sessions. | All |

---

## Differentiators

Features that make this beta loop **actionable** rather than a generic analytics dump. Valuable at 3–5 sessions; not table stakes for all SaaS betas.

| Feature | Value Proposition | Complexity | Notes | Learning Qs |
|---------|-------------------|------------|-------|-------------|
| **Cohort comparison** | Compare operator-guided vs self-serve (or cohort A/B) funnels side-by-side | Medium | Tag workspaces at session start (`beta_cohort` on workspace or session ledger). Owner sees conversion delta per stage. | Q4–Q6, Q10 |
| **False-positive readiness index** | Surfaces Q1 directly: blocking rules vs operator judgment | Medium | Ratio: `(proceeded_despite_block + operator_override_note) / total_readiness_runs`. Highlights rules to relax. | Q1 |
| **Briefing skip heatmap** | Answers Q2: which guided questions get skipped | Medium | Per-question skip/accept/edit counts from guided briefing UI events. | Q2 |
| **Preview confidence score** | Answers Q5: preview approved but batch dissatisfied | Medium–High | Correlate `preview_first` sentiment (mission insight) with post-batch review/rejection/regeneration within same campaign. | Q5 |
| **Time-to-share SLA panel** | Answers Q10 with median and p90 | Medium | Timestamps: campaign draft created → first share link. Stall detector: longest gap between consecutive stages. | Q10 |
| **Actionable signal cards** | Owner sees "3 credit surprises at preview" not raw tables | Low–Med | Preset aggregations on `/feedback` (extends credit signals pattern). Each card links to underlying reports. | Q7–Q9 |
| **Evidence-linked fix proposals** | Each of ≤5 fixes cites session IDs + metrics | Low (process) | Fix template: friction, frequency, impact, learning Q affected, minimal diff scope. Enforces "learn before build." | Decision gate |
| **Operator replay checklist** | After instrumentation ships, operator re-runs one session to validate signals | Low | UAT path proving dashboard numbers match session reality. Prevents shipping broken instrumentation. | — |

**Opinion:** For 3–5 operator sessions, **first-party DB-derived funnel + structured qual notes** beats third-party product analytics (PostHog, Mixpanel). Session count is too small for statistical funnels in external tools; owner needs **workspace-level traceability** tied to cockpit stages, which external autocapture cannot map without heavy custom events anyway.

---

## Anti-Features

Features to explicitly **NOT** build in v11.8.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full PostHog/Mixpanel/Amplitude rollout** | Overkill for 3–5 sessions; duplicates workspace-scoped data; privacy review for creative assets | First-party events table or derived queries from existing schema |
| **Session replay / heatmaps (Hotjar, FullStory)** | High PII risk with ad creatives; LGPD not in scope | Operator notes + mission insights at moments |
| **Real-time streaming dashboard** | No ops team watching live; adds infra | Daily owner review of `/feedback` + CSV |
| **New cockpit or progression mechanics** | Milestone forbids speculative features | Instrument and fix only |
| **Public self-serve beta invite flow** | Operator-only scope; dilutes signal | Operator schedules 3–5 sessions per runbook |
| **ML clustering / NLP on feedback** | n too small; engineering distraction | Manual clustering in friction backlog |
| **Automated fix prioritization** | False confidence from tiny sample | Owner ranks by frequency × impact × learning-Q weight |
| **New gamification / mission rewards** | v11.7 shipped; v11.8 is learn-not-expand | Use existing mission completion as funnel proxy |
| **Billing / Stripe changes** | Out of scope; confounds credit learning | Log credit friction; don't change pricing |
| **Broad event taxonomy (50+ events)** | Noise; violates "1–2 key metrics" early-stage discipline | ~15–20 stage-aligned events covering runbook path |
| **User-facing analytics** | Beta users don't need funnel dashboards | Owner-only `/feedback` |
| **Fixes without evidence threshold** | Scope creep | Require ≥2 sessions or ≥2 workspaces showing same friction |

---

## Feature Dependencies

```
Existing: feedback_reports (v11.4)
    → mission insights (v11.7) → credit signals summary
    → operator session ledger (NEW)
    → stage-tagged notes (NEW, may reuse feedback_reports)

Existing: mission evidence inference (v11.7)
    → mission conversion metrics (NEW timestamps/abandonment)
    → cockpit funnel (NEW stage transitions)

Existing: cockpit APIs (v11.6)
    → readiness/recipe/preview instrumentation (NEW events or DB fields)
    → share/approval package signals (NEW)

Cohort tag (NEW)
    → cohort funnel comparison (DIFFERENTIATOR)
    → CSV export filters

Instrumentation (table stakes)
    → owner dashboard widgets
    → learning-question answer sheet
    → friction backlog
    → ≤5 evidence-driven fixes (LAST)
```

**Critical path:** Instrumentation → dashboard/export → 3–5 sessions → answer sheet → ≤5 fixes.

**Module touchpoints (implementation hint, not scope commitment):**

| Dependency | Extend |
|------------|--------|
| `app/src/server/progression/missions/evidence.ts` | Mission timestamps, abandonment |
| `app/src/server/feedback/mission-credit-signals.ts` | Stage-scoped credit signals |
| `app/src/app/(dashboard)/feedback/page.tsx` | Funnel cards, cohort filter, CSV |
| `app/src/components/mission-insights/` | Optional `cockpitStage` on payloads |
| `app/src/components/workspace/*` | Readiness/recipe/preview event emission |
| `67-BETA-RUNBOOK.md` | Session ledger template |

---

## Mapping: Features → v11.6 Learning Questions

| # | Question | Primary features | Signal type |
|---|----------|------------------|-------------|
| Q1 | Readiness blocking vs operator judgment | Readiness signal capture, false-positive index, stage notes | Quant + qual |
| Q2 | Guided briefing skips | Briefing skip heatmap, funnel drop at `guided_briefing` | Quant |
| Q3 | Readiness rerun / credit sensitivity | Readiness rerun count, credit friction at readiness | Quant |
| Q4 | Default vs chosen recipe | Recipe outcome logging, cohort funnel | Quant |
| Q5 | Preview predicts batch satisfaction | Preview confidence score, preview→batch funnel | Quant + qual |
| Q6 | Tradeoff copy read vs override | Override-without-dwell proxy, operator notes | Qual-heavy |
| Q7 | Share links without hand-holding | Share signals, time-to-share | Quant |
| Q8 | Credit surprise location | Credit friction by stage, credit signal cards | Quant |
| Q9 | Stale approval package understood | Package refresh events, operator notes | Quant + qual |
| Q10 | Median draft → share; stall points | Time-to-share SLA, cockpit funnel, mission conversion | Quant |

**Decision gate (from `67-LEARNING-QUESTIONS.md`):**

- Q4–Q6 dominate → next milestone prioritizes recipe/preview iteration  
- Q7–Q9 dominate → delivery/billing UX before new AI  
- Q1–Q3 dominate → readiness/briefing accuracy before new surfaces  

v11.8 must produce the **evidence pack** that triggers this gate — not pre-choose the winner.

---

## MVP Recommendation (v11.8)

**Prioritize (ship before first beta session):**

1. Cockpit funnel + mission conversion (workspace-scoped, stage-aligned)  
2. Readiness + recipe/preview + credit-by-stage instrumentation  
3. Owner dashboard extensions on `/feedback` + CSV export  
4. Operator session ledger + learning-question answer template  

**Run in parallel with sessions 1–3:**

5. Cohort tags and actionable signal cards  
6. Briefing skip + false-positive readiness (if Q1–Q3 hypothesized hot)  

**After session 3 (decision checkpoint):**

7. Friction backlog → ≤5 fixes ranked by evidence  
8. Fill learning-question answer sheet  
9. Operator replay UAT on instrumentation accuracy  

**Defer:**

- Third-party analytics integration  
- Preview confidence ML/correlation (manual cross-tab OK for n≤5)  
- Automated E2E of full Ads Scientist path (listed in REQUIREMENTS future)  
- Public beta onboarding campaign  

---

## Industry Patterns (Applied to ADScale)

Early-stage SaaS beta loops that work at small n share these traits (MEDIUM confidence — multiple 2025 SaaS analytics sources; adapted to 3–5 session scale):

1. **One primary funnel, not fifty metrics** — ADScale's funnel is the runbook path (11 missions / 7 cockpit stages).  
2. **Quant finds where; qual finds why** — DB funnel + mission insights + operator notes; avoid session replay.  
3. **Structured session scripts** — Runbook already exists; add ledger for comparability.  
4. **Synthesis → capped actions** — Cluster friction, max 5 fixes, explicit learning-Q verdict.  
5. **Instrument before debating roadmap** — Aligns with "learn before build" decision in PROJECT.md.

---

## Sources

- `.planning/PROJECT.md` — v11.8 milestone scope and constraints  
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md` — decision gate Q1–Q10  
- `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` — stage taxonomy, credit expectations  
- `.planning/phases/70-mission-linked-insight-capture/70-CONTEXT.md` — mission insight moments and storage  
- `app/src/server/feedback/mission-credit-signals.ts` — existing credit signal classification  
- `app/src/server/progression/missions/definitions.ts` — mission order and prerequisites  
- [Attribution App — SaaS Analytics Tools 2025](https://www.attributionapp.com/blog/saas-analytics-tools/) — funnel + qual combo (MEDIUM)  
- [Statsig — SaaS Funnel Analysis 2025](https://www.statsig.com/comparison/saas-funnel-tools) — drop-off → action pattern (MEDIUM)  
- [Jamy AI — User Research Scripts](https://www.jamy.ai/blog/user-research-scripts/) — structured operator sessions (MEDIUM)  
- [Accoil Product Tracking Skills](https://developer.accoil.com/docs/product-tracking-skills) — anti-patterns: noise events, PII, premature broad taxonomy (HIGH for principles, LOW for ADScale-specific application)
