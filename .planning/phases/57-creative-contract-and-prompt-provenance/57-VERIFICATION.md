---
phase: 57-creative-contract-and-prompt-provenance
verified: 2026-06-05T13:45:00Z
status: passed
score: 9/9
overrides_applied: 0
---

# Phase 57: Creative Contract and Prompt Provenance Verification Report

**Phase Goal:** Make generation contracts explicit, testable, and inspectable across all derivation modes.

**Verified:** 2026-06-05T13:45:00Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every derivation has an inspectable contract object before generation | ✓ VERIFIED | `resolvedContract` built at `derivation.ts:407-422` before `buildDerivationPrompt` at `:447`; pre-generation persist via `updateDerivationPromptProvenance` at `:517-521` |
| 2 | Every generated derivation persists the exact creative contract used to build the prompt | ✓ VERIFIED | Job tests assert `creativeContract` on final `updateDerivationPromptProvenance` call (`derivation.test.ts:383-412`, `:500-523`); repository helper writes `creative_contract` JSONB |
| 3 | Prompt provenance is structured data, not only prompt prose | ✓ VERIFIED | `PromptProvenance` type in `creative-contract.ts:64-76` with `schemaVersion`, model, operation, source descriptor; persisted as `prompt_provenance` JSONB |
| 4 | Source package inspectable with campaign asset or approved derivation IDs/keys | ✓ VERIFIED | `SourcePackage` + `SourceDescriptor` types; job tests assert `campaign_asset` with `assetId`/`assetKey` and `approved_derivation` with `derivationId`/`outputKey` |
| 5 | Restyling contracts persist resolved base/style assets before scoring/quality gate | ✓ VERIFIED | Restyling resolves `resolvedBaseAssetId`/`resolvedStyleAssetId` at `derivation.ts:388-402` before prompt build; `generated.resolvedContract` passed to `scoreCompletedDerivation` (`:776`) and `runCompletedDerivationQualityGate` (`:811`) |
| 6 | Art variation prompts preserve required facts while creative level changes composition (AIC-02) | ✓ VERIFIED | `prompt-builder.test.ts` describe block `art variation contract (AIC-02)` with invariants + hard-rule inline snapshot |
| 7 | Format adaptation prompts require native layouts and reject padding/letterboxing (AIC-03) | ✓ VERIFIED | `format adaptation contract (AIC-03)` tests + `approved_derivation` mode snapshot; unit tests assert letterboxing rejection |
| 8 | Restyling prompts treat base image as factual source, style reference as visual language only (AIC-04) | ✓ VERIFIED | `restyling contract (AIC-04)` tests with factual-source inline snapshot; fixtures include `baseAssetId`/`styleAssetId` |
| 9 | Hard contract rules (CTA, format, brand/product/offer, source package) outrank flexible guidance | ✓ VERIFIED | Art variation test asserts `CRITICAL LITERAL CTA RULE` precedes `Creative Strategy:`, brand memory, and revision feedback (`prompt-builder.test.ts:411-419`) |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/drizzle/0027_creative_contract_provenance.sql` | JSONB migration | ✓ VERIFIED | Adds `creative_contract` and `prompt_provenance` columns |
| `app/src/server/db/schema.ts` | Drizzle column mappings | ✓ VERIFIED | Typed `creativeContract` and `promptProvenance` on derivations table |
| `app/src/server/ai/creative-contract.ts` | Canonical contract + provenance types | ✓ VERIFIED | 92 lines; `CreativeContract`, `PromptProvenance`, `SourcePackage`, descriptors, `FACTUAL_SOURCE_RULES` |
| `app/src/server/repositories/derivation.ts` | Workspace-scoped persistence helper | ✓ VERIFIED | `updateDerivationPromptProvenance` scopes by `id` + `workspaceId` |
| `app/src/server/jobs/derivation.ts` | Contract resolution + provenance wiring | ✓ VERIFIED | Resolves package/contract before prompt; two-phase provenance write |
| `app/src/server/ai/prompt-builder.test-fixtures.ts` | Shared mode fixtures | ✓ VERIFIED | Fixtures for all three modes + `derivationConfigFromContract` |
| `app/src/server/ai/prompt-builder.ts` | Compact section extractors | ✓ VERIFIED | `extractPromptHardRulesSection`, `extractPromptModeSection`, `extractPromptRestylingFactualSourceSection` |
| `app/src/server/ai/prompt-builder.test.ts` | AIC-02/03/04 regression tests | ✓ VERIFIED | Invariant assertions + compact inline snapshots per mode |
| `app/tests/unit/prompt-builder.test.ts` | Unit-suite contract coverage | ✓ VERIFIED | Shared fixtures; approved_derivation mode snapshot |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `derivation.ts` | `creative-contract.ts` | `CreativeContract` / `PromptProvenance` types | ✓ WIRED | Imports and builds `resolvedContract` |
| `derivation.ts` | `prompt-builder.ts` | `buildDerivationPrompt({ contract: resolvedContract })` | ✓ WIRED | Contract passed at `:462` after full resolution |
| `derivation.ts` | `repositories/derivation.ts` | `updateDerivationPromptProvenance` | ✓ WIRED | Pre- and post-generation calls at `:517`, `:661` |
| `derivation.ts` | scoring / quality gate | `generated.resolvedContract` | ✓ WIRED | Same contract object flows to downstream stages |
| `prompt-builder.test.ts` | `prompt-builder.test-fixtures.ts` | `derivationConfigFromContract` | ✓ WIRED | Tests use Plan 57-01 persistence shapes |
| UI / API routes | derivations debug fields | — | ✓ NOT EXPOSED | `creativeContract`/`promptProvenance` only in server layer; satisfies internal-only debug requirement |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `derivation.ts` job | `resolvedContract` | Campaign, asset, parent derivation, mode | Yes — resolved from DB entities | ✓ FLOWING |
| `derivation.ts` job | `promptProvenance` | Built prompt + OpenAI response | Yes — input prompt, revised prompt, output key, operation | ✓ FLOWING |
| `updateDerivationPromptProvenance` | DB row | Typed contract/provenance objects | Yes — JSONB persist | ✓ FLOWING |
| `getDerivationById` | returned row | `select()` all columns | Yes — includes new JSONB fields when populated | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 57 focused test bundle | `npm test -- derivation.test.ts prompt-builder.test.ts` | 74 tests passed | ✓ PASS |
| Production build | `npm run build` | Exit 0 | ✓ PASS |
| Migration file exists | `0027_creative_contract_provenance.sql` | 2 ALTER TABLE statements | ✓ PASS |
| Summary commits exist | `git cat-file -t` on documented hashes | All commits resolve | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIC-01 | 57-01 | Developer can inspect explicit creative contract per derivation | ✓ SATISFIED | `CreativeContract` type + `creative_contract` JSONB; `getDerivationById` returns full row |
| AIC-02 | 57-02 | Art variation prompt tests preserve required information | ✓ SATISFIED | `art variation contract (AIC-02)` describe block |
| AIC-03 | 57-02 | Format adaptation tests prove native layout, reject padding | ✓ SATISFIED | `format adaptation contract (AIC-03)` + unit letterboxing tests |
| AIC-04 | 57-02 | Restyling tests separate factual base from style reference | ✓ SATISFIED | `restyling contract (AIC-04)` + factual-source snapshot |
| AIC-05 | 57-01 | Derivations retain prompt provenance for debugging | ✓ SATISFIED | `PromptProvenance` persisted with input/revised prompt, contract fields, mode, format, source package |

All five phase requirement IDs are claimed in plan frontmatter and satisfied in implementation. No orphaned requirements for Phase 57.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None blocking | — | No TODO/FIXME/placeholder stubs in phase deliverables |

### Human Verification Required

None required for phase goal achievement. Automated tests and code inspection cover all must-haves.

**Operational note (non-blocking):** Apply migration `app/drizzle/0027_creative_contract_provenance.sql` on deployed databases before relying on persisted columns in production.

### Gaps Summary

No gaps found. Phase 57 delivers explicit, testable, and inspectable generation contracts across art variation, format adaptation, and restyling, with structured prompt provenance persisted on every generation path covered by job tests.

---

_Verified: 2026-06-05T13:45:00Z_

_Verifier: Claude (gsd-verifier)_
