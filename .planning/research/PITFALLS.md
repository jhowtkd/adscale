# Domain Pitfalls: v12.3 Integridade Criativa

**Domain:** Brownfield hardening of an existing AI image derivation pipeline (prompt → generate → score → QA → gate → retry → review)
**Milestone:** v12.3 Integridade Criativa
**Researched:** 2026-06-15
**Confidence:** HIGH for repository-specific risks (verified in code + audit corpus); MEDIUM for optimal phase numbering (roadmap not yet written)

## Scope and Proposed Phase Ownership

This milestone adds **integrity rules** to an existing pipeline — it does not replace generation, billing, or UI. The safest sequence wires rules into prompts first, then aligns gate/score/QA, then proves end-to-end with the audited corpus.

| Phase | Proposed ownership | Primary risk controlled |
|-------|-------------------|-------------------------|
| **115: Audit Corpus & Golden Fixtures** | Freeze `app/exports/render-creatives/` baseline; label Cantona, overload, generic-template, restyling-contamination, format-drift cases | Fixing the wrong problem; no measurable before/after |
| **116: Prompt Integrity Contract** | Wire dead constants, resolve preservation vs hierarchy conflicts, enforce injection order and token budget | Rules declared in code but never reach the model |
| **117: Mode-Specific Rule Packs** | `art_variation` hierarchy, `format_adaptation` same-campaign lock, `restyling` factual/visual split + API constraints | One-size-fits-all rules that break a mode |
| **118: Quality Gate Hardening** | Promote generic/template/hallucination to hard failures; score caps; taxonomy regex expansion | Gate passes outputs the audit already rejected |
| **119: Regression & Prompt Provenance** | Prompt snapshot tests, job-path wiring tests, fixture pipeline tests that fail when rules are dropped | 152/152 green while production still hallucinates |
| **120: Visual Validation Release Gate** | Re-score corpus; targets ≥75 mean / ≥95 fidelity; block milestone on known failure classes | “Rules merged” without evidence on real outputs |

Phase numbers continue after v12.2 Phase 114. The roadmapper may renumber, but each ownership boundary below should stay explicit.

---

## Critical Pitfalls

Mistakes that cause rewrites, false confidence, or repeat of the June 2026 audit failures (34 pieces, mean 58.5/100; invented entities, restyling contamination, format adaptations becoming different campaigns).

### 1. Integrity rules exist in source but never reach the prompt

**What goes wrong:** Engineers add `VISUAL_HIERARCHY_CONTRACT`, `ANTI_HALLUCINATION_RULES`, or similar constants beside `buildDerivationPrompt`, write unit tests for the classifier/gate, and ship — while the image model never sees the new text. Audit root cause: hierarchy and anti-hallucination rules were **declared but not injected**.

**Why it happens:** Brownfield prompts grow by accretion; new constants sit next to `CREATIVITY_TEMPLATES` without a single `parts.push()` path. Tests assert substrings for mode blocks (`MODE: art_variation`) but not for every contract module.

**Warning signs:**
- `grep` finds rule text only at definition sites, not inside `buildDerivationPrompt` `parts.push` calls.
- PR adds constants or docs but no change to prompt assembly order.
- `extractPromptHardRulesSection` / mode extractors have no counterpart for new sections.
- Manual render still shows Cantona/Manchester United–style invented subjects after “fix.”

**Prevention:**
- Treat **prompt injection** as the deliverable, not the constant definition.
- Add `extractPromptIntegritySection()` (or extend existing extractors) and snapshot tests per mode that fail if a module is dropped.
- Wire integrity blocks **immediately after** `HARD RULES` and **before** long flexible context (plan, hooks, memory).
- Log `promptProvenance.inputPrompt` hash in tests to catch job-path bypasses.

**Detection:** Diff prompt provenance for a golden fixture before/after; assert new sections present in stored `inputPrompt`, not only in `buildDerivationPrompt()` unit calls.

**Phase to address:** **116** (wiring), **119** (regression).

**Source evidence:** `app/src/server/ai/prompt-builder.ts:116-128` defines `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES`; repository grep shows no other references. `.planning/STATE.md` audit notes rules “declared but not injected.”

---

