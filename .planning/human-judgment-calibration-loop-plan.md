# Human Judgment as Calibration, Not Throughput

Created: 2026-06-19
Status: proposal
Candidate milestone: v13.0 Brand Taste Calibration Loop

## Product Principle

Human judgment is not a required production step. Human judgment is a calibration event that teaches the system how to judge future outputs with less human intervention.

The system should not depend on Jhonatan approving every batch. It should depend on Jhonatan teaching the criterion when the system is new, uncertain, wrong, or operating in a new brand context.

## Why This Matters

The current v12.9 milestone proves the honest gate:

- decisions are human authority;
- sample sufficiency blocks agreement claims;
- `agreementRate` stays withheld while decisions are missing;
- synthetic fixtures are operational calibration only.

That is necessary, but not enough for a multi-client product. If every client requires manual review forever, ADScale becomes a review service. The product should instead turn sparse human decisions into reusable taste rules, brand-specific preferences, confidence thresholds, and better next-generation guidance.

## Target Behavior

For each brand, ADScale should move through four maturity levels:

| Level | Meaning | Human role | Allowed claim |
| --- | --- | --- | --- |
| L0 - Uncalibrated | Only global Olhar ADScale applies | Human review recommended | "Initial art-direction rules applied" |
| L1 - Seed calibrated | 5 to 15 human decisions exist | Human teaches taste boundaries | "Calibrated from operator decisions" |
| L2 - Assisted judgment | System has brand rules and confidence | Human reviews uncertainty/mismatches | "System applies learned brand criteria with audit" |
| L3 - Evidence-backed | Real customer corpus and agreement evidence exist | Human audits periodically | "Validated against customer-real decisions" |

The product should never collapse these levels into one generic "approved" state.

## Conceptual Model

### 1. Global Olhar ADScale

Rules that apply to every client:

- figure has presence;
- gestalt is coherent;
- hierarchy is intentional;
- visual tension is productive, not noisy;
- the piece does not look like a SaaS interface, landing page module, or generic template;
- invitation is real, not just a CTA label;
- export compliance cannot compensate for weak art direction.

### 2. Brand Taste Overlay

Rules that apply to a specific client:

- what this brand tolerates;
- what it rejects;
- what kind of sophistication fits;
- how much boldness is acceptable;
- visual and verbal patterns that feel off-brand;
- examples that count as `entra`, `quase`, and `nao_entra`.

### 3. Campaign Context

Temporary constraints for a campaign:

- offer;
- audience;
- channel;
- funnel moment;
- mandatory claims or disclaimers;
- reference creative;
- goal of the batch.

### 4. Human Calibration Event

Each human decision should produce structured data:

- decision: `entra`, `quase`, `nao_entra`;
- target: derivation/output id;
- brand/client profile;
- campaign context;
- system verdict at the time;
- mismatch bucket;
- short note;
- source label: `synthetic_fixture`, `operator_imported`, `real_customer`;
- confidence/uncertainty if available.

### 5. Learned Criterion

Decisions should produce reusable rules:

- stable preference;
- rejection pattern;
- acceptable override;
- system too harsh;
- system too permissive;
- voice nuance;
- export/setup issue;
- unclear sample.

These learned rules should be versioned, inspectable, and reversible. They should not silently mutate prompts.

## Proposed Milestone Shape

### Phase 151 - Calibration Signal Model

Goal: define the canonical data model for human decisions as calibration signals, not one-off reviews.

Deliverables:

- canonical `creative_judgment_events` or extension of current `output_decision_events`;
- normalized mismatch buckets;
- brand/client profile linkage;
- source label and evidence level;
- no prompt, signed URL, or secret exposure;
- migration and repository methods.

Acceptance criteria:

- a decision can be traced from output to brand, campaign, system verdict, human verdict, and source;
- repeated decisions do not duplicate calibration facts;
- current Cenbrap decision capture can write into the new model or a compatible adapter.

### Phase 152 - Brand Taste Profile

Goal: aggregate human judgment events into an inspectable taste profile per brand/client.

Deliverables:

- `brand_taste_profiles` or equivalent canonical read model;
- positive patterns: what tends to enter;
- negative patterns: what tends to fail;
- `quase` patterns separated from hard rejection;
- confidence based on sample size and source type;
- profile status: `uncalibrated`, `seed_calibrated`, `assisted`, `evidence_backed`.

Acceptance criteria:

- 5 Cenbrap decisions can produce an initial taste profile;
- profile clearly says when evidence is fixture-only;
- profile does not claim real customer validation without real customer rows.

### Phase 153 - Calibration Rule Extraction

Goal: turn mismatches into small, reviewable rules that can improve future judgments.

