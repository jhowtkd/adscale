# Research: Derivation Auto-Retry Observability & Transparency

**Date:** 2026-06-29  
**Author:** Cursor automation (weekly research)  
**Status:** Proposal — no production code changed  
**Scope:** One improvement — make the existing auto-retry pipeline measurable and optionally visible to users

---

## 1. Executive Summary

ADScale already runs a **silent, server-side auto-retry** inside the Inngest `derivationJob` when specific hard-failure codes are detected (Phase 121). The retry can replace the output image, re-score, and re-run the quality gate — but **nothing in the product surface or analytics records that this happened**.

Operators can only discover retries via a CLI audit script (`audit-campaign-session.mjs`). Users see the final image with no indication it was auto-corrected. Beta analytics has no events for retry triggers, outcomes, or COGS impact.

**Recommendation:** Add a **read-only observability layer** before expanding retry policy or charging policy. Phase 1 emits server-side analytics events and exposes `autoRetryAttempted` / `autoRetryReason` on derivation API responses. Phase 2 adds an owner funnel panel and optional user-facing badge. Defer credit-policy changes until 30+ days of measured retry success rates exist.

This is the highest-value, lowest-risk next step for the creative workflow: the retry machinery is built; the feedback loop is not.

---

## 2. Problem

### 2.1 What exists today

After initial generation, scoring, and quality gating, the derivation job evaluates `shouldAutoRetryDerivation()` and may run `runDerivationAutoRetry()` once per derivation:

| Layer | Location | Behavior |
|-------|----------|----------|
| Retry policy | `app/src/server/ai/derivation-auto-retry-policy.ts` | Mode-aware allowlist of retryable hard-failure codes |
| Retry execution | `app/src/server/ai/derivation-auto-retry.ts` | Second OpenAI `images.edit` call with correction prompt |
| Job orchestration | `app/src/server/jobs/derivation.ts` L1218–1450 | Steps: `auto-retry-on-text-failure` → `score-derivation-after-retry` → `quality-gate-after-retry` |
| Persistence | `derivations.generation_log` JSONB | `autoRetryAttempted: true`, `autoRetryReason: "cta_drift,..."` |
| CLI visibility | `app/scripts/audit-campaign-session.mjs` | Counts `autoRetries` per campaign session |

Retryable codes by mode (verified in `derivation-auto-retry-policy.test.ts`):

| Mode | Retryable codes |
|------|-----------------|
| `art_variation` | `cta_drift`, `unreadable_required_text`, `decorative_only_variation`, `visual_overload` |
| `format_adaptation` | `cta_drift`, `unreadable_required_text`, `invalid_format_layout`, `cropped_critical_content` |
| `restyling` | `style_reference_contamination`, `cta_drift`, `unreadable_required_text`, `copied_style_reference_facts` |

Explicitly **not** retryable: `missing_dominant_idea`, `invented_factual_entity`, `campaign_identity_drift`, `wrong_brand`, and other contamination/identity codes.

### 2.2 What is missing

| Gap | Evidence | Impact |
|-----|----------|--------|
| No API exposure | `Derivation` type in `use-derivations.ts` has no `autoRetry*` fields; `generationLog` is not returned by `/api/campaigns/[id]/derivations` | UI cannot show retry status |
| No analytics events | `BETA_EVENT_KEYS` in `beta-analytics/types.ts` has no `auto_retry_*` keys | Owner funnel cannot measure retry ROI |
| No user transparency | No i18n keys for auto-retry in `en.json` / `pt-BR.json` | Users cannot tell output was auto-corrected |
| Hidden COGS | Credits charged once at API boundary (`spendCreditsOrApiError`); job `track-usage` counts one derivation; auto-retry adds a second OpenAI image call for free | Margin blind spot; cannot justify credit policy |
| No success-rate baseline | `run-creative-validation.ts` measures retry in the validation harness, but production has no aggregate | Cannot decide whether to expand retryable codes (e.g. `missing_dominant_idea`) |
| Operator-only audit | `audit-campaign-session.mjs` requires `DATABASE_URL` + campaign ID | Not scalable for beta ops or release evidence |

