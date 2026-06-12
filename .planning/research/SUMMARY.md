# Project Research Summary

**Project:** ADScale v12.1 Memória Criativa e Aprendizado de Performance
**Domain:** Closed-loop creative performance learning
**Researched:** 2026-06-12
**Confidence:** HIGH for product/architecture direction; MEDIUM for thresholds until real imports exist

## Executive Summary

ADScale already owns the creative context required to make performance data useful: client profile, brief, recipe, CTA, format, creative contract, quality/readiness scores and derivation lineage. The missing capability is a trustworthy evidence ledger connecting those artifacts to media outcomes. v12.1 should add this ledger without committing to provider APIs.

The recommended approach is import-first: manual entry and CSV mapping produce canonical raw metrics, comparisons distinguish observational signals from controlled hypotheses, and client learnings always cite evidence, sample size, contradictions and confidence. Recommendations then launch an editable next experiment through existing campaign/recipe flows.

The primary risk is false certainty. Official ad-platform guidance explicitly treats asset-level ratio metrics as directional and supports no-clear-winner states when evidence is insufficient. ADScale should differentiate itself through transparent evidence, not an opaque AI score.

## Key Findings

### Recommended Stack

- Keep Next.js, Postgres, Drizzle, Zod and Recharts.
- Add only `papaparse@5.5.3` plus typings for browser parsing and mapping preview.
- Store exact currency/ratios as PostgreSQL numeric values, not floating-point canonical values.
- Use deterministic comparison/confidence rules; AI may later explain bounded evidence.

### Must-Have Features

- Canonical raw metrics and derived CTR/CPC/CPA/ROAS.
- Manual entry and CSV mapping preview with row-level repair.
- Import audit, dedupe and attribution-window updates.
- Hypothesis with one primary variable and primary metric.
- Comparable variant results with `winner`, `no clear winner` and `not comparable`.
- Client learning cards citing support, contradiction, sample and recency.
- Editable next-experiment action integrated with the existing cockpit.

### Defer

- Direct Meta/Google/TikTok APIs.
- Cross-client benchmarks.
- Multi-touch attribution.
- Automated publishing, bidding or budget changes.
- LLM-generated ranking without deterministic evidence.

### Architecture

Use four explicit concepts: hypotheses, import batches, performance snapshots and derived client learnings. Raw snapshots remain auditable; learning records are versioned and rebuildable. The campaign workspace is the primary surface, while client memory summarizes patterns across campaigns.

### Critical Pitfalls

1. Comparing different delivery contexts as if they were controlled tests.
2. Turning directional asset metrics into causal claims.
3. Duplicating spend/conversions on re-import.
4. Misreading locale, percentages or currency.
5. Creating permanent rules from sparse data.
6. CSV formula injection and cross-workspace leakage.
7. Letting an LLM invent winner/confidence logic.

## Implications for Roadmap

### Phase 103: Performance Data Foundation

**Delivers:** schemas, migrations, repositories, canonical metrics, source identity, workspace isolation and fixtures.

### Phase 104: Manual and CSV Import

**Delivers:** manual form, mapping preview, row errors, transactional import, dedupe/upsert and import history.

### Phase 105: Hypotheses and Variant Comparison

**Delivers:** primary-variable hypotheses, comparable cohorts, derived metrics and honest winner states.

### Phase 106: Client Performance Memory

**Delivers:** evidence-backed patterns by CTA/format/recipe/style with confidence, contradictions and recency.

### Phase 107: Learning to Next Experiment

**Delivers:** explainable recommendation and editable prefill into existing campaign/recipe flow.

### Phase 108: Verification and Operator Learning Gate

**Delivers:** migration verification, focused/full regression, browser import UAT and real sample evidence that recommendations remain explainable.

### Ordering Rationale

- Trustworthy imports must precede all comparisons.
- Hypotheses and comparability must precede memory aggregation.
- Memory evidence must precede recommendations.
- Real operator data is required before locking future API integrations or statistical thresholds.

## Research Flags

- **Phase 105:** Define conservative confidence tiers from available aggregate data; do not claim platform-equivalent statistical significance.
- **Phase 106:** Validate minimum evidence and contradiction rules with fixture and operator data.
- **Phase 108:** Use real exports from at least two provider/locales if available.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack fits; one bounded parser addition |
| Features | HIGH | Core workflow follows official reporting/experiment behavior |
| Architecture | HIGH | Clear integration anchors already exist |
| Statistical thresholds | MEDIUM | Must be calibrated against actual imported data |
| Provider mapping presets | MEDIUM | Real export samples are required |

## Sources

### Primary

- https://support.google.com/google-ads/answer/16259414
- https://support.google.com/google-ads/answer/6318747
- https://support.google.com/google-ads/answer/13719071
- https://developers.google.com/google-ads/api/docs/api-policy/rmf
- https://www.facebook.com/business/help/1738164643098669
- https://www.papaparse.com/docs
- https://orm.drizzle.team/docs/transactions
- https://orm.drizzle.team/docs/guides/upsert
- https://www.postgresql.org/docs/current/datatype-numeric.html
- https://owasp.org/www-community/attacks/CSV_Injection

### Project Evidence

- `.planning/phases/94-learning-closure-threshold-tune/94-LEARNING-ANSWERS.md`
- `app/src/server/db/schema.ts`
- `app/src/server/memory/`
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

---
*Research completed: 2026-06-12*
*Ready for requirements: yes*
