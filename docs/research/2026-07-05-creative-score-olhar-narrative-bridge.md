# Research: Bridge Creative Score Art-Direction Narrative into Olhar Verdict

**Date:** 2026-07-05  
**Status:** proposal  
**Scope:** ONE wiring improvement — reuse existing Phase 140 scorer output instead of discarding it at persistence time  
**Related phases:** 119 (observable rubric), 138–139 (Olhar constitution + dual verdict), 140 (advisor direction-first scoring), 141 (review surface), 142–144 (Cenbrap calibration)

---

## 1. Executive summary

Phase 140 made creative scoring **art-director-first**: `analyzeDerivationCreative` prompts for and parses `olharVerdict`, `directionNote`, `whatWorks`, and `whatBlocks` as the **primary** judgment. Those fields are returned in `ScoreResult` but **never persisted**. The subsequent quality-gate step builds `olharVerdict` from a separate QA vision call via heuristic `buildPassagemOlharVerdict`, which reconstructs narrative from checklist notes and hard failures.

**Recommendation:** Add a small bridge in `runCompletedDerivationQualityGate` that prefers the scorer’s art-direction narrative (read from the derivation row written by `score-derivation`) when `scoreStatus === "analyzed"`, and falls back to `buildPassagemOlharVerdict` only when scorer output is missing or failed. No schema migration, no new dependencies, no new vision calls — it reduces narrative drift and makes Phase 140’s direction-first prompt actually drive review UI and regeneration briefs.

---

## 2. Problem

### Problem statement

The product runs an expensive, direction-first creative score on every completed derivation, then **throws away its primary output** and substitutes a cheaper heuristic Olhar narrative derived from a second vision QA pass. Reviewers see checklist-derived notes instead of the art-director language the scorer was designed to produce.

### Evidence

| Layer | What exists | What is missing |
|-------|-------------|-----------------|
| **Scorer prompt** | `buildCreativeScorePrompt` labels `directionNote` / `whatWorks` / `whatBlocks` / `olharVerdict` as PRIMARY; `qualityScore` as secondary analytics | — |
| **Scorer parse** | `normalizeCreativeScoreResult` returns all direction fields on `ScoreResult` | — |
| **Scorer persist** | `updateDerivationScore` writes only `qualityScore`, `scoreStatus`, `scoreBreakdown`, `scoreIssues`, `regenerationSuggestion` | No columns or JSON slot for direction narrative |
| **Job order** | `derivationJob`: `score-derivation` → `quality-gate` (verified in `derivation.ts` ~L984–1045) | Quality gate does not read scorer output |
| **Olhar build** | `persistDualVerdictFromQualityGate` calls `buildPassagemOlharVerdict` from QA checklist + hard failures | Ignores scorer narrative entirely |
| **Review UI** | `DerivationReviewSheet` renders `olhar.whatWorks`, `whatBlocks`, `directionNote` from persisted `olharVerdict` | Shows heuristic QA notes, not scorer art-direction voice |
| **Dual verdict** | `persistDualVerdictFromQualityGate` is wired (fixed since 2026-06-30 research) | Source of Olhar narrative is still heuristic, not scorer |
| **Cenbrap** | Calibration fixtures include rich `directionNote` / `whatWorks` / `whatBlocks` | Production rows get checklist-derived text; agreement metrics skew |

### Key code references

**Scorer asks for art-direction-first JSON** (`app/src/server/ai/creative-score.ts`):

```typescript
// PRIMARY OUTPUT (art direction — leads regeneration and human review):
// directionNote, whatWorks, whatBlocks, olharVerdict
// SECONDARY / INTERNAL ANALYTICS: qualityScore, scoreBreakdown
```

**Parsed but not persisted** (`app/src/server/repositories/derivation.ts`):

```typescript
export interface UpdateDerivationScoreInput {
  qualityScore?: number | null;
  scoreStatus: ScoreStatus;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
  // ← no olharVerdict, directionNote, whatWorks, whatBlocks
}
```

**Heuristic Olhar rebuild ignores scorer** (`app/src/server/ai/olhar/olhar-qa.ts`):

```typescript
export function buildPassagemOlharVerdict(input): OlharVerdictPayload | null {
  const whatWorks = collectWhatWorks(input.qa.checklist);  // from QA checklist notes
  const whatBlocks = collectWhatBlocks(input.hardFailures, input.qa.checklist);
  const directionNote = buildDirectionNote(input.qa.suggestions, whatBlocks);
  // ...
}
```

**Two vision calls per derivation after image generation:**

1. `analyzeDerivationCreative` — direction-first score (discards narrative)
2. `analyzeCreativeQa` — compliance + checklist (feeds heuristic Olhar)

### Business impact

