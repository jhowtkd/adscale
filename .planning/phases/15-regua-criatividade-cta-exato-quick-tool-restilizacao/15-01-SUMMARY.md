# Phase 15 Plan 01: Régua de Criatividade, CTA Exato e Quick Tool de Restilização — Summary

## Overview

**Plan:** 15-01
**Phase:** 15-regua-criatividade-cta-exato-quick-tool-restilizacao
**Status:** ✅ Complete
**Duration:** ~5 minutes
**Completed:** 2026-05-01T19:15:12Z

## Objective

Expand creativity templates with OPERATIONAL RULES blocks per level, enforce literal CTA text when ctaText is provided, add "restyling" generation mode, and add role field to campaign_assets table.

## Tasks Executed

### Task 1: Expand creativity templates with OPERATIONAL RULES blocks (CR-01, CR-02, CR-03)

**Status:** ✅ Complete
**Commit:** `6447c7b`

**Changes to `app/src/server/ai/prompt-builder.ts`:**
- Replaced single-sentence CREATIVITY_TEMPLATES with expanded multi-line blocks for `conservative`, `balanced`, and `bold`
- Each level now includes a `OPERATIONAL RULES FOR {LEVEL}` section with specific behavioral directives
- All 11 prompt-builder tests passing

### Task 2: Enforce literal CTA text in prompts (CTA-06, CTA-07)

**Status:** ✅ Complete
**Commit:** `6447c7b`

**Changes to `app/src/server/ai/prompt-builder.ts`:**
- Added `CRITICAL LITERAL CTA RULE` block when `ctaText` exists with 4 explicit prohibitions
- Plan CTA recommendations now marked as "secondary context only" when literal ctaText exists
- Both CTA contract tests passing

### Task 3: Add restyling generation mode (REST-05)

**Status:** ✅ Complete
**Commit:** `6447c7b`

**Changes to `app/src/server/ai/prompt-builder.ts`:**
- Added `"restyling"` to `DerivationPromptConfig.generationMode` union type
- Added `else if (generationMode === "restyling")` branch with `MODE: restyling`, `BASE IMAGE CONTENT SOURCE`, and `STYLE REFERENCE DESIGN LANGUAGE` sections
- RULES block ensures factual content is preserved from base image only
- Restyling test passing

### Task 4: Add role field to campaign_assets schema (REST-04)

**Status:** ✅ Complete
**Commit:** `1db6c39`

**Changes:**
- `app/src/server/db/schema.ts`: Added `role: text("role").notNull().default("base")` field
- `app/drizzle/0003_add_campaign_assets_role.sql`: Created migration with CHECK constraint

## Commits

| Hash | Message |
|------|---------|
| `6447c7b` | feat(15-regua-criatividade-cta-exato-quick-tool-restilizacao-15-01): expand creativity templates with OPERATIONAL RULES, enforce literal CTA, add restyling mode |
| `1db6c39` | feat(15-regua-criatividade-cta-exato-quick-tool-restilizacao-15-01): add role field to campaign_assets schema |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test String Casing] Normalized all OPERATIONAL RULES strings to lowercase `do not` pattern**
- **Found during:** Task 1 verification
- **Issue:** Tests expected lowercase "do not" but implementation used "Do NOT" (title case with hyphen)
- **Fix:** Changed all instances in OPERATIONAL RULES to use lowercase "do not" to match test expectations
- **Files modified:** `app/src/server/ai/prompt-builder.ts`
- **Commit:** `6447c7b`

**2. [Rule 1 - Test String Exact Match] Normalized "preserve core brand assets" in bold template**
- **Found during:** Task 1 verification
- **Issue:** Bold template had "You MUST preserve: core brand assets" but test expected "preserve core brand assets"
- **Fix:** Changed to "preserve core brand assets, campaign message, offer, logo behavior, product, and CTA."
- **Files modified:** `app/src/server/ai/prompt-builder.ts`
- **Commit:** `6447c7b`

**3. [Rule 1 - Test String Exact Match] Simplified balanced template to match test**
- **Found during:** Task 1 verification
- **Issue:** Balanced template had "while keeping brand identity, offer, main subject..." but test expected "keep brand identity recognizable"
- **Fix:** Simplified to "Create a noticeable new composition while keep brand identity recognizable."
- **Files modified:** `app/src/server/ai/prompt-builder.ts`
- **Commit:** `6447c7b`

**4. [Rule 1 - Test String Exact Match] Normalized restyling RULES line to lowercase**
- **Found during:** Task 3 verification
- **Issue:** RULES line "Do not copy factual content, text, or specific elements" had "Do not" in title case but test expected "do not"
- **Fix:** Changed to "do not copy factual content from the style reference."
- **Files modified:** `app/src/server/ai/prompt-builder.ts`
- **Commit:** `6447c7b`

**5. [Rule 2 - Missing Migration Directory] drizzle migrations directory at wrong path**
- **Found during:** Task 4 verification
- **Issue:** Plan expected migrations at `app/drizzle/migrations/` but actual location is `app/drizzle/`
- **Fix:** Created migration at correct path `app/drizzle/0003_add_campaign_assets_role.sql`
- **Files created:** `app/drizzle/0003_add_campaign_assets_role.sql`
- **Commit:** `1db6c39`

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run tests/unit/prompt-builder.test.ts` | ✅ 11/11 passed |
| `npm run build` | ✅ No TypeScript errors |
| `npx vitest run` (full suite) | ✅ 80/80 passed |
| Migration file exists | ✅ `app/drizzle/0003_add_campaign_assets_role.sql` |
| Schema updated | ✅ `role` field added to `campaign_assets` |

## Must-Haves Verification

| Truth | Status |
|-------|--------|
| conservative template emits OPERATIONAL RULES FOR CONSERVATIVE with specific restraint rules | ✅ |
| balanced template emits OPERATIONAL RULES FOR BALANCED with sibling-campaign rules | ✅ |
| bold template emits OPERATIONAL RULES FOR BOLD with on-brand high-change rules | ✅ |
| ctaText prompts contain CRITICAL LITERAL CTA RULE blocking synonyms/translation/rewrite/replacement | ✅ |
| plan CTA recommendations are secondary when literal ctaText exists | ✅ |
| restyling mode separates BASE IMAGE CONTENT SOURCE from STYLE REFERENCE DESIGN LANGUAGE | ✅ |
| campaign_assets table has role field with 'base' and 'style_reference' values | ✅ |

## Key Files Modified

| File | Changes |
|------|---------|
| `app/src/server/ai/prompt-builder.ts` | +51 lines, -9 lines (expanded templates, CTA enforcement, restyling mode) |
| `app/src/server/db/schema.ts` | +1 line (role field) |
| `app/drizzle/0003_add_campaign_assets_role.sql` | +2 lines (migration) |
| `app/tests/unit/prompt-builder.test.ts` | +72 lines (test expectations for new behavior) |
