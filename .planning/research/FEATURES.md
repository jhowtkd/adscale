# Feature Landscape: v12.3 Integridade Criativa

**Domain:** Creative QA for performance ad derivation pipelines (static image ads)
**Researched:** 2026-06-15
**Confidence:** HIGH for ADScale baseline and v11.5 dependency inventory (code-evidenced); MEDIUM for industry differentiators (web sources, not ADScale-validated)

## Research Frame

ADScale's v11.5 milestone shipped contract-aware prompts, shared taxonomy, hard-failure classification, synthetic fixtures, and regeneration briefs — but the **June 2026 audit corpus** (`app/exports/render-creatives/`, 34 pieces, **58.5/100 average**) shows the pipeline still approves creatives that violate creative integrity: invented entities (e.g. Cantona / Manchester United), restyling factual contamination, format adaptations that become different campaigns, and generic AI-template aesthetics that score "acceptable."

Root cause pattern: **rules declared in code are not always enforced in prompts, QA rubrics, or gate thresholds.** `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` exist in `prompt-builder.ts` but are not injected into `buildDerivationPrompt`. QA prompts lack entity-invention checks. `creativeRisk` subjective failures stay polish-only, so polished slop passes.

Industry pattern (2025–2026, MEDIUM confidence): effective creative QA uses a **hybrid cascade** — generation → deterministic contract checks → vision-model rubric → score caps → bounded retry → regression fixtures → human review for ambiguous cases. ADScale already has the skeleton; v12.3 hardens the middle layers.

### Audit Baseline (must inform fixtures)

| Failure class | Example | Current gate behavior |
|---------------|---------|------------------------|
| Invented entities | Celebrity/team not in reference or brief | No dedicated hard-failure code; may pass `creativeRisk` as warning or pass entirely |
| Visual hierarchy overload | Every fact at equal weight; card-grid clutter | Not in QA checklist; contract text unused in prompts |
| Generic AI aesthetic | Neon glow, glassmorphism, template look | `creativeRisk` → polish only unless note matches unsupported-factual regex |
| Restyling contamination | Style-ref facts replace base facts | `copied_style_reference_facts` exists; prompt section present; audit still shows misses |
| Format adaptation drift | 9:16 becomes different campaign | `invalid_format_layout` for format_adaptation only; subjective "different ad" may slip through |

**Milestone targets (from PROJECT.md):** ≥75 average score, ≥95% factual fidelity on audited failure modes, regression tests that catch "declared but not applied" rules.

---

## Category Map

Features grouped by v12.3 workstream. Each item tagged **Table stakes (TS)**, **Differentiator (D)**, or **Anti-feature (AF)**.

### 1. Fixtures / Baseline

Reproducible evidence line for quality work — extends v11.5 synthetic fixtures with **audited real failure archetypes** (sanitized).

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Corpus manifest + scoring snapshot** — versioned index of audited creatives with mode, format, score, verdict, failure tags | TS | Without a frozen baseline, "58.5 → 75" is unmeasurable | Low | `app/exports/render-creatives/manifest.json` exists; wire to eval runner |
| **Six synthetic failure fixtures (wrong CTA, crop, style contamination, format, preservation, legibility)** | TS (exists) | CI-safe gate/regression anchor | Low | **FIX-01** `quality-fixtures.ts` — extend, don't replace |
| **Audited archetype fixtures** — Cantona/invented-entity, hierarchy-overload, generic-template-pass | TS | Captures gaps synthetic fixtures miss | Medium | New fixture IDs; fictional data for CI, optional redacted PNG refs for manual/visual gate |
| **Per-mode baseline sets** — min N cases each for `art_variation`, `restyling`, `format_adaptation` × key formats (1:1, 9:16, 4:5) | TS | Mode-specific rules need mode-specific baselines | Medium | Builds on `prompt-builder.test-fixtures.ts` contracts |
| **Prompt hash + contract snapshot per baseline run** | D | Proves which rule version produced each output | Low | **AIC-05** `promptProvenance` already persisted |
| **Customer creative fixtures in CI** | AF | Privacy/consent risk | — | v11.5 explicitly out of scope (**AIF-FUT-03**) |

**MVP:** Extend fixture catalog with 3 audited archetypes + corpus eval script that reports mean score and fidelity rate.

---

### 2. Creative Contract

