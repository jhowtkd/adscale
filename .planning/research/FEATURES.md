# Feature Research

**Domain:** Multi-brand taste calibration in AI creative SaaS (ADScale v13.2)
**Researched:** 2026-06-23
**Confidence:** HIGH (ecosystem patterns verified via official docs + ADScale codebase); MEDIUM (competitive feature parity — marketing pages, not full product audits)

## Feature Landscape

### Table Stakes (Users Expect These)

Features operators and brand teams assume exist when a platform claims per-brand AI creative control. Missing these makes multi-brand calibration feel incomplete even if backend plumbing exists.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Per-brand identity container** | Every major creative SaaS scopes voice/guidelines to a brand or client profile, not campaign name heuristics | LOW | ADScale already has `client_profiles` (tone, constraints, colors, fonts). v13.2 must treat `clientProfileId` as the canonical brand key — not string-matching `"Cenbrap"`. |
| **Declarative voice / constitution per brand** | Jasper IQ, Adobe GenStudio Brands, and Writer all store voice, tone, vocabulary, and visual rules as structured config applied at generation time — not ad hoc prompts | MEDIUM | Today only `CENBRAP_VOICE` is registered in `resolveClientVoice()` with a hardcoded review gate. Table stakes = Olhar constitution + client voice overlay configurable per `clientProfile`, stored and versioned. |
| **Bounded prompt constraints from approved rules** | Industry pattern: brand rules become machine-readable directives injected into generation, not post-hoc editing only (Adobe GenStudio guidelines, AdCP brief constraints, ESGA governed templates) | LOW–MEDIUM | `buildBrandTastePromptSection` + `buildCorpusQualityPromptSection` exist; `derivationJob` loads `corpus_quality` rules by `clientProfileId`. Must generalize all taste categories and enforce prompt order: Olhar global → brand voice → brand-taste rules → corpus_quality. |
| **Human approve-before-apply** | Enterprise creative ops universally require propose → review → approve before rules affect output (Jasper style guide, GenStudio publish, Corevexa governance states) | LOW | v13.0 shipped approve/reject/deprecate for `calibration_rules`; corpus path uses `client_learning_proposals` accept flow. Table stakes = same gate for every brand, not Cenbrap-only scripts. |
| **Brand isolation** | Multi-brand agencies expect zero cross-contamination of rules, voice, or corpus slices (Writer: separate style guides per brand; Jasper: multiple Brand Voices) | MEDIUM | DB already scopes `calibration_rules` and `calibration_signals` by `(workspaceId, clientProfileId)`. Must verify prompt-builder, advisor, and owner UI never merge rules across profiles. |
| **Inspectable profile + active rules** | Operators need to answer "what does the system think this brand likes/rejects?" before trusting generation (GenStudio brand validation panel; Writer voice calibration UI) | MEDIUM | `buildBrandTasteProfile()` computes evidence level, patterns, source composition — but no owner-only per-brand inspection surface is productized. Table stakes for v13.2. |
| **Evidence level + sample honesty** | Regulated and agency buyers expect explicit "uncalibrated / fixture-only / insufficient sample" states, not implied quality (ADScale claims gate; GenStudio content scoring with guideline violations) | LOW | v13.0 `evidenceLevel`, `sourceComposition`, claims matrix exist. Must apply per `clientProfile`, not only Cenbrap calibration reports. |
| **Separation of creative judgment vs export compliance** | Creative SaaS that mixes "on brand" with "legal/export OK" erodes trust; dual verdict is becoming a category norm for ad creative | LOW | ADScale Olhar + export dual verdict (v12.7) is ahead of table stakes. Preserve: `factual_issue` and export rules must not be weakened by taste or corpus_quality overlays. |

### Differentiators (Competitive Advantage)

