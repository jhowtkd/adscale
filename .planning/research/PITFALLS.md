# Research: v13.2 Pitfalls

## Question

Common mistakes when adding multi-brand taste calibration and corpus-fed prompt rules?

## Pitfalls

### 1. Cross-brand rule leakage
**Warning:** Rule from Client A appears in Client B's prompt.
**Prevention:** Every query filters by `(workspaceId, clientProfileId)`; integration test with two profiles.
**Phase:** Voice config + prompt application (early).

### 2. Cenbrap regression on migration
**Warning:** Replacing hardcode breaks existing Cenbrap campaigns.
**Prevention:** Seed DB from `CENBRAP_VOICE`; snapshot tests on prompt output before/after.
**Phase:** Cenbrap migration (first).

### 3. Prompt bloat from unconstrained rules
**Warning:** 20+ corpus_quality lines degrade image model adherence.
**Prevention:** Cap active rules per `clientProfileId` (design: 10); deprecate oldest on overflow.
**Phase:** Prompt application.

### 4. Overfitting corpus slices
**Warning:** 3 evaluations on one campaign become "brand law."
**Prevention:** Enforce `MIN_SLICE_SAMPLE=3`, cooldown on reject, require post-approval evals for rule updates.
**Phase:** Proposal aggregator.

### 5. False quality claims per brand
**Warning:** "Brand X is calibrated" with fixture-only evidence.
**Prevention:** Reuse evidence levels (`uncalibrated` → `evidence_backed`); UI shows caveats.
**Phase:** Owner UI + evidence gate.

### 6. factual_issue as prompt rule
**Warning:** Weakening factual gate by moving failures to soft prompt hints.
**Prevention:** Block `factual_issue` in proposal→rule mapper; admin alert only.
**Phase:** Accept flow.

### 7. Duplicate learning paths
**Warning:** Cenbrap calibration_signals and corpus evaluations create conflicting rules.
**Prevention:** Unified `calibration_rules` table; category distinguishes source (`figure` vs `corpus_quality`).
**Phase:** Rule extraction + corpus accept.

### 8. Skipping generation log provenance
**Warning:** Cannot diagnose if rule actually affected output.
**Prevention:** Log `appliedBrandRuleIds` + `appliedCorpusRuleIds` on every derivation.
**Phase:** derivationJob wiring.

### 9. Global cross-client promotion too early
**Warning:** Two fixture brands trigger global rubric change.
**Prevention:** Require ≥2 clients AND source composition gate before global proposals.
**Phase:** Defer to late phase or v13.3.

### 10. Owner UI without server enforcement
**Warning:** UI hides rules but API still leaks cross-brand data.
**Prevention:** `requirePlatformOwner` + server-side `clientProfileId` resolution from corpus items.
**Phase:** 165 (PANEL).

### 11. Global rule query used for prompt injection
**Warning:** `listApprovedCorpusQualityRules()` without profile scope leaks cross-brand constraints into prompts.
**Prevention:** Prompt path must only use `(workspaceId, clientProfileId)` scoped queries; global list reserved for cross-client promotion aggregator.
**Phase:** 164 (APPLY).

### 12. Fixture-only accept without acknowledgment
**Warning:** Owner accepts corpus proposal from 100% `synthetic_fixture` slice; UI implies real calibration.
**Prevention:** Require explicit fixture acknowledgment on accept (design spec §6.4); block misleading panel copy.
**Phase:** 163 (LEARN) + 166 (EVIDENCE).

### 13. Missing `clientProfileId` on campaigns
**Warning:** Corpus items without resolvable profile cannot learn; silent skip hides coverage gaps.
**Prevention:** Warn in ingestion status; block or flag generation paths missing profile.
**Phase:** 162 (VOICE) — product decision in plan-phase.

## Sources Consulted

- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md` (§11 Risks)
- `.planning/milestones/v13.1-MILESTONE-AUDIT.md`
- v13.0 claims gate patterns