Canonical machine-readable rules the prompt, QA, score, and gate all cite.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **`CreativeContract` per derivation** (mode, format, CTA semantics, client/product/offer, asset IDs, factual-source rules) | TS (exists) | Single source of truth for preservation | Low | **AIC-01** `creative-contract.ts` |
| **Dominant-idea + three-tier hierarchy clause** in contract (hook / support / CTA) | TS | Directly addresses overload failures | Medium | New contract fields or prompt sections derived from contract; today only dead constants in `prompt-builder.ts` |
| **Factual inventory attachment** — entities/copy that must not change vs may compress visually | D | Makes "preserve meaning, not equal weight" machine-checkable | High | Needs vision QA or preflight linkage; `creativeDiagnosis.elementsToPreserve` partial precedent |
| **Creativity level as contract input** with preservation floor | TS (exists) | art_variation already uses conservative→extreme templates | Low | **AIC-02** creativity templates in `prompt-builder.ts` |
| **Duplicate conflicting rules across prompt/QA/score** without shared module | AF | Drift guaranteed (current state for hierarchy + anti-hallucination) | — | Taxonomy module pattern from **AIQ-01** should extend to rule blocks |

**MVP:** Wire `VISUAL_HIERARCHY_CONTRACT` + `ANTI_HALLUCINATION_RULES` into `buildDerivationPrompt` via shared exported sections; mirror same text in QA/score prompts.

---

### 3. Factual–Visual Separation

Especially critical for `restyling`; also applies when style references or competitor context leak into art variation.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Base = facts, style ref = visual language only** in generation prompt | TS (exists) | Core restyling integrity | Low | **AIC-04** + `RESTYLING FACTUAL-SOURCE RULE` block |
| **`styleFidelity` QA criterion (restyling + styleAssetId)** | TS (exists) | Detects style-ref factual copy | Medium | **AIQ-01** optional criterion in `creative-qa.ts` |
| **`copied_style_reference_facts` hard failure** | TS (exists) | Blocks approval/export | Low | **AIQ-03** gate classifier |
| **Entity invention detection** (people, teams, products, logos not in base/brief) | TS | #1 audit failure; not covered by current seven codes | High | New failure code or `unsupported_offer`/`briefMatch` pattern extension + prompt + QA rubric |
| **Competitor / brand-memory facts treated as non-authoritative for rendering** | TS | Prevents cross-brand hallucination | Medium | `competitor-analyzer` + `brandMemory` prompt sections need explicit subordination to hard rules |
| **Blind trust of LLM "Do not invent" instruction without QA check** | AF | Proven insufficient in audit | — | Must pair with observable rubric |

**MVP:** Add `invented_entity` (or equivalent) to taxonomy + gate; QA/score prompts require comparing visible entities to contract + reference inventory.

---

### 4. Per-Mode Rules

Generation and evaluation differ materially by mode — shared taxonomy, mode-specific hard-failure emphasis.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **art_variation:** perceptible difference + mandatory preservation + anti-crop + hierarchy cleanup | TS (exists) | Core product mode | Medium | Mode block in `buildDerivationPrompt`; tests in **AIC-02** |
| **art_variation:** creativity level operational rules (conservative→extreme) with inviolable text/facts at bold/extreme | TS (exists) | Prevents typo drops at high creativity | Low | `CREATIVITY_TEMPLATES` |
| **format_adaptation:** native layout, no letterbox/blur bands, module rearrangement not resize | TS (exists) | #1 format failure class | Medium | **AIC-03**; `invalid_format_layout` hard fail only in this mode |
| **format_adaptation:** approved-derivation package source preservation | TS (exists) | Winner-to-format workflow | Low | `packageSource` branch in prompt |
| **restyling:** base factual lock + style language borrow | TS (exists) | Audit contamination class | Medium | **AIC-04** |
| **Mode-specific QA checklist extensions** (e.g. variation perceptibility for art_variation, native zones for 9:16) | D | Catches "passes generic checklist but wrong mode" | Medium | Extend `buildCreativeQaPrompt` conditionally |
| **One-size-fits-all preservation list across modes** | AF | format_adaptation needs exact copy; art_variation needs recomposition | — | Mode blocks already diverge — preserve |

**MVP:** Per-mode QA instruction blocks + fixtures asserting mode-specific failures classify correctly (extend **FIX-02/03**).

---

### 5. Observable Rubric

