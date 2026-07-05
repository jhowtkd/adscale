# Image Generation Harness Recalibration

**Date:** 2026-07-05  
**Status:** Approved design

## Problem

The image-generation harness currently mixes objective campaign integrity with aesthetic preferences. Rules such as three information zones, 20% free space, 8% safe margins, thumbnail legibility at roughly 25% scale, and literal CTA rendering can influence prompts, quality failures, score ceilings, and automatic retries.

This favors predictable compliance over refined art direction. The recalibration must increase compositional freedom without weakening factual integrity or the selected fidelity to a reference.

## Goals

- Reserve hard failures for objective integrity problems.
- Preserve the four existing reference-fidelity levels.
- Let art direction and finish determine ranking among eligible outputs.
- Make CTA rendering optional and copy adaptable while preserving commercial facts.
- Use one canonical policy across generation, evaluation, ranking, and retry.
- Prove improvement through a blind before/after comparison.

## Non-goals

- Adding new fidelity levels or a continuous fidelity control.
- Replacing human review with an automatic score.
- Creating separate multi-call judges for integrity, fidelity, and art direction.
- Changing the user interface or stored fidelity values unless required to expose existing outcomes correctly.
- Allowing style references, learned taste, or aesthetic quality to override factual integrity or the requested fidelity.

## Canonical Creative Policy

Extend the existing canonical creative contract so it resolves a policy from:

- generation mode;
- fidelity level;
- factual campaign contract;
- available base and style references.

The resolved policy has four concerns:

1. **Objective integrity:** conditions that can invalidate an output.
2. **Fidelity range:** the permitted visual distance from the reference.
3. **Creative freedoms:** content and composition choices available within that range.
4. **Heuristics:** non-binding guidance that may improve a piece but cannot invalidate it.

The existing prompt builder, per-mode rules, observable rubric, quality gate, ranking path, and retry policy must consume this resolved policy instead of restating their own versions.

## Objective Integrity

Hard failures are limited to:

- wrong or invented brand, product, price, commercial condition, date, or factual claim;
- invalid target format or unusable output dimensions;
- corrupt or otherwise unusable image output;
- severe cropping, hiding, or corruption of a factual element that the output chose to render;
- factual contamination from a style reference.

CTA presence, CTA prominence, literal CTA wording, fixed information-zone count, whitespace percentage, safe-margin percentage, and thumbnail readability are not hard failures.

If an output includes a CTA, it may rewrite or shorten it while preserving the intended action. CTA display is optional in every mode.

Headlines and supporting copy may be rewritten, condensed, or omitted. Brand, product, price, conditions, dates, and claims must remain correct whenever expressed.

## Fidelity Policy

Fidelity measures recognition of the reference's visual system: composition, palette, typography, treatment, subject or product handling, and campaign identity. It does not require literal reproduction of every text block.

The existing levels remain:

| Level | Visual-system distance | Composition freedom | Copy freedom |
| --- | --- | --- | --- |
| `conservative` | Very close | Refine and rebalance | Condense or simplify |
| `balanced` | Clearly recognizable | Reorganize | Rewrite while preserving facts |
| `bold` | Reinterpreted but same campaign | Rebuild | Reduce to essential facts |
| `extreme` | Preserve only central campaign anchors | New direction | Keep only factual essentials |

Mode-specific behavior:

- **Art variation:** uses the full four-level range above.
- **From-zero generation:** has broad compositional freedom, constrained by factual and brand context rather than a source layout.
- **Restyling:** the base remains the factual and identity source; the style reference transfers visual language only. Fidelity controls transfer strength.
- **Format adaptation:** remains the most faithful mode. It preserves campaign identity and factual content while allowing native recomposition and copy condensation for the target frame.

## Heuristics

The following may remain as prompt or reviewer guidance:

- three primary information zones;
- approximately 20% free space;
- approximately 8% safe margins;
- legibility checks at approximately 25% scale;
- CTA prominence and conventional reading paths.

They must not cause a hard failure, score ceiling, automatic retry, or mandatory correction. Evaluation should instead judge whether the main message is understandable in the intended format and use context. Decorative text and microcopy do not need to survive a universal thumbnail scale.

## Evaluation and Ranking

Evaluation produces three independent outcomes:

1. **Integrity verdict:** pass, fail, or inconclusive.
2. **Fidelity verdict:** inside or outside the requested fidelity range.
3. **Art-direction assessment:** relative ranking for composition, typography, rhythm, contrast, visual treatment, and absence of generic AI-template styling.

Selection order:

1. Exclude outputs with confirmed objective integrity failures.
2. Prefer outputs inside the requested fidelity range.
3. Rank remaining outputs by art direction and finish.

A high aesthetic assessment cannot hide an integrity failure. A low aesthetic assessment cannot invalidate an otherwise usable output. Numeric quality scores may remain for compatibility, but they are not the source of hard validity.

Learned human taste and historical corpus signals may influence art-direction ranking as contextual preferences. They cannot change objective integrity or override the requested fidelity.

## Retry and Error Handling

- Automatic retry is allowed only for a confirmed objective integrity failure or unusable output.
- Use at most the existing bounded retry behavior; this design does not introduce additional retry loops.
- Falling outside the fidelity range affects eligibility or ranking but does not trigger automatic regeneration.
- Weak art direction affects ranking only.
- If aesthetic evaluation fails, keep the generated image available without an art-direction rank.
- If integrity cannot be verified, report it as inconclusive rather than inventing a pass. Existing product behavior may require human review before approval or export.

## Implementation Boundaries

Reuse the existing canonical contract and quality pipeline. The change should consolidate or delete duplicated rules rather than add a parallel policy engine.

Expected touchpoints are limited to the existing contract resolver, prompt rules, observable rubric, quality classification, score ceilings, ranking, retry policy, and their focused tests. Exact files belong in the implementation plan after call-site verification.

## Verification

### Automated checks

- Contract tests cover policy resolution for representative mode and fidelity combinations.
- Prompt regressions prove CTA is optional, expression is flexible, facts remain protected, and aesthetic numbers are non-binding.
- Quality-gate tests prove only objective failures invalidate outputs.
- Retry tests prove fidelity and art-direction findings do not trigger retries.
- Ranking tests prove integrity first, fidelity second, and art direction third.
- Existing restyling factual-source and format-adaptation preservation checks remain green.

### Blind human gate

Generate 12 matched before/after pairs using the same briefings, references, formats, modes, and fidelity levels. Randomize presentation so reviewers do not know which harness generated each output.

Accept the recalibration when:

- at least 60% of comparisons prefer the recalibrated output for art direction and finish; and
- there are zero objective-integrity regressions.

If preference is below 60% without integrity regressions, treat the result as inconclusive. Revise only rules supported by recurring evidence and run another small batch.

## Acceptance Criteria

- All four fidelity levels remain available and retain meaning based on visual-system distance.
- CTA display is optional in every generation mode.
- Rendered CTA wording preserves action intent but need not be literal.
- Headline and supporting copy can be rewritten, condensed, or omitted while factual content remains correct.
- Fixed layout and thumbnail rules are advisory only.
- Only objective integrity or unusable output can hard-fail and automatically retry.
- Fidelity determines eligibility; art direction determines ranking among eligible outputs.
- Contextual taste learning influences ranking only.
- The blind gate reaches at least 60% preference across 12 pairs with zero objective-integrity regressions.