### 2.3 Why this matters now

1. **Creative workflow trust:** When auto-retry succeeds, the user sees an acceptable/improvable output they did not explicitly request. Without transparency, support and review confusion increases ("why does this look different from the preview?").

2. **Quality gate evolution:** Phase 144+ focuses on human Cenbrap calibration. Auto-retry outcomes (verdict before vs after retry) are valuable training signal but are currently discarded except in `generation_log`.

3. **Billing integrity:** The product already tracks `creditDelta` when estimates diverge from actual spend (`credits.ts`). Auto-retry is the inverse — actual COGS exceeds billed credits with no telemetry.

4. **Deferred expansion:** Phase 121 explicitly deferred expanding retry beyond one attempt. Any expansion decision requires production success-rate data, not CLI spot checks.

---

## 3. Solution

### 3.1 Core proposal: Auto-Retry Observability Layer

Add three coordinated, backward-compatible surfaces:

#### A. Server analytics events (Phase 1a)

Emit from `derivation.ts` after the auto-retry step completes:

| Event key | When | Properties (allowlisted) |
|-----------|------|--------------------------|
| `derivation_auto_retry_triggered` | `shouldAutoRetryDerivation` returns true and retry starts | `generationMode`, `failureCodes[]`, `isPreview` |
| `derivation_auto_retry_succeeded` | Retry output passes quality gate OR improves verdict vs pre-retry | `generationMode`, `failureCodes[]`, `verdictBefore`, `verdictAfter`, `scoreDelta` |
| `derivation_auto_retry_unchanged` | Retry ran but verdict still blocking | `generationMode`, `failureCodes[]`, `verdictAfter` |

Implementation notes:
- Use existing `recordBetaAnalyticsEvent` from `server/beta-analytics/record.ts`
- Extend `ALLOWED_PROPERTY_KEYS` with `failureCodes`, `verdictBefore`, `verdictAfter`, `scoreDelta` (snake_case, no PII)
- Capture pre-retry verdict/score from the row before `runDerivationAutoRetry` mutates output
- Follow existing `credit_spend` server-side event pattern

#### B. API read-only fields (Phase 1b)

Expose derived fields on derivation list/detail responses (not raw `generationLog`):

```typescript
autoRetryAttempted?: boolean;
autoRetryReason?: string | null;  // comma-separated failure codes
```

Source: `generation_log.autoRetryAttempted` / `autoRetryReason` already persisted by the job. Map in the derivations repository or API route serializer. No schema migration required.

#### C. Owner analytics funnel (Phase 2)

Extend `buildAnalyticsFunnelSummary` in `aggregate.ts` with:

- Retry trigger count (7d / 30d)
- Success rate: `succeeded / triggered`
- Top failure codes retried
- Breakdown by `generationMode`

Surface in `OwnerAnalyticsPanel.tsx` as a new section under cockpit/quality metrics. EN + PT-BR i18n keys.

#### D. Optional user-facing badge (Phase 2, gated)

When `autoRetryAttempted === true` and final `qualityVerdict !== 'invalid'`:
- Show subtle badge on `DerivationCard` and `DerivationReviewSheet`: "Auto-corrected" / "Corrigido automaticamente"
- Tooltip lists `autoRetryReason` codes via existing `hardFailure` i18n keys

**Gate:** Ship only after Phase 1 analytics runs for ≥2 weeks and product owner approves copy.

### 3.2 Out of scope for this proposal

- Expanding `RETRYABLE_BY_MODE` codes
- Charging extra credits for auto-retry
- Second retry attempt (Phase 121 guard stays)
- Corpus admin UI or migration changes

---

## 4. Alternatives Considered