What reviewers (human or vision model) must score — structured, not vibes.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Shared taxonomy dimensions:** legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk, styleFidelity | TS (exists) | Consistent vocabulary | Low | **AIQ-01** `creative-quality-taxonomy.ts` |
| **Schema-normalized QA/score JSON** | TS (exists) | Prevents silent "ready" on malformed output | Medium | **AIQ-02** `normalizeCreativeQaResult`, `normalizeCreativeScoreResult` |
| **Explicit rubric: invented entity / unsupported factual** | TS | Closes Cantona-class gap | Medium | New checklist guidance + regex promotion in gate |
| **Visual hierarchy rubric** (dominant focal point, ≤3 text tiers, negative space, no competing badges) | TS | Addresses overload + generic template | Medium | Map to new criterion or extend `creativeRisk`/`briefMatch` with hard-fail patterns |
| **Text fidelity checks** (CTA char-level, PT-BR typo scan) | TS (exists) | In QA prompt today | Low | `buildCreativeQaPrompt` TEXT FIDELITY lines |
| **Preflight `visualHierarchy` dimension** | D (partial) | Already computed pre-generation | Medium | `preflight-analysis.ts` — not wired to post-gen gate |
| **Persona simulation / marketing lenses as blocking gate** | AF | Too subjective, costly; use advisory only | — | `persona-simulator` exists for strategy, not export gate |
| **"Export must remain allowed" in QA system prompt** | AF for v12.3 | Softens QA; conflicts with integrity milestone | Low change | Remove or narrow in `creative-qa.ts` for gate path |

**MVP:** Add hierarchy + entity-invention dimensions to QA prompt and score issues list; document pass/fail exemplars in fixture notes.

---

### 6. Quality Gate

Blocking vs advisory split — the enforcement layer.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Seven hard-failure codes** (cta_drift, wrong_brand, unsupported_offer, copied_style_reference_facts, cropped_critical_content, unreadable_required_text, invalid_format_layout) | TS (exists) | Contract-breaking taxonomy | Low | **AIQ-03** `creative-quality-gate.ts` |
| **Verdict precedence:** any hard failure → `invalid`; else score&lt;70 or checklist warning → `improvable`; else `acceptable` | TS (exists) | Polish cannot override contract breaks | Low | **AIQ-04** `deriveQualityVerdict`, threshold 70 |
| **`assertDerivationApprovable` on approve/save-reference/delivery** | TS (exists) | Export boundary | Low | Phase 46 + v11.5 |
| **Hard-fail on invented entities / generic-template slop when rubric flags** | TS | Core v12.3 gap | Medium | Extend classifier + possibly 8th code |
| **Mode-aware formatFit** (hard fail only for format_adaptation) | TS (exists) | Prevents over-blocking art_variation | Low | `classifyCreativeQualityGate` |
| **creativeRisk → hard fail only via factual patterns** | TS (exists) | Subjective "generic" currently polish | Low | Keep pattern-based promotion; **extend patterns** for template aesthetic |
| **Block all warnings** | AF | v11.5 policy: only hard failures block | — | **Out of scope** v11.5 |
| **Gate bypass for preview/beta** | AF | Hides integrity regressions | — | Preview must still log verdict |

**MVP:** New hard-failure paths for entity invention + hierarchy collapse; tighten `creativeRisk`/`briefMatch` patterns for "different campaign" in format_adaptation.

---

### 7. Score / Retry

Numeric signal and recovery loop.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **0–100 qualityScore + breakdown** | TS (exists) | User-facing quality signal | Medium | `creative-score.ts` |
| **Score issues list feeding gate promotion** | TS (exists) | Second channel for hard failures | Medium | `promoteScoreIssuesToHardFailures` |
| **Score caps when hard rubric violated** ("polish cannot hide contract break") | TS (partial) | Instruction in score prompt; not always enforced numerically | Medium | Add explicit cap logic (e.g. max 49 if entity invention) |
| **Single auto-retry on text/CTA hard failures** | TS (exists) | derivation job step 5c | Medium | Phase 46 / derivation job |
| **Regeneration correction brief from hard failures + QA** | TS (exists) | User-confirmed retry | Medium | **AIR-01–05** `regeneration-correction-brief.ts` |
| **Infinite auto-regeneration** | AF | Credit burn + latency | — | **AIF-FUT-01** deferred |
| **Retry without injecting failed rule text into prompt** | AF | Repeats same failure | — | Regeneration must include contract tail |

**MVP:** Score ceiling function tied to hard-failure precursors; expand auto-retry triggers for `invented_entity` and style contamination.

---

### 8. Regression Tests