### 2. “Preserve every module” congests the canvas (overload pitfall)

**What goes wrong:** Outputs reproduce every badge, bullet row, icon, legal line, and secondary fact at equal size. The ad becomes an unreadable dashboard grid — the audit’s **visual overload** class. Users wanted hierarchy, got literal cloning.

**Why it happens:** `art_variation` mode instructs **MANDATORY PRESERVATION** of “every important piece” and lists headline, offer, badges, legal, etc., while `format_adaptation` names “separate modules” all to **PRESERVE EXACTLY**. These conflict with the (currently unwired) hierarchy contract that allows merging/omitting secondary facts when hook + offer + CTA suffice. Creativity templates for `bold`/`extreme` say “consolidate visual modules” but appear **after** preserve-all mode text, so the model follows the stronger literal instruction.

**Warning signs:**
- Dense reference creatives produce even denser derivatives.
- Audit fixtures labeled “overload” still score `informationPreservation: passed` because facts are present but illegible.
- Prompt contains both “do not delete information” and “merge secondary facts” without precedence rule.
- `elementsToPreserve` from creative diagnosis lists 8+ items with equal priority.

**Prevention:**
- Introduce a **canonical preservation model**: *factual completeness* ≠ *visual prominence*.
- Rank facts: **Tier A** (must appear legibly: hook, offer, CTA, logo, product/subject), **Tier B** (may merge/shrink: badges, duration, legal), **Tier C** (may omit from layout if meaning preserved elsewhere).
- Replace “preserve every module” with “preserve Tier A exactly; Tier B/C per hierarchy contract.”
- Cap diagnosis `elementsToPreserve` to ranked tiers, not flat lists.
- Gate: fail **overload** when >3 text modules compete at similar visual weight (new hard code or promoted `creativeRisk`).

**Detection:** Corpus case “overload”; thumbnail test at 320px width; vision QA note patterns like “crowded,” “dashboard layout,” “competing badges.”

**Phase to address:** **116** (prompt conflict resolution), **117** (art_variation pack), **118** (gate), **120** (corpus validation).

**Source evidence:** `prompt-builder.ts:338-345` (preserve-all), `348-358` (format module list), `94-106` (consolidate in bold/extreme only), unwired `VISUAL_HIERARCHY_CONTRACT:116-124`.

---

### 3. Generic AI template output treated as polish, not failure

**What goes wrong:** Neon stacks, glassmorphism cards, holographic grids, and “premium tech” gradients pass as `improvable` with polish notes like “Generic visual.” The product ships template-slop that fails the creative bar while `qualityVerdict` is not `invalid`.

**Why it happens:** `classifyCreativeRiskFailed` only promotes `creativeRisk: failed` to a hard failure when the note matches `UNSUPPORTED_OFFER_PATTERN`. Everything else — including generic/template language — goes to `polishSuggestions`. `deriveQualityVerdict` returns `acceptable` when score ≥70 and no hard failures, even with checklist warnings. QA prompt says “Export must remain allowed” and uses `warning` for soft issues.

**Warning signs:**
- `creativeRisk: warning` with “generic” in note does not block approve.
- No hard-failure code for `generic_template` / `invented_entity` in taxonomy.
- Mean corpus score stuck ~58 while most derivations are `improvable`, not `invalid`.
- Tests explicitly expect `creativeRisk: { status: "warning", note: "Generic visual." }` as normal.

**Prevention:**
- Add hard-failure codes (e.g. `generic_template`, `invented_entity`) with taxonomy patterns and QA/score instructions.
- Map known AI trope phrases from `VISUAL_HIERARCHY_CONTRACT` into gate patterns.
- Apply **score ceiling**: e.g. if `creativeRisk` failed or `generic_template` fired, cap `qualityScore` at 65 regardless of visual polish.
- Separate **export copilot** (warn) from **approve/save-as-reference** (block) — already partially true; extend blocking to generic-template class for campaign workflow.
- Update `quality-fixtures.ts` with a `generic_template` fixture expecting `invalid`.

**Detection:** Re-run audited corpus; count pieces with trope markers; approve path must 409 on new codes.

**Phase to address:** **118** (gate + taxonomy), **119** (fixtures), **120** (corpus metrics).

