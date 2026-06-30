# Research: Persist Dual Verdict at Quality-Gate Completion

**Date:** 2026-06-30  
**Status:** proposal  
**Scope:** ONE wiring improvement — connect existing Phase 139 modules to the derivation generation pipeline  
**Related phases:** 138 (Olhar constitution), 139 (dual verdict + export validator), 141 (review surface), 142–144 (Cenbrap calibration)

---

## 1. Executive summary

Phase 139 shipped `olharVerdict` and `exportStatus` as first-class derivation fields with validators, approval gates, and review UI — but **production derivations almost never receive these payloads at decision time**. The canonical post-generation path (`runCompletedDerivationQualityGate` in the `derivation.generate` Inngest job) persists legacy gate fields only. Dual verdicts are written only by the post-approval QA route or seed scripts.

**Recommendation:** Extend `runCompletedDerivationQualityGate` to call `buildPassagemOlharVerdict`, `validateExportReadiness`, and `updateDerivationDualVerdict` immediately after existing QA/gate persistence. This is a ~30-line orchestration change reusing tested modules, no new dependencies, and no schema migration.

---

## 2. Problem

### Problem statement

The dual-verdict architecture is implemented but **not wired into the generation pipeline**, so reviewers see empty Olhar/Export surfaces and approval safety nets are inactive for the common case.

### Evidence

| Layer | What exists | What is missing |
|-------|-------------|-----------------|
| **Quality gate step** | `runCompletedDerivationQualityGate` runs vision QA, classifies hard failures, persists `qualityVerdict` / `hardFailures` / `polishSuggestions` | No call to `buildPassagemOlharVerdict`, `validateExportReadiness`, or `updateDerivationDualVerdict` |
| **Inngest job** | `derivation.ts` step `"quality-gate"` invokes `runCompletedDerivationQualityGate` on every completed derivation (and again after auto-retry) | Dual verdict never produced in this path |
| **QA route** | `POST /api/derivations/[id]/qa` builds `olharVerdict` via `buildPassagemOlharVerdict` | Requires `derivation.status === "approved"` (409 otherwise); does not call `validateExportReadiness` |
| **Export validator** | `validateExportReadiness()` fully implemented with tests | Only referenced in `export-validation.test.ts` — zero production callers |
| **Review UI** | `DerivationReviewSheet` renders Olhar axes, export badge, structured decisions for `status === "completed"` | Falls back to raw `hardFailures` / `polishSuggestions` when `olharVerdict` is null |
| **Approval package** | `isDerivationPackageEligibleByVerdict` blocks on `sem_opiniao`, `confusa`, `bloqueado` | Returns `true` when both payloads are missing (`client-approval-package.ts` lines 80–81) |
| **Cenbrap calibration** | `hasDualVerdict()` requires both `olharVerdict.value` and `exportStatus.value` | Production rows get `dualVerdictState: "missing_dual_verdict"` and are excluded from agreement metrics |

### Key code references

**Quality gate stops before dual verdict** (`app/src/server/ai/creative-quality-gate.ts`):

```typescript
await updateDerivationQualityGate(input.derivationId, input.workspaceId, {
  qualityVerdict,
  hardFailures,
  polishSuggestions,
  qualityGatedAt: gatedAt,
});
// ← no updateDerivationDualVerdict here
```

**QA route gated to post-approval** (`app/src/app/api/derivations/[id]/qa/route.ts`):

```typescript
if (derivation.status !== "approved") return apiError("derivationNotApprovedForQa", 409);
```

**Permissive fallback when verdicts absent** (`app/src/server/ai/client-approval-package.ts`):

```typescript
if (!derivation.olharVerdict && !derivation.exportStatus) {
  return true;
}
```

**Scoring discards Olhar fields** — `creative-score.ts` prompts for and parses `olharVerdict`, `whatWorks`, `whatBlocks`, `directionNote`, but `updateDerivationScore` has no columns for them.

### Business impact

1. **Review UX (Phase 141):** The art-director table (`Olhar` first, `Exportação` second) is built but empty on real derivations. Reviewers fall back to legacy hard-failure text instead of axis scores and direction notes.
2. **Approval safety:** Blocking on `confusa` / `sem_opiniao` / `exportStatus: bloqueado` only applies when verdicts exist. Normal flow can approve without export blockers the validator was designed to surface.
3. **Cenbrap calibration (Phases 142–144):** Calibration corpus rows require `hasDualVerdict`; production traffic yields `missing_dual_verdict`, forcing synthetic seed data and weakening live agreement claims.
4. **Regeneration quality:** `quase_regenerar` decisions chain to regenerate with `directionReason`, but structured `directionNote` / `whatBlocks` from Olhar are absent at decision time.
5. **Wasted compute:** Vision QA and scoring run on every derivation; dual-verdict derivation is thrown away instead of persisted once.