Prove rules stay wired — the v12.3 differentiator for engineering discipline.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Prompt contract snapshots per fixture** | TS (exists) | Catches prompt drift | Low | **FIX-02** `quality-prompt-regression.test.ts` |
| **Gate classification tests per fixture** | TS (exists) | Catches taxonomy drift | Low | **FIX-03** `creative-quality-gate.test.ts`, `quality-fixture-pipeline.test.ts` |
| **"Declared rule present in prompt" tests** for hierarchy + anti-hallucination | TS | Directly addresses unused constants bug | Low | Extend `quality-prompt-regression.test.ts` |
| **"QA prompt includes same rule blocks"** | TS | Prevents prompt/QA divergence | Medium | New tests on `buildCreativeQaPrompt` |
| **End-to-end fixture pipeline test** (contract → prompt → synthetic QA → gate → regeneration snippet) | TS (exists) | Integration guard | Medium | `quality-fixture-pipeline.test.ts` |
| **Live model pixel regression in CI** | AF | Flaky, costly | — | **60-LIMITATIONS.md** — manual/visual gate only |
| **Prompt-only tests without gate assertion** | AF | Green CI, bad creatives | — | Pair always |

**MVP:** Regression test that fails if `VISUAL_HIERARCHY_CONTRACT` or `ANTI_HALLUCINATION_RULES` not in art_variation prompt and QA prompt.

---

### 9. Visual Validation

Human-eye and semi-automated checks beyond JSON classifiers.

| Feature | Category | Why | Complexity | v11.5 dependency |
|---------|----------|-----|------------|------------------|
| **Manual verification loop doc** | TS (exists) | Operator playbook | Low | **FIX-04** `60-HANDOFF.md` |
| **Corpus re-score script** (batch score + QA + gate on manifest PNGs) | TS | Measures milestone KPIs | Medium | Pattern: `test-creatives.ts` (local); production-safe variant needed |
| **Release gate with measurable thresholds** (mean ≥75, fidelity ≥95%) | D | Makes v12.3 shippable | Medium | v12.2 Playwright release gate pattern (`114-visual-regression`) |
| **Side-by-side reference vs output review UI** | D | Speeds human triage | High | Workspace gallery exists; add QA overlay |
| **Deterministic CV checks** (blur bands, edge letterbox, OCR CTA match) | D | Cheap pre-filter before vision QA | High | Not in v11.5; optional phase research |
| **LLM-only QA without reference image context** | AF | Cannot detect invention vs reference | — | QA must see source or entity list |
| **Pixel-perfect glyph OCR in CI** | AF | Model limits per 60-LIMITATIONS | — | Advisory only |

**MVP:** `scripts/eval-creative-corpus.mjs` against manifest + threshold check in CI nightly or pre-release.

---

## Consolidated Tables

### Table Stakes (missing = integrity milestone fails)

| # | Feature |
|---|---------|
| 1 | Audited baseline corpus with scored manifest |
| 2 | Hierarchy + anti-hallucination rules **applied** in prompts and QA |
| 3 | Invented-entity / unsupported-factual detection in rubric + gate |
| 4 | Per-mode rule blocks enforced in prompt + QA |
| 5 | Hard-fail precedence over score (existing, keep) |
| 6 | Score caps when contract violations detected |
| 7 | Regression tests for declared-vs-applied rule wiring |
| 8 | Corpus eval reporting mean score + fidelity rate |

### Differentiators (valuable, not universally expected)

| # | Feature |
|---|---------|
| 1 | Factual inventory on contract (entities/copy classes) |
| 2 | Mode-specific QA extensions (perceptibility, native 9:16 zones) |
| 3 | Preflight hierarchy fed into post-gen gate |
| 4 | Automated release gate with ≥75 / ≥95% thresholds |
| 5 | Prompt-hash provenance on baseline runs |
| 6 | Optional CV pre-checks before vision QA |

### Anti-Features (explicitly do NOT build in v12.3)

| Anti-feature | Why avoid | Instead |
|--------------|-----------|---------|
| Switch primary image model | v11.5: alignment problem first | Harden contracts + gate on current stack |
| Infinite / silent auto-retry | Credits, trust | Single bounded retry + user-confirmed regeneration |
| Block every QA warning | Friction, false positives | Hard failures only (**v11.5 policy**) |
| Customer assets in CI fixtures | Privacy | Sanitized archetypes + optional local-only eval |
| Subjective persona gate on export | Unstable | Personas stay strategic; gate stays contract-based |
| QA prompt "export must remain allowed" | Conflicts with integrity | Separate export policy from QA honesty |
| Declaring rules in constants without injection | Current bug | Shared rule module + regression tests |
| LLM-only marketing judgment as sole gate | Flaky, expensive (industry: ~7% agree with metrics) | Hybrid: taxonomy + patterns + score caps |