**Source evidence:** `creative-quality-gate.ts:144-158`, `406-419`; `creative-qa.test.ts:22` generic as warning; `prompt-builder.ts:124` tropes list unused in prompt.

---

### 4. Restyling imports factual claims from the style reference

**What goes wrong:** Output shows the style reference’s offer, price, brand, or CTA instead of the base image’s — e.g. unrelated discount text copied from style ref. Prompt says not to; `images.edit` with two images still treats style as content.

**Why it happens:** API-level style transfer collages references. Prompt has `RESTYLING FACTUAL-SOURCE RULE` only when `contract?.styleAssetId` is set. Scoring/QA can catch `copied_style_reference_facts`, but **auto-retry is explicitly disabled for restyling** (`derivation.ts` skips retry when `effectiveGenerationMode === "restyling"`), and retryable codes exclude `copied_style_reference_facts`.

**Warning signs:**
- Restyling outputs read like the style reference’s campaign.
- `styleFidelity: failed` in QA but job does not auto-retry.
- `visualTokenBrief` injected for restyling may carry style-reference **content** tokens, not just visual language.
- Tests cover prompt strings but not two-image edit ordering/constraints.

**Prevention:**
- Strengthen restyling prompt: base image = sole text/fact source; style = palette/typography/mood only; **negative list** of facts not to copy.
- Strip factual tokens from `visualTokenBrief` for restyling or omit brief entirely for facts.
- Extend `RETRYABLE_FAILURE_CODES` for restyling-only: `copied_style_reference_facts`, optionally `wrong_brand` when style contamination.
- Remove blanket `restyling` skip in auto-retry; replace with mode-specific retry policy.
- Consider vision pre-pass on style ref to extract **non-factual** style descriptors only (future; flag in research).

**Detection:** `quality-fixtures.ts` `fixture-style-reference-contamination`; manual restyling with mismatched offers in base vs style.

**Phase to address:** **117** (restyling pack + job), **118** (retry policy), **119** (integration tests).

**Source evidence:** `derivation.ts:892-895` restyling retry skip; `derivation-auto-retry-policy.ts:3-6` only `cta_drift` + `unreadable_required_text`; `prompt-builder.ts:326-331` factual-source rule; `docs/plans/2026-05-03-restyling-style-transfer-design.md` collage risk.

---

### 5. Format adaptation becomes a different campaign

**What goes wrong:** `format_adaptation` outputs a new concept, new photo, rewritten copy, or “sibling creative” instead of the same ad in a new aspect ratio — matching audit finding that adaptations “viram outra campanha.”

**Why it happens:** Non-mode context still injects creative variation pressure: plan strategy/hooks, `visualTokenBrief` (“new ad from the same campaign system”), campaign memory, competitor context. `format_adaptation` forbids creativity level but not **variation language** elsewhere. Scoring still evaluates `variationLevelFit` for all modes.

**Warning signs:**
- 9:16 output shares copy but not visual identity with 1:1 source.
- `briefMatch: failed` or `invalid_format_layout` under-trigger because model note wording misses regex.
- Prompt contains “perceptibly different” or “sibling creative” strings in format_adaptation jobs.
- Approved-winner package path still loads diagnosis meant for art_variation.

**Prevention:**
- **Mode firewall:** for `format_adaptation`, strip or demote plan hooks/angles, diagnosis variation opportunities, memory blocks that suggest repositioning the concept.
- Replace “new ad from same system” with “same ad, native layout for {format}” in token brief usage.
- Hard-rule: **no new photos, no copy edits, no new modules** (already present — enforce via prompt snapshot + negative examples).
- Gate: tighten `invalid_format_layout` patterns; add `campaign_identity_drift` hard code when briefMatch fails on product/offer/photo identity for format mode only.
- Score: skip or fix `variationLevelFit` for format_adaptation (always “preserved layout intent”).

**Detection:** Corpus format_adaptation pairs (1:1 source → 9:16/4:5); side-by-side identity check in Phase 120.

**Phase to address:** **117** (format pack), **118** (gate), **120** (paired format validation).

**Source evidence:** `prompt-builder.ts:348-375` vs `480-485` visualTokenBrief; `.planning/STATE.md` format drift failure; `PROJECT.md` audit baseline.

