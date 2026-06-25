# Phase 183: Campaign Complete Happy Path - Research

**Researched:** 2026-06-25

## Summary

`start_complete_campaign` executor atualiza campanha com brief mínimo, gera plano criativo (se ausente), enfileira derivação preview com `assistantActionId`. Review no assistente reutiliza `DerivationReviewSheet` via `AssistantReviewPanel`. Smoke E2E verifica shell `/assistant` + painéis de contexto/review.

## Validation Architecture

| Layer | Mechanism |
|-------|-----------|
| ACT-05 | `start_complete_campaign` contract + campaign-scoped thread |
| EXEC-03 | `AssistantReviewPanel` wraps workspace `DerivationReviewSheet` |
| EXEC-04 | Preview path via executor; full package via `quick_package` (182) |
| E2E | `assistant-happy-path.spec.ts` (skips without auth) |
