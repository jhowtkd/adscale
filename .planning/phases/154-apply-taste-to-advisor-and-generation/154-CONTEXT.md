---
phase: 154
slug: apply-taste-to-advisor-and-generation
status: complete
created: 2026-06-20
depends_on:
  - 153
requirements:
  - APPLY-01
  - APPLY-02
  - APPLY-03
  - APPLY-04
---

# Phase 154 - Context

## Goal

Apply approved brand taste rules to prompt-builder and verdict explanations without diluting global Olhar or export safety.

## Decisions (--auto)

1. **Prompt integration:** `DerivationPromptConfig.brandTasteConstraints` injects bounded BRAND TASTE CONSTRAINTS section after integrity rules.
2. **Global Olhar preserved:** Brand taste section explicitly subordinate to Olhar ADScale and export hard rules.
3. **Verdict refs:** `applyBrandTasteToVerdictExplanation` appends `rule:{id}` refs.
4. **Regression:** Existing prompt-builder and quality-gate tests remain the safety regression surface.