| Alternative | Description | Why not first |
|-------------|-------------|---------------|
| **A. Status quo** | Keep retry invisible; rely on CLI audit | No production metrics; blocks informed policy decisions |
| **B. Analytics only** | Events without API/UI fields | Faster, but review UI and support still blind |
| **C. UI only** | Expose fields without analytics | Helps users, but no aggregate ROI for operators |
| **D. Charge credits on retry** | Bill 1–2 credits when auto-retry runs | Premature without success-rate data; risks user backlash |
| **E. Expand retry codes first** | Add `missing_dominant_idea` to policy now | Higher COGS risk without observability; code is common in corpus fixtures but retry success unproven |
| **F. Full generation log in API** | Return entire `generationLog` JSON | Over-exposes internal steps; harder to keep stable as contract |

**Selected path:** B+C hybrid phased — analytics first (1a), API fields (1b), then owner panel (2), then optional user badge (2 gated).

---

## 5. Pros and Cons

### Pros

- **Zero new dependencies** — uses existing beta analytics, generation log, i18n patterns
- **No schema migration** — reads existing `generation_log` JSONB
- **No billing contract change** — observability only in Phase 1–2
- **Enables data-driven retry expansion** — success rates by failure code before policy changes
- **Aligns with Phase 121 completion** — closes the loop on implemented but unmeasured infrastructure
- **Low blast radius** — read-only API additions; analytics are server-emitted

### Cons

- **Analytics key proliferation** — three new event keys need allowlist + aggregate tests
- **Verdict-before capture** — job must snapshot pre-retry state before mutation (small job change in Phase 1a)
- **User badge may raise questions** — "why did it fail first?" needs careful copy
- **Historical backfill absent** — pre-ship derivations have `generation_log` but no analytics events; owner panel starts from deploy date unless backfill script added

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Analytics property allowlist rejection | Medium | Add keys to `ALLOWED_PROPERTY_KEYS` + fixture tests in `aggregate.test.ts` |
| Pre-retry snapshot race | Low | Read row inside same Inngest step before `runDerivationAutoRetry` |
| COGS pressure if retry rate high | Medium | Monitor `triggered / total_derivations`; alert threshold in owner panel |
| User confusion from badge | Low | Gate badge behind owner approval; use neutral "auto-corrected" copy |
| PII in failure messages | Low | Emit codes only in analytics properties, not free-text messages |
| i18n drift | Low | Update both `en.json` and `pt-BR.json` per project convention |

---

## 7. Effort

Technical scope (not calendar estimates):

| Phase | Components | Complexity |
|-------|------------|------------|
| 1a | `derivation.ts` event emission, `beta-analytics/types.ts`, `record.ts` tests | Small — ~80 LOC + tests |
| 1b | Repository mapper, `use-derivations.ts` type, derivations API route | Small — ~40 LOC |
| 2 | `aggregate.ts` funnel, `OwnerAnalyticsPanel.tsx`, i18n | Medium — ~150 LOC + tests |
| 2 (badge) | `DerivationCard.tsx`, `DerivationReviewSheet.tsx`, i18n | Small — ~60 LOC + tests |

**Total:** Small-to-medium. No migrations, no new packages, no CI/CD changes.

---

## 8. Implementation Phases

### Phase 1a — Server analytics (ship first)

1. Add `derivation_auto_retry_triggered`, `derivation_auto_retry_succeeded`, `derivation_auto_retry_unchanged` to `BETA_EVENT_KEYS`
2. Add allowlisted properties: `failureCodes`, `verdictBefore`, `verdictAfter`, `scoreDelta`
3. In `derivation.ts` auto-retry step:
   - Snapshot `qualityVerdict`, `qualityScore`, `hardFailures` before retry
   - Emit `triggered` at start
   - After re-gate, emit `succeeded` or `unchanged` based on verdict comparison
4. Tests: unit test for event property shape; extend `derivation.test.ts` step assertions

**Exit criteria:** Events appear in `beta_analytics_events` for staging derivations with retryable failures.

### Phase 1b — API exposure