---

## Feature Dependencies

```text
v11.5 CreativeContract + taxonomy (57–58)
    → Shared rule blocks exported from prompt-builder (hierarchy, anti-hallucination)
        → buildDerivationPrompt injection
        → buildCreativeQaPrompt + creative-score prompt parity
            → Extended gate classifiers (entity, hierarchy, template slop)
                → Score caps + retry triggers
                    → Extended QUALITY_FIXTURES + audited archetypes
                        → Regression tests (prompt + QA + gate)
                            → Corpus eval script + release thresholds
```

### v11.5 Infrastructure Map (reuse, don't rewrite)

| Asset | Location | v12.3 use |
|-------|----------|-----------|
| CreativeContract | `creative-contract.ts` | Extend with hierarchy/factual inventory |
| Taxonomy + regex patterns | `creative-quality-taxonomy.ts` | Add entity/template patterns |
| Quality gate | `creative-quality-gate.ts` | New hard-failure paths, score-cap input |
| QA analyzer | `creative-qa.ts` | Rubric expansion, remove soft-export bias |
| Score analyzer | `creative-score.ts` | Cap logic, issue promotion |
| Synthetic fixtures | `quality-fixtures.ts` | +3 audited archetypes |
| Prompt regression | `quality-prompt-regression.test.ts` | Hierarchy/hallucination assertions |
| Gate tests | `creative-quality-gate.test.ts` | New failure codes |
| Regeneration | `regeneration-correction-brief.ts` | New failure snippets |
| Provenance | `promptProvenance` on derivations | Baseline traceability |
| Limitations doc | `60-LIMITATIONS.md` | Sets expectations for visual validation |

---

## MVP Recommendation

**Prioritize (vertical slice):**

1. **Wire declared rules** — export and inject `VISUAL_HIERARCHY_CONTRACT` + `ANTI_HALLUCINATION_RULES`; mirror in QA/score prompts.
2. **Invented-entity hard path** — rubric + gate code + fixture modeled on Cantona-class failure.
3. **Audited archetype fixtures** — invented entity, hierarchy overload, generic-template-pass (synthetic QA outputs + optional PNG refs).
4. **Regression guard** — tests fail when rule blocks drop from prompt or QA.
5. **Corpus eval** — batch script on `render-creatives` manifest; report mean score + % with zero hard failures on fidelity dimensions.

**Defer:**

- Deterministic CV/OCR pipeline (research spike unless quick win on letterbox detection).
- Customer creative CI harness (**AIF-FUT-03**).
- Owner quality analytics dashboard (**AIF-FUT-04**).
- Multi-attempt autonomous loop (**AIF-FUT-01**).

---

## Industry Context (MEDIUM confidence)

Performance ad creative QA in 2026 commonly uses:

1. **Hybrid LLM + rule engine** — LLM generates; deterministic policies enforce brand, legal, and factual constraints before publish.
2. **Tiered evaluation** — cheap technical checks first, vision QA second, human only for high-risk composites.
3. **Self-correcting loops** — bounded regenerate-on-fail with explicit correction brief (ADScale has this via regeneration).
4. **Regression fixtures** — versioned prompts + golden failure cases treated like CI tests.

ADScale is **aligned architecturally** with v11.5; v12.3 closes the **enforcement gap** between declared rules and observed outputs.

---

## Sources

- ADScale code: `prompt-builder.ts`, `creative-qa.ts`, `creative-quality-gate.ts`, `creative-quality-taxonomy.ts`, `quality-fixtures.ts`, `quality-prompt-regression.test.ts`
- ADScale planning: `.planning/PROJECT.md` (v12.3 goals), `.planning/milestones/v11.5-REQUIREMENTS.md`, `60-LIMITATIONS.md`, `58-CONTEXT.md`
- Audit corpus: `app/exports/render-creatives/manifest.json` (34 entries)
- Industry: [Hybrid Pipelines for Creative Ads (2026)](https://newdata.cloud/hybrid-pipelines-for-creative-ads-combining-llms-and-rule-en), [AI Creative Pipelines DevOps](https://beneficial.cloud/ai-creative-pipelines-for-video-ads-engineering-best-practic), [Genflow self-correcting QC](https://arxiv.org/html/2605.16748) — MEDIUM confidence for static-image transfer

---
*Feature research for v12.3 Integridade Criativa — creative pipeline quality and QA.*