1. **Review UX (Phase 141):** Reviewers expect art-director voice (`directionNote`, axis-aware strengths/blockers). They get truncated checklist notes like “Needs a quick manual review.” or failure-code messages — lower trust and slower decisions.
2. **Regeneration quality:** `quase_regenerar` and auto-retry correction briefs benefit from structured `whatBlocks` / `directionNote`. Heuristic notes are weaker than the scorer’s dedicated art-direction pass.
3. **Wasted COGS:** Every derivation pays for a direction-first vision score whose primary fields are discarded. Bridging scorer output does not add API calls; it improves ROI on existing spend.
4. **Cenbrap calibration (Phases 142–144):** Human judges compare against system Olhar. When system narrative is checklist-derived rather than scorer-derived, agreement metrics measure the wrong signal.
5. **Phase 140 intent gap:** Phase 140 verification marked direction-first scoring as complete, but the pipeline still treats numeric score as the only persisted scorer artifact.

### Distinction from prior research

The 2026-06-30 dual-verdict persistence proposal addressed **whether** `olharVerdict` / `exportStatus` are written at generation time. That wiring is now in place (`persistDualVerdictFromQualityGate`). This proposal addresses **which source** populates Olhar narrative — scorer vs heuristic QA mapper.

---

## 3. Solution

### Recommended approach

Introduce `buildOlharVerdictFromScorerOrQa` (name illustrative) called from `persistDualVerdictFromQualityGate`:

```
score-derivation (vision #1)
  → updateDerivationScore (numeric + NEW: direction snapshot)
quality-gate (vision #2)
  → compute hard failures / export status
  → build Olhar:
       IF scorer direction snapshot present AND scoreStatus === "analyzed"
         USE scorer olharVerdict + directionNote + whatWorks + whatBlocks
         DERIVE axes from QA checklist (axes not in scorer today)
       ELSE
         USE buildPassagemOlharVerdict (current behavior)
  → updateDerivationDualVerdict
```

#### Option A (preferred): JSONB on `derivations` — `scoreDirectionSnapshot`

Add optional JSONB column `score_direction_snapshot` with bounded payload:

```typescript
{
  olharVerdict: "quase",
  directionNote: "...",
  whatWorks: ["..."],
  whatBlocks: ["..."],
  capturedAt: "ISO-8601"
}
```

Persist in `updateDerivationScore` when `scoreStatus === "analyzed"`. Quality gate reads it via `getDerivationById`.

**Why JSONB:** Avoids widening the typed `olharVerdict` payload schema; keeps scorer artifact auditable separately from final Olhar verdict; supports future A/B comparing scorer vs heuristic.

#### Option B (lighter, no migration): Pass through job step memory

Have `score-derivation` return direction fields; `quality-gate` receives them as Inngest step output. No DB column, but narrative is lost for QA route / re-gate paths that run outside the job.

**Recommendation:** Option A — minimal migration, survives auto-retry re-score, supports corpus and calibration exports.

### Merge rules (deterministic)

| Field | Primary source | Fallback |
|-------|----------------|----------|
| `value` (olharVerdict) | Scorer `olharVerdict` if valid enum | `buildPassagemOlharVerdict` |
| `directionNote` | Scorer | QA `buildDirectionNote` |
| `whatWorks` | Scorer (max 3) | `collectWhatWorks(checklist)` |
| `whatBlocks` | Merge: scorer blocks + non-export hard failures (deduped) | `collectWhatBlocks` |
| `axes` | Always `deriveOlharAxesFromQaChecklist(qa.checklist)` | Same (scorer does not emit axes today) |
| `source` | `"quality_gate"` (unchanged) or new `"creative_score"` if enum extended | — |

Hard failures from the gate still **block approval** via `qualityVerdict` / `exportStatus`; scorer narrative is advisory text, not a bypass.

### Files to touch (implementation estimate)

| File | Change |
|------|--------|
| `app/src/server/db/schema.ts` + migration | Optional `scoreDirectionSnapshot` JSONB |
| `app/src/server/repositories/derivation.ts` | Extend `UpdateDerivationScoreInput`; persist snapshot |
| `app/src/server/ai/creative-quality-gate.ts` | `buildOlharVerdictFromScorerOrQa`; wire in `persistDualVerdictFromQualityGate` |
| `app/src/server/jobs/derivation.ts` | Ensure auto-retry re-score path refreshes snapshot |
| `app/tests/unit/ai/creative-quality-gate.test.ts` (or new bridge test) | Scorer-preferred, fallback, merge cases |

No UI changes required — `DerivationReviewSheet` already renders persisted `olharVerdict` fields.

---

## 4. Alternatives

| Alternative | Summary | Why not first |
|-------------|---------|---------------|
| **A. Status quo** | Keep heuristic `buildPassagemOlharVerdict` | Wastes Phase 140 scorer; dual vision with redundant narrative |
| **B. Drop QA vision pass** | Use scorer only for Olhar + gate | Loses compliance checklist hard-failure taxonomy; high risk |
| **C. Drop scorer vision pass** | Use QA only | Reverses Phase 140 direction-first investment; loses observable rubric score telemetry |
| **D. Merge prompts** | Single vision call for score + QA | Large prompt change; harder to test; violates “one meaningful thing” scope |
| **E. Persist scorer fields inside `olharVerdict` only** | Skip snapshot column | Loses audit trail when heuristic overrides; harder to debug disagreements |
| **F. Extend `OlharVerdictSource` to `creative_score`** | New enum value | Nice for analytics but not required for MVP; can add in Phase 2 |