Features that set ADScale apart from static brand-kit tools (Canva) or copy-only voice platforms (Jasper/Writer). Not universally expected, but aligned with ADScale core value: learned creative criterion, not just variation volume.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Corpus → profile → rules closed loop** | Most competitors rely on uploaded PDFs or manual voice docs; few close the loop from *generated ad outputs* → human eval → learned constraints on the next generation for that brand | HIGH | Corpus learning design (`corpus_quality` proposals, aggregator thresholds) is partially shipped. Differentiator when wired for any `clientProfile` via global owner corpus (v13.1), not Cenbrap fixtures alone. |
| **Mismatch-driven rule extraction** | Learning from system-vs-human disagreement (too permissive, voice nuance, acceptable override) is richer than "user said bad" thumbs-down | MEDIUM | v13.0 `extractRuleCandidatesFromSignals` + mismatch buckets. Extending corpus evals into `calibration_signals` multiplies learning surface beyond Olhar contact-sheet decisions. |
| **Uncertainty queue / teach-when-informative** | Reduces operator throughput burden — human review only when the decision changes the model (v13.0 QUEUE) | MEDIUM | Rare in self-serve creative tools; common in ML ops / HITL eval platforms. Keep as differentiator; do not collapse into "review everything." |
| **Cross-client pattern → global rubric** | Client-first learning that promotes to global scoring/gate adjustments when ≥2 brands share a failure pattern | HIGH | `client_learning_proposals` → `rubric_calibration_adjustments` path per corpus design. Enterprise-grade; Jasper/Canva do not expose this for *visual* ad quality. |
| **Art-direction constitution (Olhar) + brand overlay** | Positions ADScale as judging figure, gestalt, voice, invite — not checklist QA | MEDIUM | Global Olhar is shipped; per-brand overlay via voice + taste rules is the v13.2 productization step. |
| **Source-composition-aware claims** | Honest distinction between `synthetic_fixture`, `operator_imported`, and `real_customer` evidence | LOW | Strong trust differentiator for beta/enterprise narrative; most competitors overclaim "AI learns your brand" without sample gates. |
| **Prompt provenance with rule IDs** | Verdict explanations reference `rule:{id}` — auditable why a constraint fired | LOW | APPLY-03 shipped; extend to corpus_quality and per-brand owner dashboards. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-approve learned rules** | Faster "AI learns automatically" marketing | Single noisy slice or fixture corpus permanently poisons brand prompts; no accountability | Keep propose + owner accept; optional bootstrap *candidates* only |
| **End-user (non-owner) taste profile UI** | "Let clients manage their own brand" | Workspace users lack calibration authority; risks conflicting rules and support burden | Owner-only profile + rules surface; workspace users see outcomes in generation quality, not governance |
| **Freeform operator notes → prompt mutation** | Quick fix from corpus review notes | Unbounded prompt drift, privacy leakage, non-reproducible constraints | Canonical failure-reason → directive mapping (`corpus_quality`); notes as evidence only |
| **Per-item auto-regenerate on corpus reject** | Immediate correction feels responsive | Conflates eval workflow with generation spend; bypasses rule generalization | Accept proposal → next generation for that `clientProfile` inherits constraint |
| **Fine-tuning / custom image model per brand** | "True" brand learning | Cost, ops, and evidence burden before rule loop proves value (v13.0 explicit out of scope) | Bounded prompt constraints + rubric adjustments |
| **Commercial quality / agreement claims without sample** | Sales pressure | Destroys trust; v12.6–v13.1 gates exist for a reason | Per-brand claims matrix with `sampleGuidance` and source composition |
| **Blending media performance (CTR/CPA) into taste rules** | "Optimize what wins" | Different evidence type; conflates media outcome with art-direction judgment | Defer PERFLOOK; keep performance in v12.1 learning track |
| **Unlimited active rules per brand** | "Capture every nuance" | Prompt bloat, conflicting directives, model ignores tail | Cap (~10) `corpus_quality` + bounded brand-taste rules; deprecate stale rules |
| **Global default voice from one brand** | Simpler until "we have more clients" | Cenbrap hardcode is exactly this anti-pattern | Explicit per-`clientProfile` config; null voice = Olhar global only |
| **Customer-facing "AI agreement rate" dashboard** | Proof of value | Misleading at low N; agreement is an internal calibration metric | Owner evidence artifacts with withheld/null metrics until sufficient |

## Feature Dependencies

