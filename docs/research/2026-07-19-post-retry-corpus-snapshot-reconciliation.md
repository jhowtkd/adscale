# Research: Post-Retry Corpus Snapshot Reconciliation

**Date:** 2026-07-19  
**Status:** proposal  
**Scope:** ONE ordering fix — ensure human-quality corpus candidates reflect the **shipped** derivation after auto-retry, not the pre-retry failure snapshot  
**Related phases:** 121 (score ceilings + auto-retry), 158 (candidate capture), 159 (review queue), 151–156 (calibration / learning loops)

---

## 1. Executive summary

Campaign derivations that trigger **auto-retry** (objective hard failures like `style_reference_contamination`, `invalid_format_layout`, etc.) register a corpus candidate **before** the retry runs. The capture is **idempotent** — once inserted, `qualitySnapshot` is never refreshed even though score, quality gate, and `outputKey` are re-run post-retry.

Goal-agent derivations already capture **after** auto-retry. Campaign runs (the bulk production path) do not.

**Recommendation:** Move the `capture-corpus-candidate` Inngest step to after the auto-retry block for campaign derivations, mirroring the existing `capture-goal-corpus-candidate` placement. Optionally add a narrow `refreshQualitySnapshot` path for rows already captured during a transitional window. No schema migration, no new dependencies, no API contract changes.

---

## 2. Problem

### Problem statement

The human-quality corpus learns from `qualitySnapshot` captured at candidate registration time. When auto-retry succeeds, the corpus permanently records the **failed first attempt’s** verdict and hard failures while the derivation row and R2 artifact reflect the **corrected** output. Calibration, brand-taste rules, and learning-impact metrics train on artifacts that were later auto-corrected.

### Evidence

| Layer | What exists | What is wrong |
|-------|-------------|---------------|
| **Canonical post-generation helper** | `runDerivationPostGeneration` documents `score → quality gate → corpus` (`post-generation.ts` L160–173) | Does not model auto-retry as an intermediate step |
| **Campaign Inngest job** | `capture-corpus-candidate` at L1090–1099 runs after first score + gate | Runs **before** `auto-retry-on-text-failure` (L1101+) |
| **Post-retry re-score** | `score-derivation-after-retry` + `quality-gate-after-retry` (L1270–1317) | No corresponding corpus step |
| **Goal-agent path** | `capture-goal-corpus-candidate` at L1345–1348 | Runs **after** retry block — correct ordering |
| **Capture idempotency** | `findCorpusCandidateByDerivationVersion` early-return (L71–78 in `candidate-capture.ts`) | Pre-retry snapshot is frozen forever |
| **Snapshot source** | `buildQualitySnapshotFromDerivation` reads live derivation row at capture time | Pre-retry row still has failing `hardFailures` / `invalid` verdict |

### Key code references

**Campaign capture runs before retry** (`app/src/server/jobs/derivation.ts`):

```typescript
// L1090–1099 — campaign path
if (!isPreview && !goalRunId) {
  await step.run("capture-corpus-candidate", async () => {
    await runDerivationCorpusCapture({ workspaceId, derivationId, enabled: true });
  });
}

// L1101+ — auto-retry follows
const retried = await step.run("auto-retry-on-text-failure", async () => { ... });
```

**Goal path captures after retry** (same file L1345–1348):

```typescript
if (!isPreview && goalRunId) {
  await step.run("capture-goal-corpus-candidate", async () => {
    await captureCorpusCandidateFromDerivation({ workspaceId, derivationId });
  });
}
```

**Idempotent insert blocks refresh** (`app/src/server/human-quality/candidate-capture.ts`):

```typescript
const existingCandidate = await findCorpusCandidateByDerivationVersion(...);
if (existingCandidate) {
  return existingCandidate; // ← no qualitySnapshot update
}
```

**Auto-retry eligibility** (`app/src/server/ai/derivation-auto-retry-policy.ts`):

- Retries only on `RETRYABLE_OBJECTIVE_FAILURE_CODES` (all `OBJECTIVE_INTEGRITY_FAILURE_CODES`: `wrong_brand`, `style_reference_contamination`, `invalid_format_layout`, etc.)
- Subjective findings (`cta_drift`, `visual_overload`) do **not** trigger retry — corpus mismatch only affects derivations that were auto-corrected

