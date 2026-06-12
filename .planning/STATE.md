# Project State

**Last updated:** 2026-06-12
**Current milestone:** v12.1 Memória Criativa e Aprendizado de Performance
**Status:** `defining_requirements`

## Summary

v12.1 transforma métricas reais de mídia em memória por cliente e recomendações explicáveis para o próximo experimento criativo. Escopo inicial confirmado; requisitos e roadmap ainda serão definidos.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-12 — Milestone v12.1 started

## Last completed milestone

| Milestone | Phases | Shipped | Archive |
|-----------|--------|---------|---------|
| v12.0 Monetização Real | 97–102 | 2026-06-11 | [ROADMAP](milestones/v12.0-ROADMAP.md) · [REQUIREMENTS](milestones/v12.0-REQUIREMENTS.md) · [AUDIT](milestones/v12.0-MILESTONE-AUDIT.md) |

## Release gate (last verified)

- `npm test` — 1061 passed (1 skipped)
- `npm run lint` — 0 errors
- `npm run build` — OK

## Known follow-ups (non-blocking)

1. BillingTab may show stale "Inativo" after checkout redirect while API returns `active` — see audit item 4.
2. Production Render still on Stripe **test** keys until live cutover.

## Milestone Goal

Associar hipóteses e derivações a resultados importados manualmente/CSV, identificar padrões por cliente e recomendar a próxima ação com evidência, amostra e confiança explícitas.

## Next action

Define and confirm v12.1 requirements, then create the roadmap starting at Phase 103.