---

### 6. Tests pass while rules never reach production prompts

**What goes wrong:** CI stays green (152/152 cited in audit) but production still hallucinates. Unit tests validate **classifier** behavior on synthetic JSON fixtures, not the **full job path** from contract → `buildDerivationPrompt` → stored provenance → image → gate.

**Why it happens:**
- `quality-fixture-pipeline.test.ts` feeds synthetic `rawQaModelOutput` — never builds prompts or calls OpenAI.
- `prompt-builder.test.ts` checks mode/CTA substrings, not integrity modules or cross-mode absence.
- No test asserts `VISUAL_HIERARCHY_CONTRACT` / `ANTI_HALLUCINATION_RULES` in built prompt.
- Integration tests mock image generation; provenance can drift from what job actually sends.

**Warning signs:**
- New integrity PR touches `creative-quality-gate.ts` but not `prompt-builder.ts`.
- Snapshot tests use `extractPromptHardRulesSection` only — missing hierarchy/anti-hallucination extractors.
- Fixture IDs do not include audit cases: Cantona, overload, generic template.

**Prevention:**
- **Three-layer test matrix:** (1) prompt contract snapshots per mode, (2) classifier fixtures, (3) job wiring test: mock OpenAI capture `input` prompt body.
- Add **negative tests**: e.g. `format_adaptation` prompt must NOT contain `CREATIVITY LEVEL`; restyling must NOT contain plan CTAs as authoritative.
- Add **corpus-linked fixtures** from `app/exports/render-creatives/manifest.json` with expected verdict classes.
- CI rule: changes to `prompt-builder.ts` require matching snapshot update in same PR.

**Detection:** Deliberately remove one `parts.push` line — CI must fail.

**Phase to address:** **115** (fixtures), **119** (regression suite).

**Source evidence:** `quality-fixtures.ts` synthetic only; `prompt-builder.test.ts` scope; `.planning/STATE.md` “152/152 pass without detecting failures.”

---

### 7. Auto-retry policy too narrow and restyling excluded

**What goes wrong:** First-pass failures that are cheap to fix (style contamination, format layout, invented entity) persist because retry never runs. Restyling always skips retry even for text/CTA failures.

**Why it happens:** `RETRYABLE_FAILURE_CODES` = `{ cta_drift, unreadable_required_text }` only. Job hard-codes `effectiveGenerationMode === "restyling"` → no retry. Correction feedback may not include mode-specific integrity reminders.

**Warning signs:**
- Logs show `hardFailures` with `copied_style_reference_facts` but no `[auto-retry]` line.
- Regenerate rate spikes while auto-retry rate is zero.
- Users manually regenerate for failures the system could fix once automatically.

**Prevention:**
- Mode-specific retry allowlists:
  - `art_variation`: CTA, legibility, cropped content, generic template (if added)
  - `format_adaptation`: `invalid_format_layout`, cropped content
  - `restyling`: `copied_style_reference_facts`, `cta_drift`, legibility — **remove blanket skip**
- Cap at one auto-retry per derivation (keep `autoRetryAttempted`).
- Append compact integrity correction block from `buildHardFailureRegenerationSuggestion` + mode rules.

**Detection:** Integration test per mode: inject hard failure → expect retry step invoked.

**Phase to address:** **117** (job policy), **118** (codes), **119** (tests).

**Source evidence:** `derivation-auto-retry-policy.ts:3-6`; `derivation.ts:891-895`.

---

### 8. Conflicting instructions in one prompt (attention dilution)

**What goes wrong:** Adding integrity gates **lengthens** an already long prompt (hard rules + mode + creativity template + diagnosis + plan + brand kit + memory + client refs). The model satisfies the last strong instruction or averages conflicting ones — often “preserve everything” wins over hierarchy.

**Why it happens:** Brownfield addition stacks rules without **precedence** or **deduplication**. Flexible guidance (“Creative strategy… must not override hard rules”) appears once, but plan CTAs and hooks still appear above the fold.

**Warning signs:**
- `inputPrompt` length increases >30% in v12.3 without score improvement.
- Same concept repeated in 4+ sections (CTA repeated in hard rules, mode, creativity template, plan).
- Engineers add new paragraphs instead of replacing contradictory ones.

