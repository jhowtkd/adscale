---
phase: 115-corpus-fixtures-and-audit-baseline
verified: 2026-06-15T13:33:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 115: Corpus Fixtures and Audit Baseline Verification Report

**Phase Goal:** Operadores e testes podem reproduzir cada falha crítica do corpus auditado antes de qualquer correção do pipeline.

**Verified:** 2026-06-15T13:33:00Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cada falha do corpus auditado (5 arquétipos) possui fixture reproduzível no catálogo equivalente | ✓ VERIFIED | `CORPUS_ARCHETYPE_FIXTURES` em `corpus-fixtures.ts` — 5 fixtures, um por arquétipo, com `corpusRefIds` ligados ao manifest |
| 2 | Quatro campanhas canônicas registradas com entidades, modos e formatos | ✓ VERIFIED | `CANONICAL_CAMPAIGNS` em `creative-corpus.ts` — smoke, nova-campanha, teste-3-nr1, teste-campanha-nr1 com `allowedEntities`, `typicalModes`, `typicalFormats` |
| 3 | Previews (`270×270`) e finais são categorias distintas nas fixtures e validação | ✓ VERIFIED | `renderTier: "preview" \| "final"` no manifest index; testes em `creative-corpus.test.ts` e `corpus-fixtures.test.ts` cobrem ambos os tiers sem misturar expectativas |
| 4 | Testes automatizados documentam aprovação indevida do pipeline (baseline red) | ✓ VERIFIED | `corpus-baseline.test.ts` — 5× `it.fails` baseline-red (expected fail), 5× `baseline-snapshot` passando; 3 arquétipos com `baselineVerdict: "acceptable"`, 2 com gap parcial (veredito `invalid` mas códigos de hard-failure ausentes) |
| 5 | Todo export do manifest auditado indexado por derivation id com tier | ✓ VERIFIED | `CORPUS_MANIFEST_INDEX` — 33 entradas (= `manifest.json` fonte); cada entrada tem `id`, `idPrefix`, `renderTier` |
| 6 | Módulo corpus é CI-safe (sem secrets ou paths absolutos) | ✓ VERIFIED | Testes `creative-corpus.test.ts` e `corpus-fixtures.test.ts` rejeitam `/Users/`, `r2.dev`, `output_key`; grep sem matches em código-fonte |
| 7 | Fixtures usam contratos fictional-safe derivados de campanhas canônicas | ✓ VERIFIED | `corpus-fixtures.ts` usa `prompt-builder.test-fixtures` com copy NR1/education fictícia; teste rejeita paths e `Teste_debuf` |
| 8 | Cinco arquétipos de auditoria cobertos com refs de corpus | ✓ VERIFIED | `invented_factual_entity`, `visual_overload`, `generic_template_aesthetic`, `format_campaign_drift`, `restyling_factual_contamination` — cada um com refs validadas contra `MANIFEST_PREFIXES` |
| 9 | Regressão v11.5 six-fixture pipeline permanece verde | ✓ VERIFIED | `quality-fixture-pipeline.test.ts` — 13/13 passed |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/server/ai/creative-corpus.ts` | CANONICAL_CAMPAIGNS, CORPUS_MANIFEST_INDEX, render tier types | ✓ VERIFIED | 102 linhas; importa manifest-index; exporta tipos e registry |
| `app/tests/fixtures/creative-corpus/manifest-index.json` | Slim index from render-creatives manifest | ✓ VERIFIED | 33 entradas; campos slim only; 11 preview + 22 final |
| `app/tests/unit/ai/creative-corpus.test.ts` | Catalog integrity tests | ✓ VERIFIED | 9 testes; wired via vitest |
| `app/src/server/ai/corpus-fixtures.ts` | CORPUS_ARCHETYPE_FIXTURES, CorpusArchetype | ✓ VERIFIED | 226 linhas; 5 fixtures com contratos + QA sintético |
| `app/tests/unit/ai/corpus-fixtures.test.ts` | Archetype catalog integrity | ✓ VERIFIED | 8 testes cobrindo cobertura, refs, tiers, styleFidelity |
| `app/tests/unit/ai/corpus-baseline.test.ts` | Red baseline gate matrix | ✓ VERIFIED | 13 testes (5 expected fail + 8 pass); exporta `BASELINE_GAP_COUNT=5` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `creative-corpus.ts` | `manifest-index.json` | import | ✓ WIRED | `import manifestIndex from "../../../tests/fixtures/creative-corpus/manifest-index.json"` |
| `corpus-fixtures.ts` | `creative-corpus.ts` | canonicalSlug + corpusRefId | ✓ WIRED | Importa `CanonicalCampaignSlug`, `CorpusRenderTier`; cada fixture tem `canonicalSlug` e `corpusRefIds` |
| `corpus-fixtures.ts` | `quality-fixtures.ts` | QualityVerdict type | ✓ WIRED | `import type { QualityVerdict } from "./quality-fixtures"` |
| `corpus-baseline.test.ts` | `creative-quality-gate.ts` | classifyCreativeQualityGate + deriveQualityVerdict | ✓ WIRED | `runCorpusGatePipeline()` chama gate e deriva veredito |
| `corpus-baseline.test.ts` | `corpus-fixtures.ts` | CORPUS_ARCHETYPE_FIXTURES | ✓ WIRED | `describe.each(CORPUS_ARCHETYPE_FIXTURES)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `corpus-baseline.test.ts` | `verdict`, `gate.hardFailures` | `normalizeCreativeQaResult(fixture.rawQaModelOutput)` → `classifyCreativeQualityGate` | Sim — QA sintético por arquétipo alimenta gate real | ✓ FLOWING |
| `creative-corpus.ts` | `CORPUS_MANIFEST_INDEX` | `manifest-index.json` (33 exports reais) | Sim — metadata de exports auditados | ✓ FLOWING |
| `corpus-fixtures.ts` | `corpusRefIds` | Prefixos do manifest index | Sim — 10/10 refs de corpus verificados com PNG on-disk | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Corpus unit tests pass | `npm test -- tests/unit/ai/creative-corpus.test.ts tests/unit/ai/corpus-fixtures.test.ts tests/unit/ai/corpus-baseline.test.ts` | 25 passed \| 5 expected fail (30 total) | ✓ PASS |
| Pipeline regression green | `npm test -- tests/unit/ai/quality-fixture-pipeline.test.ts` | 13 passed | ✓ PASS |
| Corpus PNG exports exist | Node fs check on 10 `corpusRefIds` | 10/10 OK under `app/exports/render-creatives/` | ✓ PASS |
| Manifest index parity | Compare lengths | source 33 = index 33 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FIXT-01 | 115-02 | Cada falha do corpus auditado possui fixture reproduzível | ✓ SATISFIED | `CORPUS_ARCHETYPE_FIXTURES` — 5 arquétipos, refs validadas, testes de integridade |
| FIXT-02 | 115-01 | Fixtures registram campanha canônica, entidades, modos, formatos | ✓ SATISFIED | `CANONICAL_CAMPAIGNS` com 4 slugs; fixtures ligam `canonicalSlug` |
| FIXT-03 | 115-01 | Previews e finais são categorias distintas | ✓ SATISFIED | `CorpusRenderTier`; manifest index com `renderTier`; fixtures com preview e final |
| FIXT-04 | 115-03 | Testes demonstram aprovação indevida (baseline red) | ✓ SATISFIED | 5× `it.fails` baseline-red; 3 wrongful `acceptable`; 2 partial gap (invalid sem códigos archetype); `BASELINE_GAP_COUNT=5` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Nenhum TODO/FIXME/placeholder/stub encontrado nos artefatos da fase | — | — |

### Human Verification Required

Nenhum item bloqueante. A reprodução operacional de falhas visuais via PNG permanece disponível via `corpusRefIds` → `fileName` no manifest index (10/10 PNGs verificados on-disk); validação visual formal é escopo da Phase 123.

### Gaps Summary

Nenhum gap identificado. A fase entrega catálogo tipado, fixtures por arquétipo, index slim do manifest auditado e suite baseline-red que mantém CI verde enquanto documenta gaps para Phase 120+.

**Nota de calibração FIXT-04:** Dois arquétipos (`format_campaign_drift`, `restyling_factual_contamination`) já recebem veredito `invalid` no gate atual, mas falham nos testes `baseline-red` por ausência dos códigos `format_campaign_drift` / `restyling_factual_contamination` esperados — gap parcial documentado conforme decisão em `115-03-SUMMARY.md`. Isso satisfaz o contrato da fase (baseline red antes da correção), não constitui falha de verificação.

---

_Verified: 2026-06-15T13:33:00Z_
_Verifier: Claude (gsd-verifier)_
