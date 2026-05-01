# Phase 15 Plan 02: Régua de Criatividade, CTA Exato e Quick Tool de Restilização — Summary

## Overview

**Plan:** 15-02
**Phase:** 15-regua-criatividade-cta-exato-quick-tool-restilizacao
**Status:** ✅ Complete
**Duration:** ~26 minutes
**Completed:** 2026-05-01T19:43:04Z

## Objective

Add Restilização quick tool to home screen (REST-01, REST-02), create the API route to handle restyling requests (REST-03, REST-06), and update the derivation job to support two-image images.edit calls for restyling mode.

## Tasks Executed

### Task 1: Replace disabled reports card with Restilização quick action card (REST-01, REST-02)

**Status:** ✅ Complete
**Commit:** `69237b8`

**Changes:**
- `app/src/app/(dashboard)/page.tsx`: Replaced `BarChart3` icon with `Sparkles`, changed title/description to use `t("restyling")`/`t("restylingDesc")`, removed `disabled` prop, added `onClick={() => setShowRestylingModal(true)}`
- Added `onClick?: () => void` prop to `QuickActionCardProps` interface and `onClick={onClick}` to motion.div
- Added `useState` import and `const [showRestylingModal, setShowRestylingModal] = useState(false)` to DashboardPage
- Added `RestylingModal` component at bottom of DashboardPage JSX
- `app/messages/pt-BR.json`: Added `restyling` and `restylingDesc` keys
- `app/messages/en.json`: Added `restyling` and `restylingDesc` keys
- `app/src/components/workspace/RestylingModal.tsx`: Created new modal component with form fields for name, client, offer, ctaText, notes, baseImage, and styleImage; submits via multipart/form-data POST to `/api/quick-tools/restyling`

### Task 2: Create POST /api/quick-tools/restyling API route (REST-03, REST-04)

**Status:** ✅ Complete
**Commit:** `649d608`

**Changes:**
- `app/src/app/api/quick-tools/restyling/route.ts`: Created new route handling multipart/form-data
  - Validates required fields: name, baseImage (File), styleImage (File)
  - Validates image types (PNG/JPEG/WebP only) and file sizes (max 50MB)
  - Creates campaign with `generationMode: "restyling"` and `creativeLevel: "balanced"`
  - Uploads both images to R2 storage with UUID-based keys
  - Creates two `campaign_assets` records (base and style_reference)
  - Creates derivation with `generationMode: "restyling"`, `format: "1:1"`
  - Sends `derivation.generate` Inngest event
  - Returns `{ campaignId, derivationId, redirectUrl: `/campaigns/${campaignId}` }`
- `app/src/server/repositories/campaign.ts`: Extended `GenerationMode` type to include `"restyling"`
- `app/src/app/api/campaigns/route.ts`: Extended Zod schema `generationMode` enum to include `"restyling"`

### Task 3: Update derivation job for restyling mode with two-image images.edit (REST-06)

**Status:** ✅ Complete
**Commit:** `83b1fe6`

**Changes:**
- `app/src/server/jobs/derivation.ts`:
  - Extended `normalizeGeneratedImage` `generationMode` type to include `"restyling"`
  - Added `effectiveGenerationMode === "restyling"` branch before the art_variation branch
  - Restyling branch fetches both base and style_reference assets using `getAssetsByCampaign`
  - Falls back to `assets[0]` as base and `assets[1]` as style_reference if role field not yet set
  - Downloads both images from R2, creates `toFile` instances, passes array `[baseFile, styleFile]` to `openai.images.edit`
  - Logs restyling success with url/b64 indicators

## Commits

| Hash | Message |
|------|---------|
| `69237b8` | feat(15-02): add Restilização quick action card and modal (REST-01, REST-02) |
| `649d608` | feat(15-02): create POST /api/quick-tools/restyling API route (REST-03, REST-04) |
| `83b1fe6` | feat(15-02): update derivation job for restyling mode with two-image images.edit (REST-06) |

## Must-Haves Verification

| Truth | Status |
|-------|--------|
| Home screen replaces disabled reports card with 'Restilização' quick tool card | ✅ |
| Restyling modal collects name, client/brand, objective/offer, exact CTA, notes, base image, style reference image | ✅ |
| POST /api/quick-tools/restyling validates required fields, creates campaign with two assets, and triggers derivation | ✅ |
| restyling derivation job calls images.edit with two images as input | ✅ |
| User is directed to campaign gallery after restyling completion | ✅ |

## Key Files Modified/Created

| File | Changes |
|------|---------|
| `app/src/app/(dashboard)/page.tsx` | +20 lines, -8 lines (QuickActionCard onClick, RestylingModal import and usage) |
| `app/src/components/workspace/RestylingModal.tsx` | +177 lines (new file) |
| `app/src/app/api/quick-tools/restyling/route.ts` | +143 lines (new file) |
| `app/src/server/jobs/derivation.ts` | +36 lines, -3 lines (restyling branch) |
| `app/src/server/repositories/campaign.ts` | +1 line (GenerationMode type) |
| `app/src/app/api/campaigns/route.ts` | +1 line (generationMode enum) |
| `app/messages/pt-BR.json` | +18 lines (restyling translations) |
| `app/messages/en.json` | +18 lines (restyling translations) |

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Build passes |
| TypeScript check (`npx tsc --noEmit`) | ✅ No errors |
| Restyling card added to page | ✅ `t("restyling")` at line 238 |
| Route file created | ✅ `app/src/app/api/quick-tools/restyling/route.ts` |
| Derivation job updated for restyling | ✅ `effectiveGenerationMode === "restyling"` at line 272 |

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| None | — | No new security surface introduced beyond plan scope. File type validation (PNG/JPEG/WebP), file size limits (50MB), and workspace access controls are in place per T-15-04 through T-15-07 threat model. |

## Known Stubs

None — all stub patterns from the plan are implemented with real functionality.