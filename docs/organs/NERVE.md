# Nerve — Organ Deep Dive

> Character-level map of ADScale fast user-decision learning.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Upstream: [`GAZE.md`](./GAZE.md) · [`SKIN.md`](./SKIN.md) · Downstream: Taste / Memory  
> Code home: `app/src/server/output-learning/` · Atlas name: **Nerve**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Nerve is

Nerve is the **fast reflex**. When a human approves, rejects, regenerates, saves a reference, or selects for delivery, the body records durable evidence and aggregates per-client preferences. Capture is **best-effort** on user-facing paths — review must succeed even if learning fails.

| Layer | Path |
|-------|------|
| Record | `output-decision-recorder.ts` |
| Event contract | `output-decision-events.ts` |
| Reasons | `output-decision-reasons.ts` |
| Aggregate | `aggregate.ts` + `service.ts` |
| Confidence / approve rules | `confidence.ts` |
| Variables | `variable-value.ts` |
| Dispatch recompute | `dispatch.ts` |
| Recommendation | `recommendation/` |
| Safety | `safety/guards.ts` |
| Projection | `app/src/server/memory/output-learning-projection.ts` |

**Source of truth:** Postgres `output_decision_events` → `client_output_learnings`.  
Mem0 is a **projection**, not the canonical store.

---

## 2. One reflex

```text
Human decision (review / regen / reference / delivery / Marrow eval)
  → recordOutputDecisionEvidence[BestEffort]
       · validate campaign + derivation ownership
       · mapActionToSemantics (direction + strength)
       · buildOutputDecisionSnapshot (Gaze + Skin + score + reason…)
       · sanitize (strip prompts, URLs, contracts, logs)
       · insert output_decision_events (idempotencyKey optional)
  → dispatchOutputLearningRecomputeBestEffort
  → list events for client → aggregateOutputLearningsFromEvents
  → sync client_output_learnings
  → projectOutputLearnings → Memory (Mem0)
```

Strict path (throws): `recordOutputDecisionEvidence` — used by Marrow calibration bridge.  
User APIs: `recordOutputDecisionEvidenceBestEffort` — logs warn, returns null on failure.

---

## 3. Actions & semantics

File: `output-decision-events.ts` → `mapActionToSemantics`

| Action | Direction | Strength |
|--------|-----------|----------|
| `approved` | positive | strong |
| `rejected` | negative | strong |
| `regenerated` | corrective | strong |
| `saved_reference` | positive | strong |
| `selected_for_delivery` | positive | medium |

---

## 4. Snapshot (what the nerve photographs)

Safe fields include: generationMode, format, variantIndex, ctaText, status, qualityScore, qualityVerdict, scoreStatus, hardFailures, scoreIssues, polishSuggestions, reason, **olharVerdict**, **exportStatus**, overrideApproved, reference metadata, creativeLevel, parent/child ids.

**Forbidden keys** (stripped): `prompt`, `inputPrompt`, `outputKey`, `signedUrl`, `imageUrl`, `modelResponse`, `rawResponse`, `generationLog`, `promptProvenance`, `creativeContract`, `regenerationCorrectionBrief`.

Hard failures capped (count + string length). Verdict values truncated. Nerve **snapshots** Gaze/Skin; it does not re-judge them.

---

## 5. Where the reflex fires

| Surface | Action | Capture style |
|---------|--------|---------------|
| `POST .../derivations/[id]/review` | approved / rejected | best-effort |
| `POST .../derivations/[id]/regenerate` | regenerated | best-effort |
| `POST .../derivations/[id]/save-reference` | saved_reference | best-effort |
| approval / delivery package routes | selected_for_delivery | best-effort |
| `human-quality/human-decision-calibration.ts` | via owner eval | **strict** + Taste calibration signal |

---

## 6. Aggregation → learnings

### Variables (`OUTPUT_SUPPORTED_VARIABLE_KEYS`)

`cta` · `generation_mode` · `format` · `style_policy` · `avoid_pattern` · `creative_level`

Extracted per event in `variable-value.ts` (normalize key/value, build statement text).

### Grouping

Key: `variableKey :: variableValue :: scopeGenerationMode :: scopeFormat`

Preference:

- `avoid_pattern` → always `avoid`  
- others → `prefer` (polarity from event direction via `resolvePolarityForVariable`)

### Confidence (`confidence.ts`)