### Business impact

1. **Calibration drift (Phases 151–156):** Corpus candidates promoted to review cohorts carry pre-retry `hardFailures` and `qualityVerdict`. Human reviewers and rule-extraction pipelines see failure signals for creatives the customer actually received as passing.
2. **Learning loop pollution (Phase 131+):** `qualitySnapshot` feeds factual alerts, cross-client aggregates, and impact enrichment. Stale snapshots inflate “failure” rates for modes where auto-retry is effective (notably **restyling** — see `derivation.test.ts` restyling retry characterization).
3. **Inconsistent paths:** Goal-agent and campaign derivations follow different corpus timing despite sharing `captureCorpusCandidateFromDerivation`. Operators cannot trust corpus coverage metrics without knowing which path produced a row.
4. **Wasted retry COGS without learning upside:** Auto-retry spends an extra image generation call; if corpus still records the failure, the correction’s quality signal never enters the learning corpus.

### Frequency (qualitative)

No production metric was queried in this research run. Auto-retry fires only when objective hard failures are present and `autoRetryAttempted` is false. Restyling and format adaptation are the highest-risk modes per existing tests and policy. Even at low frequency, idempotent wrong snapshots are **permanent** until manually corrected.

---

## 3. Solution

### Recommended approach: reorder campaign capture after auto-retry

Move the campaign `capture-corpus-candidate` step to immediately after the `if (retried) { ... }` block (before or alongside goal capture), so `captureCorpusCandidateFromDerivation` reads the derivation row **after** post-retry score and quality gate have persisted.

**Concrete change surface:**

| File | Change |
|------|--------|
| `app/src/server/jobs/derivation.ts` | Relocate `capture-corpus-candidate` step from L1090–1099 to after L1343 |
| `app/src/server/generation/pipeline/post-generation.ts` | Update canonical-order comment to note retry may precede corpus in Inngest |
| `app/src/server/jobs/derivation.test.ts` | Add characterization: when retry succeeds, corpus capture runs after `quality-gate-after-retry` and snapshot reflects post-retry verdict |
| `app/tests/unit/human-quality/candidate-capture.test.ts` | Optional: test `refreshQualitySnapshot` if upsert path is added |

**Inngest step naming:** Keep `capture-corpus-candidate` name for durability (existing step replay semantics). Moving position is safe — Inngest replays by step name, not list index.

### Optional hardening: snapshot refresh for already-captured rows

For candidates inserted during the bug window (or if reorder alone is insufficient during rollout), add a narrow function:

```typescript
async function refreshCorpusCandidateQualitySnapshot(input: {
  workspaceId: string;
  derivationId: string;
  corpusVersion?: number;
}): Promise<void>
```

- Only updates `qualitySnapshot` on existing candidate rows when `generationLog.autoRetryAttempted === true`
- Does not change `artifactRef` (still `derivationId`-scoped — correct, since `outputKey` on derivation row is updated)
- Call from the post-retry block when `retried` is truthy and candidate already exists

This is a **Phase 2** safeguard; reorder alone fixes all new derivations.

---

## 4. Alternatives

| Alternative | Description | Why not primary |
|-------------|-------------|-----------------|
| **A. Reorder capture (recommended)** | Move step after retry block | Minimal diff; matches goal path; no schema change |
| **B. Upsert on every capture** | Replace idempotent early-return with merge/update of `qualitySnapshot` | Broader behavior change; risks overwriting intentional manual edits |
| **C. Second `corpus_version`** | Bump version on retry (`corpusVersion: 2`) | Schema/UX complexity; duplicates candidates per derivation |
| **D. Skip capture when retry is likely** | Defer capture until retry decision is known | Equivalent to reorder but more branching |
| **E. Backfill script only** | One-time SQL fix for historical rows | Does not fix forward path; still needed as complement |
| **F. Capture inside `runDerivationPostGeneration`** | Force synchronous helper in job | Breaks Inngest step granularity; retry is job-specific |

---

## 5. Pros and cons

### Pros