**Prevention:**
- **Single precedence block** at top: `1. Hard contract → 2. Mode rules → 3. Integrity (hierarchy, anti-hallucination) → 4. Flexible context`.
- Deduplicate: if CTA in `ctaSemantics`, omit redundant literal CTA paragraphs.
- For integrity milestone, **remove** conflicting legacy lines rather than appending fixes.
- Measure prompt tokens per mode; budget cap with trim order for lowest-priority sections (competitor analyses first).

**Detection:** Prompt diff review checklist; A/B on corpus subset when shortening.

**Phase to address:** **116** (contract editing), **117** (mode packs).

**Source evidence:** `buildDerivationPrompt` structure `310-516` — many stacked sections; audit root cause “preserve-all-modules prompts cause congestion.”

---

## Moderate Pitfalls

### 9. Gate classifier depends on fragile note regex

**What goes wrong:** Vision model describes a real failure with different wording; `classifyCreativeRiskFailed` and `classifyScoreIssue` miss it; output marked `improvable`.

**Prevention:** Expand patterns in `creative-quality-taxonomy.ts`; require structured QA notes (`code` + `message`); add fallback promotion when `scoreIssues` and checklist disagree.

**Phase:** **118**, **119**

**Source:** `creative-quality-taxonomy.ts:63-82`; gate classifiers in `creative-quality-gate.ts`.

---

### 10. Quality gate failure silently degrades to improvable

**What goes wrong:** `runCompletedDerivationQualityGate` catch block calls `persistQualityGateFallback` → empty hard failures, `improvable`. Transient vision errors make bad outputs approvable under polish threshold.

**Prevention:** Distinguish infra failure (retry gate step) from classification result; do not clear hard failures on catch; metric alert on gate fallback rate.

**Phase:** **118**, **120**

**Source:** `creative-quality-gate.ts:440-450`, `514-519`.

---

### 11. Creative diagnosis reintroduces preserve-all behavior

**What goes wrong:** `elementsToPreserve` lists every visible element; prompt says “Preserve the listed elements” with equal weight, undoing hierarchy rules.

**Prevention:** Diagnosis output schema tiers; prompt maps diagnosis to Tier A/B only; validate diagnosis length and rank.

**Phase:** **116**, **117**

**Source:** `prompt-builder.ts:398-405`.

---

### 12. Scoring and gating use different philosophies

**What goes wrong:** `analyzeDerivationCreative` labels `visualQuality` as “creative risk / **polish**”; high visual score offsets low information preservation in user mental model even when gate says `invalid`.

**Prevention:** Align score prompt with gate codes; when any hard failure present, force `qualityScore` cap; UI already uses `qualityVerdict` — ensure API consumers cannot approve on score alone (existing `assertDerivationApprovable`).

**Phase:** **118**

**Source:** `creative-score.ts:208`, `46-CONTEXT.md` QA-03.

---

### 13. Integrity work expands into unrelated pipeline refactors

**What goes wrong:** Milestone scope creeps into billing, UI redesign, new generation models, or Mem0 strategy — delaying integrity shipping.

**Prevention:** Freeze v12.3 non-goals in REQUIREMENTS.md: no new generation provider, no gallery UX overhaul, no plan-generation changes unless required for fact tiers.

**Phase:** **115** (scope contract)

**Source:** `.planning/PROJECT.md` v12.3 feature list — focused on pipeline integrity.

---

## Minor Pitfalls

### 14. Hardcoded English gate patterns miss PT-BR QA notes

**What goes wrong:** Brazilian campaigns produce QA notes in Portuguese; regex like `cta missing` does not match `CTA ausente`.

**Prevention:** Bilingual patterns or canonical English codes from model JSON schema; locale-aware examples in QA prompt.

**Phase:** **118**

---

### 15. Preview vs full-res paths diverge

**What goes wrong:** Preview jobs use smaller image size; integrity rules behave differently; tests only cover one path.

**Prevention:** Run corpus validation on full-res; document preview as best-effort only.

**Phase:** **120**

**Source:** `derivation-auto-retry.ts` `isPreview` flag.

---

