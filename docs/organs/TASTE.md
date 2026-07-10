# Taste — Organ Deep Dive

> Character-level map of ADScale brand palate (approved calibration rules on the prompt).  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Upstream: [`NERVE.md`](./NERVE.md) · Downstream: [`HANDS.md`](./HANDS.md) · Peer: Gaze / Marrow  
> Code home: `app/src/server/brand-taste/` · Atlas name: **Taste**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Taste is

Taste turns **human teaching** (where Gaze/Skin disagreed with a human, or nuance was taught) into **approved, typed rules** injected into the next Hands prompt. It **refines** global Olhar; it must **never** weaken Skin (CTA spelling, facts, export compliance).

| Layer | Path |
|-------|------|
| Public barrel | `index.ts` |
| Signal types | `calibration-signal-types.ts` |
| Signal build / validate | `calibration-signal.ts` |
| Signal persist | `calibration-signal-recorder.ts` |
| Profile / evidence level | `taste-profile.ts` |
| Rule extraction | `rule-extraction.ts` |
| Rule lifecycle | `calibration-rules.ts` |
| Prompt apply | `taste-application.ts` |
| Hands loader | `prompt-calibration-loader.ts` |
| Uncertainty queue | `uncertainty-queue.ts` |
| Evidence reports | `calibration-evidence.ts` |

---

## 2. Thesis

> Olhar ADScale = global constitution (**Gaze**).  
> Taste = per-client seasoning.  
> Seasoning ≠ rewriting the law.  
> `uncalibrated` profile → **no** Taste section in the prompt.

Prompt disclaimer (always when rules apply):

> *These constraints refine brand-specific taste on top of global Olhar ADScale. Do not weaken factual text, CTA spelling, or export compliance.*

---

## 3. Cycle

```text
Nerve event (and/or Marrow owner eval)
  → calibration signal
       humanVerdict: entra | quase | nao_entra
       systemOlharVerdict + systemExportStatus
       mismatchBucket (when human ≠ system)
       sourceLabel: synthetic_fixture | operator_imported | real_customer
  → BrandTasteProfile (evidenceLevel + patterns)
  → extractRuleCandidatesFromSignals (mismatch buckets)
  → persist candidate → human approve / reject / deprecate
  → approved rules
  → loadPromptCalibrationContext (Hands job)
       · brandTasteSection (non-corpus categories)
       · corpusQualitySection (Marrow rules, separate)
  → prompt-builder (after Gaze direction)
```

Idempotent signal write: `recordCalibrationSignal` + idempotency key (workspace + derivation + reviewer).

From Nerve: `recordCalibrationSignalFromOutputDecisionEvent` — may `skipped_unmappable` if the event cannot become a calibration verdict.

---

## 4. Evidence levels (`taste-profile.ts`)

| Level | When | Prompt injection? |
|-------|------|-------------------|
| `uncalibrated` | 0 decisions, or &lt; 5 | **No** (`selectApplicableRules` returns empty) |
| `seed_calibrated` | ≥ 5 decisions | Yes (if approved rules exist) |
| `assisted` | ≥ 10 decisions | Yes |
| `evidence_backed` | ≥ 10 and ≥ 3 `real_customer` | Yes |

Profile also tracks source composition, positive / rejection / quase patterns, caveats (e.g. no real_customer yet).

---

## 5. Signals

`CalibrationSignalPayload` fields: workspace, client, campaign, derivation, optional `outputDecisionEventId`, humanVerdict, system Olhar/export, mismatchBucket, sourceLabel, reviewer, reviewedAt, sanitizedNote, idempotencyKey.

### Mismatch buckets

`system_too_permissive` · `system_too_harsh` · `voice_nuance` · `export_setup_issue` · `acceptable_override` · `unclear_sample`

Used both for teaching narratives and for rule category mapping.

---

## 6. Rules

### Categories

`figure` · `gestalt` · `hierarchy` · `voice` · `invite` · `export_conflict` · `brand_nuance` · `corpus_quality`

`corpus_quality` is **Marrow-owned** content loaded beside Taste in `prompt-calibration-loader` (filtered out of brand-taste category list when selecting brand rules).

### Bucket → category (extraction)

| Mismatch bucket | Category |
|-----------------|----------|
| system_too_permissive | gestalt |
| system_too_harsh | figure |
| voice_nuance | voice |
| export_setup_issue | export_conflict |
| acceptable_override | brand_nuance |
| unclear_sample | brand_nuance |

### Status lifecycle

`candidate` → `approved` | `rejected` → `deprecated`

Only **approved** lines enter `buildBrandTastePromptSection`.

Constraint line format: `[brand-taste:{id}] {category}: {rationale}`  
Corpus: `[corpus-quality:{id}] {rationale}`

### Promotion gates (`canPromoteRuleToApproved`)

- Only `candidate` status  
- Low confidence **with caveats** needs explicit `acknowledgeCaveats` on approve  
- Single-row `unclear_sample` cannot become active without clearing that path  

