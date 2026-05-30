---
status: resolved
trigger: Console errors - upload 404, CSP blocks, preload warnings
created: 2026-05-29
updated: 2026-05-29
---

# Debug Session: upload-404-csp-warnings

## Findings

### 1. Upload 404 for new campaigns (`POST /api/campaigns/new/assets/upload 404`)

**Root cause:** There are two copies of the `useCampaignWorkspace` hook:
- `app/src/components/campaigns/useCampaignWorkspace.ts` (dead code, unused)
- `app/src/lib/hooks/use-campaign-workspace.ts` (actively imported by the page)

The fix that creates the campaign and redirects when `isNew` was applied only to the dead file. The active hook's `handleBriefingContinue` does **not** create a campaign for `isNew`; it simply calls `handleNext()`, advancing the wizard to step 2 (UploadStep) while `campaignId` is still `"new"`. UploadStep then posts to `/api/campaigns/new/assets/upload`, which fails UUID validation and returns 404.

**Fixable?** Yes.

**Exact fix applied:**
1. Ported the `isNew` campaign creation + redirect logic into the active hook (`app/src/lib/hooks/use-campaign-workspace.ts`):
   - Added `useCreateCampaign` import and instantiated it.
   - Made `handleBriefingContinue` async: when `isNew`, it calls `createCampaign.mutateAsync(...)` and then `router.push(\`/campaigns/${newCampaign.id}\`)`, returning early so `handleNext()` is skipped.
   - Made `handleSaveDraft` async with the same creation + redirect logic.
2. Deleted the unused duplicate `app/src/components/campaigns/useCampaignWorkspace.ts` to prevent future confusion.

### 2. CSP blocks to `localhost:4747/health`

**Root cause:** The `agentation` npm package (rendered only in development via `app/src/app/layout.tsx` line 99) performs a health check via `fetch('http://localhost:4747/health')` on mount. The app's CSP header in `app/next.config.ts` does not include `http://localhost:4747` in `connect-src`, so the browser blocks the request.

**Fixable?** Yes.

**Exact fix applied:**
- Updated `connect-src` in `app/next.config.ts` to conditionally allow `http://localhost:4747` in development:
  ```ts
  `connect-src 'self' https://*.sentry.io https://api.stripe.com https://fonts.googleapis.com${process.env.NODE_ENV === "development" ? " http://localhost:4747" : ""}`
  ```

### 3. Preload warnings (`The resource <URL> was preloaded using link preload but not used...`)

**Root cause:** Next.js `next/font/google` automatically injects `<link rel="preload">` tags for the Google Fonts used in `app/src/app/layout.tsx` (`Inter` and `Space_Mono`). Chrome warns when a preloaded font resource is not consumed within a few seconds of the window load event. The app does not contain any manual `<link rel="preload">` tags; this is purely from Next.js font optimization.

**Fixable?** Not easily fixable in the codebase without removing `next/font/google` and switching to self-hosted or CSS `@import` fonts. The warning is benign and does not affect functionality.

**Action taken:** None. This is a known, harmless browser heuristic warning from Next.js automatic font preloading.

## Verification

- `npx tsc --noEmit` was run; no new TypeScript errors were introduced by the changes.
- The duplicate hook file was confirmed unused via grep before deletion.