1. Map `generation_log.autoRetryAttempted` / `autoRetryReason` to response DTO
2. Extend `Derivation` interface in `use-derivations.ts`
3. API route test asserts fields present when log has them

**Exit criteria:** `GET /api/campaigns/:id/derivations` returns `autoRetryAttempted: true` for retried rows.

### Phase 2 — Owner funnel

1. `aggregateCreditSurprises` pattern → new `aggregateAutoRetryFunnel(events)`
2. Owner panel section: trigger count, success rate, top codes, by-mode table
3. CSV export row in `feedback/analytics/export.csv/route.ts`
4. i18n EN + PT-BR

**Exit criteria:** Owner analytics shows non-zero retry metrics in staging after forced retry scenarios.

### Phase 2b — User badge (optional, gated)

1. Badge component in `DerivationCard` / `DerivationReviewSheet`
2. i18n: `autoRetryBadge`, `autoRetryTooltip`
3. Feature flag or env gate `AUTO_RETRY_BADGE_ENABLED` if desired

**Exit criteria:** Badge visible only when `autoRetryAttempted && qualityVerdict !== 'invalid'`.

### Future Phase 3 (separate proposal — not this run)

- Evaluate expanding `RETRYABLE_BY_MODE` for `missing_dominant_idea` if success rate ≥40%
- COGS dashboard: retry count × estimated image API cost
- Credit policy: partial charge or included-in-5-credits with disclosed cap

---

## 9. Open Questions

1. **User badge default:** Should auto-corrected outputs show a badge by default, or only in owner/debug mode until copy is validated?

2. **Success definition:** Is "succeeded" = verdict improved (e.g. `invalid` → `improvable`), or strictly `invalid` → `acceptable`? Recommendation: any strict improvement in verdict enum order.

3. **Preview batches:** Should preview derivations emit retry analytics separately (`isPreview: true`)? Recommendation: yes, tagged but excluded from billing COGS views.

4. **Historical backfill:** Run one-off script to emit synthetic `triggered` events from existing `generation_log` rows, or accept cold-start metrics?

5. **Retry vs manual regeneration:** When auto-retry fails and user clicks "Regenerate with fixes," should analytics link the two? Recommendation: add `sourceDerivationId` on manual regen events in a later phase.

6. **Cenbrap calibration:** Should contact sheets show auto-retry flag so human reviewers know the image is post-correction? Likely yes — aligns with Phase 144 evidence honesty.

---

## References

| Artifact | Path |
|----------|------|
| Auto-retry policy | `app/src/server/ai/derivation-auto-retry-policy.ts` |
| Auto-retry runner | `app/src/server/ai/derivation-auto-retry.ts` |
| Job orchestration | `app/src/server/jobs/derivation.ts` (steps 5c, post-retry score/gate) |
| Generation log schema | `app/src/server/ai/generation-log.ts` |
| CLI audit | `app/scripts/audit-campaign-session.mjs` |
| Beta analytics types | `app/src/server/beta-analytics/types.ts` |
| Phase 121 research | `.planning/phases/121-score-ceilings-and-retry/121-RESEARCH.md` |
| Validation harness retry | `app/scripts/run-creative-validation.ts` |
| Architecture doc | `docs/ARCHITECTURE.md` (derivation-auto-retry module) |

---

## Verification Performed

- [x] Confirmed `autoRetryAttempted` / `autoRetryReason` persisted in `generation_log` via job code review
- [x] Confirmed no `auto_retry` beta event keys in `types.ts`
- [x] Confirmed `Derivation` client type lacks auto-retry fields
- [x] Confirmed no i18n keys for auto-retry in `en.json` / `pt-BR.json`
- [x] Confirmed `audit-campaign-session.mjs` is the only production-adjacent visibility tool
- [x] Confirmed Phase 121 deferred retry expansion and UI work
- [ ] Test suite not run (research-only; no code changes)
- [ ] Live retry rate unknown (requires production/staging DB query — not available in this environment)
