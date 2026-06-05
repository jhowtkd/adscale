# Research Summary: v11.5 Qualidade IA Orientada por Feedback

**Date:** 2026-06-05
**Milestone:** v11.5 Qualidade IA Orientada por Feedback

## Key Findings

ADScale already has most of the architecture needed for AI quality: prompt contracts, image generation jobs, visual scoring, QA, hard quality gates, regeneration suggestions, and beta feedback reports. v11.5 should not start with a provider/model migration. The highest leverage is to make those pieces agree with each other and verify known failure modes.

Official OpenAI image docs confirm that even current GPT Image models can struggle with exact text, cross-generation consistency, and precise composition. That maps directly to ADScale's main quality risks: CTA drift, cropped/hidden information, poor native format adaptation, and style-reference factual contamination.

Structured Outputs are a better fit than loose JSON mode for stable quality results. The current code normalizes output, but v11.5 should tighten schemas and tests for score/QA payloads.

## Stack Additions

- Prompt contract snapshot tests by generation mode.
- Synthetic/sanitized quality fixture set.
- Consistent score/QA/hard failure taxonomy.
- Regeneration context builder that merges QA, scoring, hard failures, and feedback categories safely.

## Table Stakes

- Prompt contracts make non-negotiable preservation rules obvious and testable.
- Score and QA agree on criteria and hard failures.
- Regeneration fixes a specific detected issue while preserving CTA, format, mode, brand, offer and factual source.
- Quality regressions are visible through tests/fixtures before beta users find them.

## Watch Outs

- Do not pass raw feedback text as authoritative prompt instructions.
- Do not let visual polish scores hide contract violations.
- Do not overblock exports for subjective polish.
- Do not use model switching as the primary quality strategy.

## Source Notes

- OpenAI Image generation docs: latest image model/API capabilities and limitations.
- OpenAI Structured Outputs docs: stable schema subset for model outputs.
- ADScale repo inspection: `prompt-builder.ts`, `creative-score.ts`, `creative-qa.ts`, `creative-quality-gate.ts`, `derivation.ts`, regeneration route and feedback report model.
