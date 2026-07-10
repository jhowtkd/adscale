# Marrow — Organ Deep Dive

> Character-level map of ADScale deep owner calibration (the lab).  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Upstream: [`HANDS.md`](./HANDS.md) · [`GAZE.md`](./GAZE.md) · Downstream: [`TASTE.md`](./TASTE.md) · Peer: [`NERVE.md`](./NERVE.md)  
> Code homes: `app/src/server/human-quality/` + `app/src/server/olhar-calibration/`  
> Atlas name: **Marrow**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Marrow is

Marrow is the **deep lab**. Platform owners sample failed or selected derivations, score them with a human rubric, generate learning proposals, accept calibration adjustments, and measure whether Gaze agrees with humans (Cenbrap / release evidence). Automated green ≠ live quality.

| Layer | Path |
|-------|------|
| Corpus contract | `human-quality/corpus.ts` |
| Capture / promote | `candidate-capture.ts`, `candidate-promotion.ts` |
| Queue + evaluate | `service.ts` |
| Bridge to Nerve/Taste | `human-decision-calibration.ts` |
| Learning proposals | `learning/generate.ts`, `learning/cross-client.ts` |
| Corpus → prompt rules | `learning/corpus-quality-prompt.ts`, `corpus-quality-cap.ts` |
| Rubric calibration | `calibration/*` |
| Apply ceilings | `improvement/apply.ts`, `improvement/service.ts` |
| Trends / impact / global evidence | `trend/`, `impact/`, `global-evidence*.ts` |
| Sampling guidance | `sampling/*` |
| Olhar lab | `olhar-calibration/` |
| Nightly cron | `jobs/learning-proposal-aggregator.ts` |
| Owner APIs | `api/feedback/human-quality-corpus/*`, `api/admin/quality/*`, `api/feedback/*` |

---

## 2. Thesis

> CI green is not proof of live creative quality.  
> Owner judgment is the calibration source.  
> Proposals are born from corpus evidence; **shipping** into gates/prompts requires explicit accept.  
> Privacy-safe payloads only — no leaking raw prompts/PII into the lab ledger.

---

## 3. Full lab cycle

```text
Hands + Gaze/Skin (fail / sample rule)
  → captureCorpusCandidateFromDerivation
  → (optional) promote candidate → corpus queue item
  → owner evaluates (intent, visual score, failure reasons, notes)
  → feedback artifact (privacy-safe)
  → recordHumanDecisionCalibrationEvidence
       · Nerve: output_decision_event (strict)
       · Taste: calibration signal
  → nightly / on-demand: generate client learning proposals
       · cross-client global proposals
       · factual_issue alerts
  → calibration compare (system vs human) → adjustment proposals
  → accept adjustments → buildApplyPlan → score ceilings / gate targets (±5 bound)
  → approved corpus_quality rules → Taste loader → Hands prompt

Parallel Gaze lab:
  runCenbrapCalibration / buildOlharReleaseEvidence
  → agreement rates, mismatch buckets, sample guidance
  → release checker (no false pass on missing human judgment)
```

---

## 4. Lobes

### 4.1 Capture

`candidate-capture.ts` — after quality gate in Hands, privacy-safe snapshot of derivation quality fields → `human_quality_corpus_candidates`.  
`candidate-promotion.ts` — promote into queue with cohort + source label.  
`source-label.ts` — `synthetic_fixture` | `operator_imported` | `real_customer`.

### 4.2 Corpus contract (`corpus.ts`)

| Concept | Values |
|---------|--------|
| Cohorts | `baseline` · `pre_learning` · `post_learning` |
| Item status | `pending` · `evaluated` · `removed` |
| Owner intents | `approve` · `reject` · `regenerate` |
| Failure reasons | `visual_overload`, `weak_hierarchy`, `generic_template_feel`, `illegible_cta`, `unfocused_composition`, `factual_issue`, `format_or_crop_issue`, `other` |

Also: quality snapshot shape, output-learning application snapshot (whether Nerve prefill was applied), validators for visual score / factual pass / privacy.

### 4.3 Evaluate (`service.ts`)

Select into corpus, list pending/queue (filters, cursors, progress), submit evaluation, attach feedback artifacts.  
Owner-facing via `api/feedback/human-quality-corpus/*`.

### 4.4 Learn (`learning/`)

| Module | Job |
|--------|-----|
| `generate.ts` | Aggregate evaluated rows → `client_learning_proposals` (slice = failure × mode × format × client); cooldown / min sample |
| `cross-client.ts` | Patterns across clients → global proposals |
| `factual-alerts.ts` | Surfaces `factual_issue` slices |
| `corpus-quality-prompt.ts` | Prompt section for approved corpus rules (max 10) |
| `corpus-quality-cap.ts` | Enforce cap / deprecate overflow |
| `directives.ts` / `proposals.ts` | Proposal shaping helpers |

Cron `0 6 * * *`: client proposals → cross-client → factual alert count.

### 4.5 Calibrate (`calibration/`)

Compare system scores/verdicts vs human evaluations; propose rubric/score adjustments; report versioning (`RUBRIC_CALIBRATION_VERSION`).  
Divergence flags when gaps exceed threshold.

### 4.6 Improve (`improvement/`)

`buildApplyPlan` from **accepted** adjustments only; `computeBoundedCeiling` clamps delta to **±5** within 0–100.  
Maps failure reasons → gate/score targets via `failure-bridge`.  
Re-evaluate / improvement reports for before/after arms.

### 4.7 Measure