### 16. Export allowed while approve blocked confuses operators

**What goes wrong:** Users export `invalid` ads thinking export implies quality.

**Prevention:** Keep export policy but surface `qualityVerdict` + hard-failure badges prominently (minimal UI in scope if needed for integrity milestone).

**Phase:** **118** (API clarity), optional thin UI in **120**

**Source:** `46-CONTEXT.md` export vs approve table.

---

## Integration Gotchas

| Integration | Common mistake | Correct approach |
|-------------|----------------|------------------|
| `buildDerivationPrompt` ↔ `CreativeContract` | Contract fields resolved in job but omitted from prompt sections | Single `derivationConfigFromContract()` path; snapshot per `generationMode` |
| `prompt-builder` ↔ `creative-score` / `creative-qa` | Different instructions for same failure (generic vs unsupported offer) | Shared taxonomy module; same codes in score, QA, and gate prompts |
| `images.edit` (restyling) ↔ prompt | Prompt says “style only” but API merges content | Mode-specific job inputs + gate catches contamination + retry |
| `creativeDiagnosis` ↔ integrity tiers | Diagnosis preserves all bullets | Tier-ranked diagnosis schema |
| `quality-fixtures` ↔ audit corpus | Synthetic JSON only | Import manifest IDs from `render-creatives/` |
| `derivation-auto-retry` ↔ gate | Retry codes don’t match hard-failure taxonomy | Single source of truth for retryable codes per mode |
| `plan.ctas` / hooks ↔ hard CTA | Model follows plan CTA despite literal rule | Keep “secondary context only” + strip in format/restyling modes |

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| **115** Corpus baseline | Chasing 34 images manually without labels | Tag failure class per manifest entry first |
| **116** Prompt wiring | Appending without removing preserve-all | Edit conflicting lines; precedence block |
| **117** art_variation | Killing legitimate variation while fixing overload | Tier A/B model; keep creativity templates for layout only |
| **117** format_adaptation | Over-stripping context needed for layout | Keep module list + zone guidance; strip variation only |
| **117** restyling | Enabling retry without style-safe correction | Retry prompt must repeat factual-source rule |
| **118** Gate | Over-blocking `improvable` polish | Only promote well-defined codes; keep warnings for subjective fit |
| **119** Tests | Mock-only green CI | Job capture test for final `inputPrompt` |
| **120** Release | Optimizing mean score without fixing Cantona class | Per-class SLO: zero invented-entity approvals |

---

## Anti-Patterns When Adding Integrity Gates (Ecosystem + ADScale)

| Anti-pattern | Why it fails here | Do instead |
|--------------|-------------------|--------------|
| Prompt-only fix (no gate change) | Image models ignore long instructions; audit already had unpushed rules | Wire prompt **and** gate **and** tests together |
| Gate-only fix (no prompt change) | Retry/regen repeats same failure | Fix upstream generation contract first |
| One global “be faithful” paragraph | Conflicts with art_variation “be different” | Mode-specific rule packs |
| Treating RAG/memory as integrity | Mem0/competitor blocks add **more** facts to hallucinate from | Integrity sources = reference image + contract only; memory stays “flexible guidance” |
| Always-on chain-of-thought in QA | Latency/cost; inconsistent JSON | Structured checklist with required codes |
| Regex as sole classifier | Vision wording drift | Structured model output + regex backup |
| Expanding retry to all codes | Cost/latency explosion | One retry per derivation; mode allowlists |
| Validating only English copy | PT-BR campaigns dominate | Bilingual or code-based QA notes |

---

## “Looks Done But Isn’t” Checklist

- [ ] `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` appear in **built** prompts for relevant modes (not just defined).
- [ ] No prompt contains both “preserve every module” and “merge/omit secondary facts” without explicit precedence.
- [ ] `generic` / template outputs produce **hard failures** or capped scores, not only polish.
- [ ] Restyling `copied_style_reference_facts` triggers **retry** (not skipped).
- [ ] `format_adaptation` prompts contain no art-variation variation language.
- [ ] Audit corpus re-scored: invented-entity class → 0 approvable; mean ≥75 target documented.
- [ ] Changing `prompt-builder.ts` fails CI without snapshot/provenance update.
- [ ] Gate fallback rate monitored; not used to mask systematic QA misses.
- [ ] `qualityVerdict: invalid` blocks approve/save-as-reference (existing) for **new** integrity codes.
- [ ] PT-BR and EN QA notes classify correctly.