`approveCalibrationRule` enforces promotion unless operator acknowledges caveats.

---

## 7. Application into Hands

### `selectApplicableRules`

If no profile or `uncalibrated` → empty.  
Else filter `status === "approved"` → build section + applied rule ids.

### `loadPromptCalibrationContext` (job step)

Parallel load: signals, approved brand-category rules, approved corpus_quality rules.  
Build profile → select brand rules → cap corpus rules (`enforceCorpusQualityRuleCap`) → return:

```ts
{
  brandTasteSection,
  corpusQualitySection,
  appliedBrandRuleIds,
  appliedCorpusRuleIds
}
```

No `clientProfileId` → all empty (Hands continue without Taste).

### Merge with Gaze

`mergeOlharAndBrandTasteSections` = Olhar section **then** Taste.  
Atlas / Hands order: **Gaze → Taste → corpus → Memory → …**

### Verdict explanation

`applyBrandTasteToVerdictExplanation` appends `[brand-taste rules: rule:…]` refs — does not change dual-verdict values.

---

## 8. Uncertainty queue

`classifyJudgmentUncertainty` scores when human review should teach:

| Reason code | Trigger sketch |
|-------------|----------------|
| `new_brand` | uncalibrated / missing profile |
| `low_sample` | &lt; 10 decisions |
| `disagreement_history` | prior disagreement rate &gt; 0.3 |
| `rule_conflict` | multiple `acceptable_override` rules |
| `high_impact_export` | flagged high-impact export |
| `low_confidence` | system Olhar `sem_opiniao` / `confusa` |

High uncertainty / uncalibrated / `sem_opiniao` → `requiresHumanReview`.  
`buildReviewQueue` / `shouldSkipHumanReview` help operator surfaces.

---

## 9. Admin / evidence surfaces

- Brand profile API: `api/admin/quality/brands/[clientProfileId]/profile`  
- Evidence reports: `calibration-evidence.ts` (agreement rates, claims matrix, per-brand reports)  
- Signal listing for operators via calibration-signal repositories  

Taste is operator-facing for **approve rules**; end users feel it only as better next generations.

---

## 10. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Nerve | output decision → calibration signal | recorder |
| In ← Marrow | owner eval bridge + corpus_quality rules | human-decision-calibration + loader |
| In ← Gaze ⟂ Skin | system verdicts on signal | mismatch teaching |
| Out → Hands | `brandTasteSection` in derivation job | prompt-calibration-loader |
| Out → Human (ops) | uncertainty queue / admin profile | review teaching |
| Peer Gaze | always subordinate in prompt text | constitution first |

---

## 11. Taste vs Memory vs Nerve

| | **Taste** | **Memory** | **Nerve** |
|--|-----------|------------|-----------|
| Form | Typed approved rules | Retrieved text / vectors | Decision events → learnings |
| Gate | evidenceLevel + human approve | Mem0 flag | best-effort capture |
| Prompt force | Explicit constraints | Soft auxiliary block | Prefill (guarded) / feeds Taste |
| Can weaken Skin? | No (stated + design) | No (disclaimer) | No (guards) |

---

## 12. Safety invariants

1. **Uncalibrated = silent** — no brand-taste prompt spam.  
2. **Approve is human** — mismatch alone does not auto-activate rules.  
3. **Caveats matter** — low-confidence / unclear single-row blocked without ack.  
4. **Olhar first** — Taste section after Gaze direction.  
5. **Export safety language** always appended to Taste prompt block.  
6. **Signal idempotency** — retries do not duplicate teaching events.  
7. **corpus_quality capped** separately — Marrow rules do not unbounded-bloat the prompt.

---

## 13. What Taste is not

- Not Gaze constitution  
- Not Skin validator  
- Not Memory (Mem0)  
- Not Nerve aggregation / prefill  
- Not brand-kit / logo assets (identity training is a different doorway)  
- Not automatic score-ceiling apply (that is Marrow improvement)

---

## 14. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `prompt-calibration-loader.ts` | What Hands actually load |
| 2 | `taste-application.ts` | Section builder + selectApplicableRules |
| 3 | `taste-profile.ts` | evidenceLevel gates |
| 4 | `calibration-signal-recorder.ts` | Teaching event persist |
| 5 | `rule-extraction.ts` | Mismatch → candidates |
| 6 | `calibration-rules.ts` | Approve / reject / deprecate |
| 7 | `calibration-signal-types.ts` | Canonical enums |
| 8 | `uncertainty-queue.ts` | When to ask a human |

---

## 15. Maintenance

1. New mismatch bucket → map category + rationale + tests.  
2. New rule category → types, loader filter, prompt line format.  
3. Changing evidence thresholds → update `taste-profile.ts` + this doc + atlas card.  
4. Never inject Taste before Gaze direction in `prompt-builder`.  
5. Keep corpus_quality out of brand-taste category selection; load it as its own section.