Weighted by evidence strength (strong 1 / medium 0.6 / weak 0.3).  
Contradictions shrink score. Levels: `low` | `medium` | `high`.

### Status promotion

| Helper | Rule (sketch) |
|--------|----------------|
| `shouldApproveOutputLearning` | Need support weight > contradict; avoid needs ≥1 support and not low; prefer needs not-low or ≥2 supports |
| `shouldSupersedeOutputLearning` | Contradict weight ≥ support weight |

Statuses: `draft` · `approved` · `superseded` · `removed`  
Algorithm version: `OUTPUT_LEARNING_ALGORITHM_VERSION` (`1.0.0`).

`recomputeClientOutputLearnings` syncs drafts to DB then projects to Mem0 (including removals/supersedes → delete Mem0 id).

---

## 7. Recommendation (optional motor exit)

`recommendation/service.ts` → `getOutputLearningRecommendation`

1. Load Postgres learnings for client  
2. **`filterApprovedPostgresLearnings` only** (SAFE-02 — no Mem0 / draft influence)  
3. Scope-match generationMode / format  
4. Rank by confidence + evidence weight  
5. `mapOutputLearningToPrefill`  
6. **`guardOutputLearningPrefill`** (SAFE-01) — cannot weaken factual contracts (e.g. block format_adaptation prefill under restyling campaign; cap creative level)  
7. Trace + log applied learning ids  

Prefill keys are a subset of variables (`OUTPUT_PREFILL_VARIABLE_KEYS`).

---

## 8. Nerves to the body

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Human | review / regen / reference / delivery | APIs |
| In ← Gaze ⟂ Skin | snapshot fields | extras on record |
| In ← Marrow | owner eval bridge | strict record + calibration |
| Out → Memory | `projectOutputLearnings` | Mem0 `output_learning` |
| Out → Taste | calibration signals from events | brand-taste recorder |
| Out → Hands (soft) | recommendation prefill | guarded, approved only |
| Out → admin API | list / recompute | `api/client-profiles/.../output-learnings` |

---

## 9. Nerve vs Marrow

| | **Nerve** | **Marrow** |
|--|-----------|------------|
| Who | End user in flow | Owner / lab |
| Speed | Immediate best-effort | Queue + cron |
| Artifact | decision events → client learnings | corpus → proposals → ceilings |
| Force on prompt | Soft prefill / Memory / Taste signals | corpus_quality rules + gate ceilings |
| Failure mode | Log & continue | Lab workflow |

---

## 10. Safety invariants

1. **Best-effort on user paths** — never fail review because learning failed.  
2. **Postgres is canonical** — Mem0 is projection.  
3. **No secrets in snapshots** — forbidden key set + truncation.  
4. **Ownership checks** before insert.  
5. **Only approved Postgres learnings** drive recommendations.  
6. **Prefill guards** cannot override restyling/factual campaign contracts.  
7. **Idempotency keys** when callers provide them (Marrow / retries).

---

## 11. What Nerve is not

- Not Gaze / Skin (no verdict computation)  
- Not Hands (recording regen ≠ regenerating)  
- Not Taste (no candidate→approved rule lifecycle; only feeds signals)  
- Not Marrow corpus / rubrics  
- Not Energy

---

## 12. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `output-decision-recorder.ts` | Reflex entry |
| 2 | `output-decision-events.ts` | Actions, semantics, snapshot sanitize |
| 3 | `aggregate.ts` | Events → learning drafts |
| 4 | `confidence.ts` | Approve / supersede thresholds |
| 5 | `service.ts` | Recompute + list |
| 6 | `dispatch.ts` | Best-effort recompute trigger |
| 7 | `recommendation/service.ts` | Prefill exit |
| 8 | `safety/guards.ts` | SAFE-01 / SAFE-02 |
| 9 | `memory/output-learning-projection.ts` | Mem0 write |

---

## 13. Maintenance

1. New user decision type → extend `OUTPUT_DECISION_ACTIONS` + semantics + call site + this doc.  
2. New learning variable → `OUTPUT_SUPPORTED_VARIABLE_KEYS` + extractor + tests; decide if prefill-eligible.  
3. Never let recommendation read Mem0 as authority.  
4. Keep snapshot forbid-list in sync with new derivation columns that are sensitive.  
5. Update atlas Nerve card when the public learning contract changes.