```
clientProfile (brand container)
    └──requires──> workspace membership + campaign.clientProfileId
                       └──requires──> v1 client_profiles schema (shipped)

Per-brand Olhar / voice config
    └──requires──> clientProfile
    └──enhances──> prompt-builder generation-direction section
    └──replaces──> Cenbrap hardcoded resolveClientVoice + voice-review-gate

calibration_signals (per brand)
    └──requires──> human decisions OR corpus evaluations mapped to clientProfileId
    └──feeds──> buildBrandTasteProfile()
                       └──feeds──> evidenceLevel + uncertainty queue

Rule candidates (brand-taste categories)
    └──requires──> calibration_signals (mismatch batches)
    └──requires──> owner approve flow (v13.0 RULE-03)

corpus_quality rules
    └──requires──> global corpus evaluations (v13.1)
    └──requires──> client_learning_proposals aggregator (≥3 evals, |delta|≥15)
    └──requires──> owner accept → calibration_rule
    └──requires──> clientProfileId on corpus item (capture path)

Prompt constraint application
    └──requires──> approved calibration_rules scoped to clientProfileId
    └──requires──> derivationJob load-corpus-quality-rules step
    └──conflicts──> unapproved / deprecated rules (must not inject)

Owner-only profile + rules UI
    └──requires──> buildBrandTasteProfile API + list rules by clientProfile
    └──requires──> requirePlatformOwner guard
    └──enhances──> LearningProposalsTab (already owner-only)

Per-brand claims gate
    └──requires──> profile sourceComposition + decisionCount per clientProfile
    └──requires──> existing EVIDENCE-02 claims matrix
```

### Dependency Notes

- **Corpus learning requires `clientProfileId`:** Corpus items without a resolvable profile are captured but not promoted — v13.2 should surface these as operator exceptions, not silent drops.
- **Brand-taste rules and corpus_quality rules stack:** Corpus design specifies prompt order Olhar → brand-taste → corpus_quality; reversing or merging categories risks export-safety regression (APPLY-04).
- **Voice config and taste rules are complementary:** Voice = declarative constitution; taste rules = empirical learning from human judgment. Neither replaces the other.
- **Bootstrap depends on signal volume:** Profile moves from `uncalibrated` → `seed_calibrated` (≥5 decisions) → `assisted` (≥10) → `evidence_backed` (≥10 + ≥3 real_customer). Corpus-only bootstrap must write compatible signals or adjust thresholds explicitly.

## MVP Definition

### Launch With (v13.2)

Minimum to productize multi-brand calibration for any `clientProfile` with owner-only governance and corpus-fed learning.

- [ ] **Per-`clientProfile` voice/Olhar config** — Replace Cenbrap string-matching and hardcoded `CENBRAP_VOICE_REVIEW_STATUS` with profile-attached constitution (DB fields or `client_voice` records keyed by `clientProfileId`).
- [ ] **Owner-only brand taste profile view** — Inspect evidence level, source composition, positive/rejection/quase patterns per brand.
- [ ] **Owner-only approved rules list per brand** — Categories, rationale, supporting signal IDs, approve/deprecate actions (reuse v13.0 flows scoped by profile).
- [ ] **Corpus evaluations → client-scoped learning** — Aggregator and accept path operational for any brand with sufficient evals (infrastructure largely shipped; generalize wiring and tests off Cenbrap).
- [ ] **Prompt injection for all approved rule types per brand** — `corpus_quality` + brand-taste categories in `derivationJob` / `prompt-builder`, capped and ordered.
- [ ] **Per-brand claims gate** — Sample guidance and permitted/prohibited claims keyed to profile evidence, not only Cenbrap runner output.

### Add After Validation (v13.2.x)

- [ ] **Corpus eval → `calibration_signal` adapter** — Unify Olhar contact-sheet decisions and corpus human evals into one signal stream for richer profiles (trigger: ≥2 brands with corpus-only learning, no Olhar decisions).
- [ ] **Profile bootstrap from imported history** — One-shot seed from accumulated evaluations when a new `clientProfile` is linked to existing corpus items.
- [ ] **Cross-client global proposal UI polish** — Surface sustaining client rules in global proposal detail (API exists; UX depth).
- [ ] **Voice document upload / AI extract** — GenStudio-style PDF → constitution (trigger: operator manual entry pain).

### Future Consideration (v2+)