| Module | Job |
|--------|-----|
| `trend/` | Quality trend over evaluated corpus |
| `impact/` | Learning applied vs not — slice metrics |
| `global-evidence*` | Cross-workspace evidence honesty |
| `sampling/` | Coverage, thresholds, guidance for “enough sample?” |

### 4.8 Olhar lab (`olhar-calibration/`)

| File | Job |
|------|-----|
| `cenbrap-calibration.ts` | Match Cenbrap campaigns; compare human decisions vs `olharVerdict` / `exportStatus` |
| `service.ts` | `runCenbrapCalibration` across workspaces |
| `olhar-release-evidence.ts` | Release milestone evidence schema / builders |

Keeps **export bloqueado** distinct from art **entra** — dual truth preserved in the lab.

### 4.9 Bridge to Nerve / Taste

`human-decision-calibration.ts`:

```text
owner evaluation
  → map intent → approved/rejected/regenerated
  → recordOutputDecisionEvidence (strict)
  → recordCalibrationSignalFromOutputDecisionEvent
```

So Marrow teaching also feeds the fast reflex ledger and Taste signals — without replacing either organ.

---

## 5. Outputs into the hot path

| Destination | Artifact |
|-------------|----------|
| **Taste loader** | Approved `corpus_quality` calibration rules → `CORPUS QUALITY CONSTRAINTS` section |
| **Gaze / gates** | Accepted score ceilings / gate targets (bounded) |
| **Release process** | Olhar evidence JSON + checker (no claim without sample) |
| **Nerve** | Decision events from owner evals |
| **Taste signals** | Calibration signals from those events |
| Owner UI | Feedback corpus, admin quality routes, trends, impact |

Hands never call Marrow synchronously for judgment — only consume **already accepted** prompt/gate artifacts via Taste loader / score ceilings.

---

## 6. API surface (owner)

Under feedback / admin (platform-owner gated):

- `human-quality-corpus` — queue, select, evaluate  
- `human-quality-corpus/candidates` + promote  
- `score-calibration`, `calibration-adjustments`  
- `quality-improvement`, `quality-trend`, `learning-impact`  
- `global-corpus-evidence`, `sample-coverage`  
- `admin/quality/learning/proposals` (generate on demand)  
- `admin/quality/brands/...` (Taste profile/evidence — adjacent)

---

## 7. Marrow vs Nerve

| | **Marrow** | **Nerve** |
|--|------------|-----------|
| Who | Platform owner / lab | End user in product flow |
| Speed | Queue + nightly cron | Immediate best-effort |
| Ledger | Corpus items + evaluations + proposals | `output_decision_events` |
| Prompt force | corpus_quality rules + ceilings | Soft prefill / Memory / Taste signals |
| Proof bar | Sample sufficiency + accept | Aggregation confidence |
| Failure mode | Lab workflow continues | Never block review |

---

## 8. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Hands | candidate capture after gate | derivation job |
| In ← Gaze ⟂ Skin | quality snapshot / dual verdict on item | corpus snapshot |
| Out → Nerve | strict decision evidence | human-decision-calibration |
| Out → Taste | calibration signals + corpus_quality rules | recorder + loader |
| Out → Hands | prompt section + ceilings | indirect |
| Out → Gaze (offline) | Cenbrap / release evidence | olhar-calibration |
| In ← Human (owner) | evaluations via feedback APIs | service.ts |

---

## 9. Safety invariants

1. **Privacy-safe corpus** — validate payloads; no raw prompt dumps as lab truth.  
2. **No auto-ship** — proposals/adjustments need accept before apply.  
3. **Bounded ceilings** — ±5 per apply step.  
4. **Corpus quality rule cap** — max 10 in prompt; overflow deprecated.  
5. **Min slice sample** before trusting proposals / apply plans.  
6. **Evidence honesty** — missing human judgment ≠ release pass.  
7. **Source labels** — synthetic vs real_customer stay visible for claims.  
8. **Dual truth in calibration** — export block ≠ art failure.

---

## 10. What Marrow is not

- Not hot-path Gaze (does not replace Passagem Olhar on every generate)  
- Not Hands  
- Not Nerve’s best-effort user reflex (though it writes into Nerve)  
- Not Taste’s brand-nuance rule UI (it supplies corpus_quality + signals)  
- Not proof of quality from unit tests alone

---

## 11. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `corpus.ts` | Canonical lab vocabulary |
| 2 | `candidate-capture.ts` | Hands → lab intake |
| 3 | `service.ts` | Queue + evaluation |
| 4 | `human-decision-calibration.ts` | Bridge to Nerve/Taste |
| 5 | `learning/generate.ts` | Proposals |
| 6 | `jobs/learning-proposal-aggregator.ts` | Nightly loop |
| 7 | `calibration/service.ts` + `improvement/apply.ts` | Adjust → ceilings |
| 8 | `learning/corpus-quality-prompt.ts` | What Hands eventually see |
| 9 | `olhar-calibration/service.ts` | Gaze release lab |

---

## 12. Maintenance

1. New failure reason → `HUMAN_QUALITY_FAILURE_REASONS` + UI + calibration bridges.  
2. New proposal slice dimension → generate + cooldown + tests + this doc.  
3. Changing apply bounds → update `computeBoundedCeiling` + improvement tests.  
4. Release claims → always go through Olhar evidence builders/checkers.  
5. Keep corpus_quality loading in Taste loader as a **separate** section after brand taste.  
6. Update atlas Marrow card when the public lab contract changes.