---

## 3. Solution

### Recommended approach

Add a **dual-verdict persistence hook** at the end of `runCompletedDerivationQualityGate`, after existing QA and gate writes succeed:

```typescript
const olharVerdict = buildPassagemOlharVerdict({
  hardFailures,
  qa,
  evaluatedAt: gatedAt.toISOString(),
});

const exportStatus = validateExportReadiness({
  contract: input.contract,
  observedCtaText: input.derivation.ctaText,
  hardFailures,
});

await updateDerivationDualVerdict(input.derivationId, input.workspaceId, {
  ...(olharVerdict !== null ? { olharVerdict } : {}),
  exportStatus,
});
```

### Design notes

- **`exportStatus` is always written** when the gate runs — even if `olharVerdict` is null (export-only failures). This matches `hasDualVerdict` requirements for calibration.
- **`olharVerdict` may be null** when only export/compliance failures exist (`buildPassagemOlharVerdict` returns null per `olhar-qa.ts`). Calibration and package gates already handle partial presence; `exportStatus` alone still blocks `bloqueado`.
- **Inputs are already available** in `RunCompletedDerivationQualityGateInput`: `contract`, `derivation.ctaText`, `imageBuffer` (for QA), and gate outputs.
- **Auto-retry path** re-runs quality gate (`quality-gate-after-retry` step) — dual verdict will be refreshed automatically.
- **Fallback path** (`persistQualityGateFallback`) should not write dual verdict — absence signals gate failure, consistent with current behavior.

### Secondary follow-ups (out of scope for Phase 1)

| Follow-up | Rationale |
|-----------|-----------|
| Persist scoring Olhar fields in `updateDerivationScore` | Avoid re-deriving from QA when scorer already produced direction note |
| Demote QA route to re-run-only or add `exportStatus` there | Avoid duplicate vision QA spend after approval |
| Backfill existing `completed` derivations | One-time script for in-flight review queue |

---

## 4. Alternatives

| Alternative | Description | Why not primary |
|-------------|-------------|-----------------|
| **A. QA route at review time (pre-approval)** | Change QA route to allow `status === "completed"` and trigger on review sheet open | Extra credit spend (1 credit/QA), duplicate vision call, latency at review; gate already ran QA |
| **B. Lazy compute on review sheet fetch** | API enriches derivation with dual verdict if missing | Race on concurrent reviews; hides pipeline truth; harder to calibrate on stored state |
| **C. Scoring-only path** | Persist Olhar from `creative-score.ts` LLM output instead of deterministic `buildPassagemOlharVerdict` | Non-deterministic; scorer output not validated to dual-verdict schema; duplicates art-direction mapping |
| **D. Separate Inngest step** | New `"dual-verdict"` step after quality-gate | More orchestration surface; same logic, extra step latency; no benefit over inline hook |
| **E. Client-side derivation** | Compute verdicts in browser from `hardFailures` | Violates server-as-source-of-truth; breaks calibration, package gates, and analytics |
| **F. Do nothing** | Rely on seed scripts for calibration | Review UX stays broken; approval safety net inactive; Phase 141 investment undermined |

**Primary recommendation:** Inline hook in `runCompletedDerivationQualityGate` (Alternative none-of-the-above) — smallest change, reuses tested modules, matches Phase 139 intent.

---

## 5. Pros and cons

### Pros

- **Minimal diff** — orchestration only; no schema, dependencies, or API contract changes
- **Reuses verified modules** — Phase 139: 12/12 truths verified, 111 focused tests
- **Immediate review UX payoff** — `DerivationReviewSheet` already consumes `olharVerdict` / `exportStatus`
- **Activates existing approval gates** — `assertDerivationApprovable` and package eligibility start blocking on real data
- **Unblocks Cenbrap calibration** on production corpus without synthetic seeding
- **No extra credit cost** — uses QA output already produced in the gate step
- **Auto-retry compatible** — re-gate after retry refreshes verdicts

### Cons

- **Olhar null on export-only failures** — calibration `hasDualVerdict` still false when only export issues exist; may need calibration rule adjustment
- **Deterministic vs LLM Olhar** — `buildPassagemOlharVerdict` may differ from scorer's `olharVerdict` string; two sources of truth until scoring persistence is aligned
- **No historical backfill** — existing `completed` derivations remain without verdicts until regenerated or batch backfill
- **QA route redundancy** — post-approval QA may re-derive same verdicts; minor waste until route is demoted

---