- [ ] **MULTI-01: Client-managed voice UI** — Workspace admins edit voice; deferred in v13.0 for owner calibration authority.
- [ ] **MULTI-02: Cross-client profile comparison** — Analytics across brands without rule leakage.
- [ ] **PERFLOOK: Performance-blended recommendations** — Separate milestone.
- [ ] **Runtime global rubric apply without deploy** — Depends on Phase 132 evolution.
- [ ] **Auto-regenerate on corpus `intent=regenerate`** — Explicitly out of corpus v1 scope.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Existing dependency |
|---------|------------|---------------------|----------|-------------------|
| Per-`clientProfile` voice config (de-Cenbrap) | HIGH | MEDIUM | P1 | `client_profiles`, `client-voice.ts` |
| Owner profile + rules inspection UI | HIGH | MEDIUM | P1 | `buildBrandTasteProfile`, calibration APIs |
| Corpus → `corpus_quality` accept → prompt | HIGH | LOW | P1 | Shipped in derivation job; generalize QA |
| Approve/deprecate rules per brand | HIGH | LOW | P1 | v13.0 RULE-03 |
| Per-brand claims / evidence gate | HIGH | LOW | P1 | v13.0 EVIDENCE-02, calibration-evidence |
| Corpus → calibration_signals bridge | MEDIUM | MEDIUM | P2 | v13.0 SIGNAL model |
| Uncertainty queue per brand | MEDIUM | LOW | P2 | v13.0 QUEUE |
| Cross-client → global rubric promotion | MEDIUM | MEDIUM | P2 | proposals + rubric_calibration_adjustments |
| Voice PDF upload / AI extract | LOW | HIGH | P3 | None |
| Client self-serve voice management | LOW | HIGH | P3 | MULTI-01 deferred |

**Priority key:** P1 = v13.2 launch; P2 = shortly after first multi-brand operator cycle; P3 = post-PMF.

## Competitor Feature Analysis

| Feature | Jasper IQ | Adobe GenStudio | Canva Brand Kit | Writer | ADScale v13.2 approach |
|---------|-----------|-----------------|-----------------|--------|------------------------|
| Per-brand voice container | Brand Voice + Style Guide + Visual Guidelines | Brands (upload PDF / manual / URL) | Multiple Brand Kits (visual) | Voice profiles + terms + style guides | `clientProfile` + Olhar constitution + existing profile fields |
| Learning from outputs | Limited; mostly static KB | Content scoring vs guidelines | No eval loop | Style enforcement on drafts | **Corpus eval → proposals → rules → prompt** (differentiator) |
| Approve before apply | Admin-defined rules | Draft → publish brand | Brand Controls / approval | Admin style guides | Owner accept proposals + rule approve flow |
| Visual ad constraints | Visual Guidelines (brief-level) | Channel + image guidelines | Colors/fonts/logos | Text-focused | Prompt constraints for hierarchy, gestalt, CTA legibility |
| Evidence / compliance scoring | Off-brand flags | Brand validation score | Template lock | Real-time rule violations | Evidence level + claims gate + source labels |
| Multi-brand isolation | Multiple Brand Voices (plan limits) | Published brands per org | Multiple kits | Multiple style guides | `clientProfileId` scoping + owner-only governance |
| Human calibration loop | Manual voice tuning | Human review workflows | Design approval | Voice calibration from samples | Mismatch extraction + uncertainty queue + corpus loop |

## Sources

- ADScale `.planning/PROJECT.md`, `.planning/milestones/v13.0-REQUIREMENTS.md`, `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md` (HIGH — product intent and shipped baseline)
- ADScale codebase: `client-voice.ts`, `taste-profile.ts`, `taste-application.ts`, `derivation.ts`, `client_learning_proposals` schema (HIGH — implementation truth)
- [Jasper IQ Help Center](https://help.jasper.ai/hc/en-us/articles/18618654325787-Jasper-IQ) (MEDIUM — brand voice structure)
- [Adobe GenStudio — Add Guidelines](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/guidelines/add-guidelines) (HIGH — per-brand guideline → generation pattern)
- [Adobe GenStudio — Brands](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/guidelines/brands) (HIGH — validation + publish workflow)
- [Writer — Brand systems](https://writer.com/blog/new-roundup-may-2026/) (MEDIUM — voice + terms + style guide composition)
- [Writer — Voice calibration](https://support.writer.com/article/250-how-to-calibrate-voice-for-your-content) (MEDIUM — example-based calibration)
- [AdCP AI Creative Overview](https://docs.adcontextprotocol.org/docs/creative/ai-creative-overview) (MEDIUM — brief constraints, approve-system-not-every-ad)
- [Corevexa Creative Ops Panel](https://docs.corevexa.com/creative-ops-panel/) (MEDIUM — governance state machine)
- Industry voice-guide patterns (Atom Writer, iMarkInfotech 2026 templates) (LOW — general AI voice doc structure, not AD-specific)

---
*Feature research for: ADScale v13.2 Calibração Multi-Marca*
*Researched: 2026-06-23*