- Aligns campaign and goal-agent corpus timing with no new dependencies
- Fixes permanent stale snapshots for all future auto-retried derivations
- Improves calibration and learning corpus fidelity without extra vision/API cost
- Small, testable diff confined to `derivation.ts` job ordering (+ tests)
- Preserves Phase 158 privacy contract — snapshot fields unchanged, only timing

### Cons

- Does not automatically repair historical candidates (needs optional backfill)
- Slightly delays corpus registration by retry duration (typically one extra image gen — acceptable; capture is async/non-blocking)
- Characterization tests may need step-order assertion updates
- If retry fails (returns null), capture still runs with first-attempt quality — **correct** behavior

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inngest replay skips moved step for in-flight runs | Low | Step name unchanged; only new invocations get new order |
| Race: capture runs before post-retry DB writes complete | Low | Keep capture in separate `step.run` after retry steps complete |
| Promoted corpus items already in review with stale snapshot | Medium | Phase 2 backfill or `refreshQualitySnapshot`; items link to derivation — re-read derivation for display where possible |
| Double capture attempt (pre-fix deployments) | Low | Idempotent insert prevents duplicate rows; refresh path handles existing |
| Goal + campaign path duplication after reorder | Low | Conditions remain mutually exclusive (`goalRunId` guard) |

---

## 7. Effort

| Component | Estimate |
|-----------|----------|
| Reorder step in `derivation.ts` | ~30 minutes |
| Update/add characterization test in `derivation.test.ts` | ~1–2 hours |
| Optional `refreshQualitySnapshot` + unit test | ~2–3 hours |
| Optional historical backfill script | ~2–4 hours (operator-run) |
| Docs / ADR note | ~30 minutes |

**Total (core fix):** small — roughly half a day including review.  
**Total (with backfill):** medium — one focused day.

No package.json, schema, or public API changes required.

---

## 8. Phases

### Phase 1 — Forward fix (ship first)

1. Move `capture-corpus-candidate` to after auto-retry block in `derivation.ts`
2. Add test: mock retry success → assert capture called once, after `quality-gate-after-retry`, with post-retry derivation state
3. Update `post-generation.ts` comment documenting Inngest-specific retry ordering

### Phase 2 — Hardening (optional)

1. Implement `refreshCorpusCandidateQualitySnapshot` for existing candidates when `autoRetryAttempted`
2. Invoke from post-retry block if `findCorpusCandidateByDerivationVersion` returns existing row

### Phase 3 — Historical repair (operator)

1. Script: find candidates where `qualitySnapshot.hardFailures` is non-empty AND linked derivation `generationLog.autoRetryAttempted === true` AND post-retry `hardFailures` is empty
2. Rebuild snapshot from current derivation row
3. Log counts; no automatic promotion changes

### Phase 4 — Verification

1. Run `npm test -- derivation.test.ts candidate-capture.test.ts` from `app/`
2. Spot-check owner corpus panel for a known auto-retried derivation (if available in staging)

---

## 9. Open questions

1. **Volume:** What percentage of completed campaign derivations trigger auto-retry in production? (Informs backfill priority.)
2. **Promotion timing:** Are any candidates promoted to corpus items **before** retry completes in practice, or only after job finalization?
3. **Manual edits:** Do operators ever hand-edit `qualitySnapshot` on candidate rows? (Affects whether upsert is safe.)
4. **Display layer:** Should `HumanQualityCorpusPanel` prefer live derivation quality fields over frozen `qualitySnapshot` when `autoRetryAttempted`? (UI-only mitigation vs data fix.)
5. **Canonical helper:** Should `runDerivationPostGeneration` gain an optional `afterRetry?: boolean` flag, or remain documentation-only while Inngest owns ordering?

---

## References

- `app/src/server/jobs/derivation.ts` — job step ordering
- `app/src/server/generation/pipeline/post-generation.ts` — canonical post-generation sequence
- `app/src/server/human-quality/candidate-capture.ts` — idempotent capture
- `app/src/server/ai/derivation-auto-retry-policy.ts` — retry eligibility
- `.planning/phases/158-candidate-capture-and-privacy-safe-corpus-model/158-CONTEXT.md` — Phase 158 capture trigger (ambiguous on retry ordering)
- Prior research (do not duplicate): dual-engine winner selection, Olhar narrative bridge, dual verdict persistence, auto-retry observability