---

## 5. Pros and cons

### Pros

- Makes existing direction-first scorer actually drive review copy — no new model calls
- Improves regeneration briefs and `quase_regenerar` context without UI work
- Clear fallback to current heuristic when scorer fails (non-blocking steps already tolerate failure)
- Bounded JSONB snapshot is privacy-safe (same sanitization patterns as `scoreIssues`)
- Strengthens Cenbrap calibration signal without new human tooling

### Cons

- Scorer and QA may disagree on `olharVerdict` enum — merge rules must be documented and tested
- Adds one JSONB column (small migration) if Option A chosen
- Axes still derived from QA checklist, not scorer — possible axis/verdict mild inconsistency
- Auto-retry path must re-run bridge after `score-derivation-after-retry` (already mirrors main path)

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scorer returns `pronta` but hard failures say `invalid` | Medium | Gate failures win for approval; narrative shows both scorer notes and failure codes in `whatBlocks` merge |
| Scorer `olharVerdict` null on failed parse | Low | Fallback to `buildPassagemOlharVerdict` (existing behavior) |
| PII in direction notes | Low | Reuse `truncateNote` / max-length bounds from `olhar-qa.ts`; no new PII fields |
| Migration on large `derivations` table | Low | Nullable JSONB column; no backfill required |
| Calibration metric shift | Medium | Document as expected improvement; re-baseline Cenbrap slice after 2 weeks |
| Public API change | None | `olharVerdict` shape unchanged; only content quality improves |

---

## 7. Effort

| Workstream | Scope |
|------------|-------|
| Migration + repository | Small — one nullable JSONB column, extend `updateDerivationScore` |
| Bridge function + gate wiring | Small — ~60–80 lines including merge logic |
| Auto-retry parity | Trivial — same hook in `quality-gate-after-retry` |
| Tests | Small — unit tests for prefer/fallback/merge; extend existing gate tests |
| Docs / ADR | Optional one-paragraph ADR note on scorer-vs-QA precedence |

**Overall:** Small, focused change. No new dependencies. No UI/i18n unless product wants a “scorer source” badge (defer).

---

## 8. Phases

### Phase 1 — Persist scorer snapshot (safe, read-only downstream)

1. Add `score_direction_snapshot` JSONB to `derivations` (nullable).
2. Extend `updateDerivationScore` to write bounded snapshot when direction fields present.
3. Unit tests for repository sanitization.

**Exit:** Rows contain snapshot after generation; no consumer changes yet.

### Phase 2 — Bridge into Olhar verdict

1. Implement `buildOlharVerdictFromScorerOrQa` in `creative-quality-gate.ts`.
2. Wire into `persistDualVerdictFromQualityGate` (main + auto-retry paths).
3. Unit tests: scorer preferred, fallback, hard-failure merge.

**Exit:** Review UI shows scorer narrative on new derivations; fallback unchanged on scorer failure.

### Phase 3 — Observability (optional)

1. Beta analytics event: `olhar_narrative_source` = `scorer` | `heuristic` (no PII).
2. Owner panel slice: % scorer-sourced vs fallback over 7 days.

**Exit:** Data to validate calibration impact before further prompt work.

### Deferred

- Merging vision calls (score + QA) — separate cost-optimization initiative
- Scorer-emitted axis scores — requires prompt + schema design
- Backfill historical derivations — low value; forward-only

---

## 9. Open questions

1. **Enum extension:** Should `OlharVerdictSource` gain `creative_score` for auditability, or keep `quality_gate` as the persisted source when the bridge runs inside the gate?
2. **Disagreement policy:** When scorer says `pronta` but `qualityVerdict === "invalid"`, should UI show scorer `directionNote` at all, or suppress in favor of failure-first copy?
3. **Axis consistency:** Is deriving axes from QA while verdict text comes from scorer acceptable for Phase 141 table, or should Phase 2 add axis hints to the scorer prompt?
4. **QA route:** `POST /api/derivations/[id]/qa` (post-approval) rebuilds Olhar — should it also prefer stored scorer snapshot for consistency?
5. **Corpus exports:** Should `score_direction_snapshot` be included in human-quality corpus artifacts for judge comparison, or remain internal telemetry?

---

## Verification performed

- Read `creative-score.ts`, `creative-quality-gate.ts`, `olhar-qa.ts`, `derivation.ts` job ordering, `derivation.ts` repository, Phase 140 verification notes.
- Confirmed `persistDualVerdictFromQualityGate` exists (dual-verdict wiring from 2026-06-30 research is implemented).
- Confirmed auto-retry observability from 2026-06-29 research is largely implemented (`derivation-auto-retry-telemetry.ts`, API serialization, owner funnel).
- No test suite run (research-only; no production code changed).

---

*Next step if approved: Phase 1 migration + repository in a dedicated implementation PR.*
