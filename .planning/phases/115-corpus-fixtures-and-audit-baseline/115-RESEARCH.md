# Phase 115: Corpus Fixtures and Audit Baseline — Research

**Researched:** 2026-06-15
**Phase requirements:** FIXT-01, FIXT-02, FIXT-03, FIXT-04
**Confidence:** HIGH

## Executive Summary

Phase 115 must freeze the June 2026 creative audit (`app/exports/render-creatives/`, 34 items, 58.5/100 avg) into typed, CI-safe fixtures before any prompt or gate fixes. v11.5 already provides `QUALITY_FIXTURES` with six synthetic failure modes — v12.3 extends this with **corpus archetypes** tied to real derivation IDs and canonical campaign metadata.

The phase does **not** fix the pipeline. It documents wrongful approval via **intentionally red baseline tests** that assert what the gate *should* do after Phases 116–120.

## Codebase Findings

### Existing foundation (reuse)

- `app/src/server/ai/quality-fixtures.ts` — `QualityFixture`, `QUALITY_FIXTURES`, six synthetic modes
- `app/tests/unit/ai/quality-fixture-pipeline.test.ts` — normalize → classify → verdict matrix
- `app/tests/unit/ai/creative-quality-gate.test.ts` — hard-failure classification
- `app/exports/render-creatives/manifest.json` — 34 audited exports with `is_preview`, mode, format, campaign
- `app/src/server/ai/prompt-builder.test-fixtures.ts` — fictional contract builders

### Audit failure archetypes (must fixture)

| Archetype | Corpus examples (id prefix) | Current gate behavior |
|-----------|------------------------------|---------------------|
| `invented_factual_entity` | `27069645`, `a753e357`, `20c0cc8c`, `a5f65b85`, `f420bcb2`, `be287910` | Passes — no entity hard failure |
| `visual_overload` | `8a2bebf9`, `c32bf93c`, `307b2a41`, `3dffb311` | Passes — generic → polish |
| `generic_template_aesthetic` | `6fc63100` (borderline pass), many NR1 variants | Passes or improvable |
| `format_campaign_drift` | `538246da`, `27069645` | Passes — no identity check |
| `restyling_factual_contamination` | `d7d9d323`, `a5f65b85` | Partial — `copied_style_reference_facts` only for offer/text |

### Canonical campaigns (FIXT-02)

| Slug | Manifest campaigns | Notes |
|------|-------------------|-------|
| `smoke` | Smoke v11.6 CQA-02 | Clean baseline; `8907bce5` good final |
| `nova-campanha` | Nova campanha | Professors/education theme |
| `teste-3-nr1` | Teste 3, CENBRAP NR1 | Dense card grids |
| `teste-campanha-nr1` | Teste campanha, Master NR1 | Worst overload cluster |

### Preview vs final (FIXT-03)

- 10 manifest entries `is_preview: true`, all `1:1`, ~270×270
- 24 finals at full resolution
- Fixtures must carry `renderTier: "preview" | "final"` — gate expectations may differ (thumbnail readability vs full fidelity)

## Recommended Module Layout

```
app/src/server/ai/creative-corpus.ts     # CorpusArchetype, CANONICAL_CAMPAIGNS, CORPUS_ARCHEtypes
app/src/server/ai/corpus-fixtures.ts     # CORPUS_QUALITY_FIXTURES extending pattern from quality-fixtures
app/tests/unit/ai/creative-corpus.test.ts  # Catalog integrity
app/tests/unit/ai/corpus-baseline.test.ts # RED baseline: gate should block but doesn't (FIXT-04)
```

**Do not** commit multi-MB PNGs to `app/tests/fixtures/` — reference manifest `fileName` + `id` only; optional lightweight JSON sidecar under `app/tests/fixtures/creative-corpus/manifest-index.json` generated from export manifest.

## FIXT-04 Red Baseline Strategy

Baseline tests use **synthetic QA JSON mirroring audit observations** (e.g. creativeRisk note mentioning "Eric Cantona", "Manchester United") fed through `classifyCreativeQualityGate` + `deriveQualityVerdict`.

```typescript
// Intended pattern — test FAILS on current code:
expect(deriveQualityVerdict({ hardFailures, checklist })).toBe("invalid");
// Currently returns "acceptable" or "improvable"
```

Mark suite with `describe.skip` alternative: use `it.fails` or explicit `// baseline-red` tag + `expect.soft` documenting current vs desired — prefer **failing tests** per FIXT-04 requirement ("demonstram que o pipeline atual aprova indevidamente").

Executor may use Vitest `test.fails` for baseline-red cases until Phase 120 greens them.

## Phase Boundaries

### In scope

- Corpus catalog types and canonical campaign registry
- Five+ audit archetype fixtures with contracts derived from campaign metadata
- Preview/final dimension on fixtures
- Red baseline gate tests
- Integrity tests (no `/Users/`, no secrets in fixtures)

### Out of scope

- Prompt injection (Phase 116)
- New hard-failure codes in production gate (Phase 120)
- Live OpenAI or image bytes in CI
- Changing production approval behavior in this phase

## Validation Architecture

| Layer | Command | Proves |
|-------|---------|--------|
| Catalog integrity | `npm test -- tests/unit/ai/creative-corpus.test.ts` | FIXT-02, FIXT-03 |
| Archetype fixtures | `npm test -- tests/unit/ai/corpus-fixtures.test.ts` | FIXT-01 |
| Red baseline | `npm test -- tests/unit/ai/corpus-baseline.test.ts` | FIXT-04 |
| Regression guard | `npm test -- tests/unit/ai/quality-fixture-pipeline.test.ts` | No v11.5 regression |

## Dependencies

- Phase 114 shipped (UI baseline only — no code dependency)
- v11.5 quality infrastructure must remain green

## Open Questions (executor discretion)

- Single `corpus-fixtures.ts` vs extend `quality-fixtures.ts` — prefer separate module importing shared types to avoid breaking six-fixture count tests
- Whether `test.fails` or normal `expect` red tests — use `test.fails` if normal expects would break CI; document in SUMMARY

---
*Phase 115 research complete — ready for planning*
