# Phase 60 — Residual Model Limitations

**Date:** 2026-06-05

Automated fixtures and regression tests prove contract wiring, taxonomy classification, and regeneration brief assembly. They do **not** eliminate model-dependent quality gaps below.

## Text rendering

Image generation models may misspell, truncate, stylize, or omit CTA/headline copy despite explicit contract rules in prompts. Fixtures catch prompt regressions and `cta_drift` / `unreadable_required_text` classification — not pixel-perfect glyph accuracy.

## Visual consistency

Regenerations and mode switches (art variation, format adaptation, restyling) may drift color, typography, or layout between attempts. Scoring remains advisory except where hard-failure codes apply.

## Precise composition

Format adaptation can produce near-miss layouts (blur bands, crowded zones, partial crops) that pass casual review but fail strict brand standards. Human review is required for edge-case exports, especially 9:16 and 4:5 targets.

## Vision model variability

Score and QA JSON from vision models can vary run-to-run on the same image. Normalization (`normalizeCreativeScoreResult`, `normalizeCreativeQaResult`) and the hard-failure gate exist to bound impact — not to guarantee identical scores across retries.

## What fixtures guarantee

| Guaranteed | Not guaranteed |
|------------|----------------|
| Prompt contract sections for each failure-mode context | Final rendered text matches contract verbatim |
| Hard-failure taxonomy classification for synthetic QA outputs | Vision model always returns same JSON shape |
| Regeneration brief includes failure codes + preservation tail | Regenerated image fixes the issue on first attempt |
| `assertDerivationApprovable` blocks invalid verdicts | Export-ready pixel QA without human eyes |

## What still needs human review

- Final pixel check before paid media export
- Locale-specific copy nuance (PT-BR vs EN phrasing beyond gate patterns)
- Brand-subjective polish (contrast, mood) when verdict is `improvable`

## Related

- Manual verification loop: [60-HANDOFF.md](./60-HANDOFF.md)
- OpenAI image generation generally trades layout control for creative flexibility; provider limits apply regardless of ADScale contract enforcement.