---

## Recovery Strategies

| Pitfall | Recovery cost | Recovery steps |
|---------|---------------|----------------|
| Dead constants shipped | LOW | Wire `parts.push`; add extractor tests; redeploy |
| Preserve-all congestion | MEDIUM | Rewrite mode block + diagnosis tiers; regen corpus subset |
| Generic as polish | MEDIUM | Add hard codes + fixtures; rescore existing derivations |
| Restyling contamination | MEDIUM | Retry policy + prompt negative rules; optional pre-extract style |
| Format drift | HIGH | Strip variation context; paired format golden tests |
| False-green tests | MEDIUM | Add job prompt capture + corpus fixtures |
| Prompt bloat | MEDIUM | Precedence pass + dedupe; measure tokens |

---

## Pitfall-to-Phase Mapping (Summary)

| Pitfall | Prevention phase | Verification |
|---------|------------------|--------------|
| Rules not injected | 116 | Prompt extractors + job provenance |
| Preserve-all overload | 116, 117 | Overload corpus case + thumbnail test |
| Generic = polish | 118 | `generic_template` fixture → `invalid` |
| Restyling fact import | 117, 118 | Contamination fixture + retry invoked |
| Format → new campaign | 117, 118 | Paired format corpus |
| Tests pass, prompts wrong | 119 | Remove-line_must-fail CI |
| Retry too narrow / restyling skip | 117, 118 | Per-mode retry integration tests |
| Prompt conflicts / bloat | 116, 117 | Token budget + precedence review |
| Regex classifier drift | 118, 119 | Structured QA codes |
| Gate fallback masks failures | 118, 120 | Fallback rate metric |
| Diagnosis preserve-all | 116, 117 | Tier schema validation |
| Score vs gate mismatch | 118 | Cap score when hard failures |
| Scope creep | 115 | REQUIREMENTS non-goals |
| PT-BR patterns | 118 | Bilingual fixture notes |
| Preview/full diverge | 120 | Full-res corpus gate |

---

## Sources

### Audit and milestone context

- `.planning/PROJECT.md` — v12.3 goals, corpus baseline (34 pieces, mean 58.5), target metrics
- `.planning/STATE.md` — root causes: preserve-all congestion, unwired rules, generic as polish, 152/152 false comfort
- `app/exports/render-creatives/manifest.json` — audited output corpus

### Live pipeline (verified 2026-06-15)

- `app/src/server/ai/prompt-builder.ts` — unwired integrity constants; preserve-all mode text; restyling factual rule
- `app/src/server/ai/creative-quality-gate.ts` — `creativeRisk` → polish default; gate fallback
- `app/src/server/ai/creative-quality-taxonomy.ts` — regex patterns
- `app/src/server/ai/derivation-auto-retry-policy.ts` — narrow retry codes
- `app/src/server/jobs/derivation.ts` — restyling retry skip; quality-gate step
- `app/src/server/ai/quality-fixtures.ts` — synthetic classifier fixtures
- `app/tests/unit/prompt-builder.test.ts` — prompt substring coverage gaps
- `.planning/phases/46-hard-quality-gate/46-CONTEXT.md` — hard vs polish taxonomy, export vs approve

### Ecosystem (MEDIUM confidence — patterns, not ADScale-specific)

- Ground generation in reference image + contract, not model memory alone ([Grooper LLM hallucinations](https://grooper.com/blog_posts/llm-hallucinations/))
- Prompt engineering alone insufficient for factual fidelity at scale; gate with retrieval/verification layer ([Deepchecks RAG vs prompt engineering](https://deepchecks.com/rag-vs-prompt-engineering-how-to-choose/))
- Image control: explicit prohibitions and structured methodology outperform vague positive instructions ([SCHEMA for Gemini image generation](https://arxiv.org/html/2602.18903))

---
*Pitfalls research for: v12.3 Integridade Criativa (brownfield creative integrity gates)*
*Researched: 2026-06-15*