Deliverables:

- deterministic extraction of rule candidates from decision batches;
- rule categories: figure, gestalt, hierarchy, voice, invite, export conflict, brand nuance;
- human-readable explanation;
- confidence and sample references;
- approve/reject/deprecate flow for rules.

Acceptance criteria:

- if system says `pronta` and Jhonatan says `nao_entra`, the rule candidate explains why the system was too permissive;
- if system says `quase` and Jhonatan says `entra`, the rule candidate explains acceptable override;
- no rule is promoted from a single ambiguous decision without caveat.

### Phase 154 - Apply Taste to Advisor and Generation

Goal: use approved brand rules before generating or approving outputs.

Deliverables:

- prompt-builder retrieval of brand taste rules;
- advisor/preflight uses global Olhar plus brand overlay;
- score/verdict explains which brand rule was applied;
- generation avoids known rejected patterns;
- review UI shows "why this was judged this way".

Acceptance criteria:

- next Cenbrap generation includes learned taste constraints;
- advisor stops speaking in UI/CTA/button language for creative judgment;
- verdict includes traceable references to rule ids, not vague taste claims.

### Phase 155 - Uncertainty Queue

Goal: ask for human judgment only where it has leverage.

Deliverables:

- confidence score for system judgment;
- queue reasons: new brand, low sample, system/human disagreement, contradictory rules, high-impact export;
- "needs Jhonatan" state only for uncertain or strategically important outputs;
- batch review path for 5 to 15 items, not endless per-output approval.

Acceptance criteria:

- calibrated/high-confidence outputs do not require human review by default;
- low-confidence outputs request structured decision;
- queue shows what decision would teach the system.

### Phase 156 - Calibration Evidence and Release Gate

Goal: measure whether the system is learning and prevent inflated claims.

Deliverables:

- agreement trend by brand;
- confusion table: system too harsh vs too permissive;
- sample sufficiency by source;
- before/after impact on future verdicts;
- claims matrix by evidence level.

Acceptance criteria:

- no public claim is allowed from fixture-only evidence;
- agreement claims require sufficient human decisions and comparable rows;
- the release gate can say: uncalibrated, seed calibrated, assisted, or evidence-backed.

## Minimum Viable Slice

The smallest valuable version is:

1. capture 5 Cenbrap decisions;
2. group mismatches into reason buckets;
3. create a Cenbrap taste profile draft;
4. feed 3 to 5 approved rules into advisor/prompt-builder;
5. generate or evaluate a new Cenbrap batch;
6. compare whether the system asks for fewer human decisions or disagrees less.

This is the first proof that human judgment reduced future uncertainty instead of becoming permanent labor.

## What Depends On Jhonatan

- Initial taste decisions: 5 to 15 decisions for a brand.
- Interpretation of ambiguous cases: whether `quase` means "almost shippable" or "concept weak but salvageable".
- Approval of extracted rules before they affect generation.
- Final authorization of any external claim about agreement, quality, or brand fit.

## What Should Not Depend On Jhonatan

- Recording and storing decisions.
- Computing sample sufficiency.
- Extracting candidate mismatch patterns.
- Applying approved rules to prompts/advisor.
- Routing low-confidence outputs into a queue.
- Withholding claims when evidence is weak.

## Product Risks

| Risk | Mitigation |
| --- | --- |
| Human review becomes a production bottleneck | Treat decisions as calibration events; ask only on uncertainty |
| System overfits to fixture rows | Source labels and evidence levels block inflated claims |
| Brand taste becomes invisible magic | Profiles and rules must be inspectable and reversible |
| Global Olhar gets diluted by client preference | Keep global rules separate from brand overlay |
| Prompt changes regress factual/export safety | Every applied rule needs regression coverage and release gate |

## Recommended Route From Current v12.9

1. Finish v12.9 truthfully:
   - capture or explicitly defer the 5 Cenbrap decisions;
   - execute Phase 149 for customer-real corpus or blocker;
   - execute Phase 150 for agreement/claims gate.
2. Do not expand v12.9 into the full taste system. That would blur closure.
3. Open the next milestone as `v13.0 Brand Taste Calibration Loop`.
4. Start with the minimum viable slice using Cenbrap, then generalize to another client only after the Cenbrap loop proves that human decisions reduce future uncertainty.

## Definition Of Done

This initiative is done when:

- a brand can move from uncalibrated to seed calibrated through a small decision batch;
- extracted rules are visible, source-labeled, and approved before use;
- future advisor/generation behavior changes because of those rules;
- the system measures agreement improvement or uncertainty reduction;
- human review becomes an exception path, not the default workflow.
