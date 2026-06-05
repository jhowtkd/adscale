# Feature Research: v11.5 Qualidade IA Orientada por Feedback

**Date:** 2026-06-05
**Milestone:** v11.5 Qualidade IA Orientada por Feedback

## Table Stakes

### Contract and Prompt Quality

- Each generation mode has a clear creative contract.
- Prompt-builder has tests that prove non-negotiable rules appear for CTA, format, brand, offer, factual source, and preservation.
- Restyling explicitly protects base-image facts from style-reference contamination.
- Format adaptation prompts treat source creatives as modules to rearrange, not posters to crop or pad.
- Prompt provenance is inspectable: input prompt, revised/generated prompt when available, contract, mode and source assets.

### Scoring and QA Reliability

- Score output must not hide hard contract violations behind a high visual polish score.
- QA and scoring use consistent criteria and terminology.
- Hard failures are deterministic enough to power approve/export blocking.
- Soft issues remain advisory and actionable.
- Scoring and QA output shapes are validated and normalized.

### Regeneration Quality

- Regeneration suggestions include the detected issue, required contract fields, target format, generation mode, and exact/inherited CTA rule.
- Regeneration can consume QA, score issues, hard failures, and optional user/beta feedback without losing the original source of truth.
- The UI should expose why regeneration is suggested and what it will try to fix.

### Verification

- Known failure modes have tests or fixtures.
- At least one end-to-end manual smoke path confirms prompt -> generation -> scoring/QA -> hard failure/regeneration suggestion.

## Differentiators

- Quality comparison panel that shows "contract expected" vs "what failed".
- Regeneration reason chips from hard failures and feedback report categories.
- Fixture-driven quality regression suite that can grow from beta feedback.
- Prompt/contract diff view for owner debugging.

## Anti-Features

- One-click infinite auto-regenerate.
- Model/provider migration as a substitute for quality contracts.
- Overly strict QA that blocks usable creative because of minor polish suggestions.
- User-facing raw prompt dumps.
- Treating feedback reports as prompt injection.

## Complexity Notes

- Contract/prompt and QA/scoring must be kept in sync, or users will get contradictory instructions.
- Some quality failures are vision-model limitations, so the product needs good detection and correction loops rather than pretending to guarantee perfect first output.
- Fixtures should be synthetic or sanitized to avoid leaking customer creative.