## 6. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Gate failure leaves stale dual verdict** from prior generation | Medium | Dual verdict write only on successful gate path; clear on regeneration start or overwrite in same transaction |
| **`buildPassagemOlharVerdict` returns null more often than expected** | Low | Unit tests cover art-direction vs export-only split; monitor `dualVerdictState` in calibration |
| **Export validator false positives block approval** | Medium | `assertDerivationApprovable` already tested for `bloqueado`; override UX exists in Phase 141 |
| **Performance** | Low | `validateExportReadiness` is pure CPU; `buildPassagemOlharVerdict` is pure CPU; no extra API calls |
| **Breaking change for workflows that approve without Olhar** | Low | Legacy rows without verdicts remain permissive; new rows get stricter gates — intended behavior per Phase 139 |
| **Test gap** | Medium | Add integration test on `runCompletedDerivationQualityGate` proving both JSONB columns set |

---

## 7. Effort

| Work item | Size | Notes |
|-----------|------|-------|
| Hook in `runCompletedDerivationQualityGate` | S | ~30 lines |
| Integration test (gate → dual verdict persisted) | S | Mock QA + assert DB write |
| Verify auto-retry re-gate path | S | Existing step already re-invokes gate |
| Manual spot-check on review sheet | S | One derivation in dev |
| **Total Phase 1** | **S** | Single focused PR |

No migration, no i18n keys, no UI changes required for Phase 1 (UI already built).

---

## 8. Phases

### Phase 1 — Pipeline wiring (recommended next PR)

1. Import `buildPassagemOlharVerdict`, `validateExportReadiness`, `updateDerivationDualVerdict` in `creative-quality-gate.ts`
2. After `updateDerivationQualityGate`, compute and persist dual verdict
3. Add integration test: mock `analyzeCreativeQa` → assert `updateDerivationDualVerdict` called with expected payloads
4. Run focused tests: `npm test -- creative-quality-gate export-validation olhar-qa derivation.test`
5. Manual: complete one derivation, open review sheet, confirm Olhar/Export badges populated

### Phase 2 — Scoring alignment (optional)

1. Extend `updateDerivationScore` to accept Olhar fields from scorer output
2. Merge or prefer deterministic `buildPassagemOlharVerdict` over LLM when both exist
3. Document precedence in `docs/ARCHITECTURE.md`

### Phase 3 — QA route cleanup (optional)

1. Add `validateExportReadiness` to QA route for parity
2. Evaluate demoting QA to explicit re-run (credit-gated refresh) vs automatic on approval
3. Update `DerivationCard` QA button copy/visibility

### Phase 4 — Backfill (optional, operator-triggered)

1. Script: find `completed` derivations with `qualityGatedAt` but null dual verdict
2. Recompute from stored `hardFailures`, `qaChecklist`, `creativeContract`, `ctaText` without re-running vision QA
3. Report counts for calibration readiness

---

## 9. Open questions

1. **Calibration rule:** Should `hasDualVerdict` require both payloads, or is `exportStatus` alone sufficient for export-agreement metrics when Olhar is null (export-only failures)?
2. **Scorer precedence:** When LLM scorer returns `olharVerdict: "quase"` but deterministic builder returns `sem_opiniao`, which wins for review UI and regeneration briefs?
3. **QA route future:** Keep post-approval QA as paid refresh, or remove once pipeline owns dual verdict?
4. **Backfill priority:** How many in-flight `completed` derivations lack dual verdict in production? Worth Phase 4 before next calibration run?
5. **Analytics:** Should `beta_analytics` emit `dual_verdict_computed` with `{ olhar, export, hardFailureCodes }` for owner dashboard (related but separate from auto-retry observability researched 2026-06-29)?
6. **Override audit:** When reviewer overrides a `bloqueado` export via Phase 141 override UX, should original pipeline verdict be preserved in `generationLog` for calibration disagreement analysis?

---

## Verification performed

- Read `creative-quality-gate.ts`, `derivation.ts`, `qa/route.ts`, `export-validation.ts`, `olhar-qa.ts`, `client-approval-package.ts`, `cenbrap-calibration.ts`, `DerivationReviewSheet.tsx`
- Grep confirmed `updateDerivationDualVerdict` production callers: QA route + seed scripts only
- Grep confirmed `validateExportReadiness` production callers: tests only
- Cross-checked Phase 139 verification (12/12 passed) — modules verified in isolation, not pipeline integration
- No test suite run (research-only; no production code modified)

## References

- `.planning/phases/139-dual-verdict-and-export-validator/139-RESEARCH.md`
- `.planning/phases/139-dual-verdict-and-export-validator/139-VERIFICATION.md`
- `.planning/phases/141-review-surface-and-override-ux/141-CONTEXT.md`
- `app/src/server/ai/creative-quality-gate.ts` — `runCompletedDerivationQualityGate`
- `app/src/server/jobs/derivation.ts` — `"quality-gate"` step
- `app/src/server/ai/export-validation.ts` — `validateExportReadiness`
- `app/src/server/ai/olhar/olhar-qa.ts` — `buildPassagemOlharVerdict`
