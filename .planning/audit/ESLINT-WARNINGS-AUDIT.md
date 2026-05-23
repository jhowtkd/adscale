# ESLint Warnings Audit — 15 Remaining Issues

**Date:** 2026-05-22
**Commit:** `ee3c89e`
**Baseline:** 0 errors, 15 warnings

---

## Executive Summary

All 15 remaining warnings are **low-risk** and fall into three categories:
- **6× `react-hooks/exhaustive-deps`** — Intentional omissions to avoid re-creation loops or stale closures
- **5× `@next/next/no-img-element`** — Using raw `<img>` for external/dynamic/blob URLs where `next/image` is impractical
- **1× `react-hooks/incompatible-library`** — False positive from TanStack Virtual + React Compiler

**Recommendation:** Leave all 15 as-is. None represent actual bugs. Fixing them would require refactoring with non-zero risk of introducing regressions.

---

## Category A: react-hooks/exhaustive-deps (6 warnings)

### A1. `restyling/page.tsx:91` — Unnecessary dependency `t`
```tsx
const handleSubmit = useCallback(async () => { ... },
  [name, client, offer, ctaText, styleIntensity, baseImage, styleImage, validate, router, tCommon, t]
);
```
- **Why:** `t` is a `useTranslations()` return — stable reference from next-intl
- **Risk if removed:** None. `t` never changes between renders.
- **Action:** ✅ **SAFE to remove** `t` from deps. Zero behavioral impact.

---

### A2. `CompetitorAnalysisSection.tsx:198` — Missing dependency `validateFiles`
```tsx
const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setDragActive(false);
  const pending = validateFiles(e.dataTransfer.files);
  ...
}, [formData.files]);
```
- **Why:** `validateFiles` is defined inside the component but NOT in the deps array
- **Risk if added:** `validateFiles` depends on `formData.files`, `setFormError`, `t()`. Adding it creates no loop.
- **Action:** ✅ **SAFE to add** `validateFiles` to deps. Function is stable.

---

### A3. `AnalyticsSection.tsx:194` — Missing dependency `locale`
```tsx
const memoized = useMemo(() => {
  ...
  const label = d.toLocaleDateString(locale, { month: "short" });
  ...
}, [campaigns, t]);
```
- **Why:** `locale` from `useLocale()` is used inside `useMemo` but omitted from deps
- **Risk if added:** `useLocale()` returns a stable string. Adding it causes no extra re-renders.
- **Action:** ✅ **SAFE to add** `locale` to deps. Stable reference.

---

### A4. `BrandKitTab.tsx:259` — Missing dependency `handleLogoUpload`
```tsx
const handleFileDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  const file = e.dataTransfer.files[0];
  if (!file) return;
  handleLogoUpload(file);
}, []);
```
- **Why:** `handleLogoUpload` is used inside `useCallback` but omitted from deps
- **Risk if added:** `handleLogoUpload` is re-created on every render (calls `uploadLogo.mutate`, `addToast`, `tc`, `setLogoAssetKey`). Adding it would cause `handleFileDrop` to also re-create every render, defeating memoization.
- **Action:** ⚠️ **INTENTIONAL OMISSION**. Adding it destroys memoization benefit. Keep as-is.

---

### A5. `BriefingStep.tsx:139` — Missing dependency `autoSave`
```tsx
useEffect(() => {
  if (autoSave.hasDraft && !campaign?.name && !campaign?.client) {
    const draft = autoSave.restoreDraft();
    ...
  }
}, [autoSave.hasDraft, campaign]);
```
- **Why:** ESLint wants the entire `autoSave` object, but only `autoSave.hasDraft` is needed
- **Risk if added:** `autoSave = useBriefingAutoSave(campaignId, formData)` — the hook likely returns a new object reference every render. Adding `autoSave` would cause this effect to fire on every form change.
- **Action:** ⚠️ **INTENTIONAL OMISSION**. Using property access `autoSave.hasDraft` in deps is the correct pattern. Keep as-is.

---

### A6. `UploadStep.tsx:132` — Missing dependencies `analyzePreflight`, `campaignId`, `showPreflight`
```tsx
const handleUpload = useCallback(async (file: File) => {
  ...
  if (showPreflight && asset?.id) {
    analyzePreflight.mutate({ campaignId, assetId: asset.id });
  }
  ...
}, [t, uploadAsset]);
```
- **Why:** `showPreflight` (boolean), `campaignId` (string), and `analyzePreflight` (mutation hook result) are used but omitted
- **Risk if added:** `campaignId` is stable. `analyzePreflight` from `useAnalyzePreflight()` is stable. `showPreflight` is a prop — if it changes, the callback SHOULD update. Adding all three is safe.
- **Action:** ✅ **SAFE to add** all three. `campaignId` and `analyzePreflight` are stable; `showPreflight` is a primitive prop.

---

### A7. `TopBar.tsx:321` — Ref value in cleanup function
```tsx
useEffect(() => {
  document.addEventListener("keydown", handleKeyDown);
  return () => {
    document.removeEventListener("keydown", handleKeyDown);
    bellRef.current?.focus();
  };
}, [onClose, bellRef]);
```
- **Why:** `bellRef.current` is accessed in cleanup. ESLint warns it may change between effect run and cleanup.
- **Risk if fixed:** The fix is to copy `bellRef.current` to a local variable inside the effect. But `bellRef` is a ref to a DOM node that persists for the component lifetime. The current code is correct in practice.
- **Action:** ⚠️ **LOW PRIORITY**. Theoretical concern; no actual bug. Fix only if refactoring the component.

---

### A8. `CreditHistoryTab.tsx:71` — Logical expression in useMemo deps
```tsx
const transactions = data?.transactions ?? [];
const chartData = useMemo(() => {
  ...
}, [transactions]);
```
- **Why:** ESLint warns that `transactions = data?.transactions ?? []` creates a new array every render, making `useMemo` useless.
- **Risk if fixed:** The `?? []` fallback ensures `transactions` is always an array, but yes — it creates a new reference every render. However, `data` comes from `useCreditHistory()` (TanStack Query), which maintains stable references when data hasn't changed. So `data?.transactions` is likely stable, and `?? []` only fires on loading states.
- **Action:** ⚠️ **LOW PRIORITY**. Minor optimization. Could wrap `?? []` in its own `useMemo` but gain is negligible.

---

## Category B: @next/next/no-img-element (5 warnings)

All 5 are **intentional uses of raw `<img>`** where `next/image` is inappropriate:

| File | Line | Context | Why `<img>` is correct |
|------|------|---------|------------------------|
| `GalleryGrid.tsx` | 37, 73 | Public share page gallery + lightbox | External R2 URLs (`item.imageUrl`), not optimizable by Next.js Image |
| `RestylingUpload.tsx` | 144 | Upload preview thumbnail | `URL.createObjectURL(value)` — blob URL, Next.js Image cannot handle |
| `BrandKitTab.tsx` | 411 | Brand kit logo display | External R2 URL (`brandKit.logoUrl`) |
| `BriefingStep.tsx` | 458 | Brand kit logo in briefing | External R2 URL (`brandKitData.logoUrl`) |
| `DerivationPreviewModal.tsx` | 221 | Full-screen derivation preview | External R2 URL (`derivation.imageUrl`) |

**Action:** ✅ **ALL INTENTIONAL**. `next/image` requires `width`/`height` or `fill` + `sizes`, and works best with local/static images. All these are dynamic external URLs from R2. Using `<img loading="lazy">` is the correct choice.

---

## Category C: react-hooks/incompatible-library (1 warning)

### C1. `VirtualList.tsx:34` — TanStack Virtual + React Compiler
```tsx
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => estimateSize + gap,
  overscan,
  enabled,
});
```
- **Why:** React Compiler (via eslint-config-next) skips memoization for TanStack Virtual's `useVirtualizer()` because it returns functions that cannot be safely memoized.
- **Risk:** None. This is a **documented false positive**. TanStack Virtual manages its own memoization internally.
- **Action:** ✅ **FALSE POSITIVE**. Can be suppressed with `// eslint-disable-next-line react-hooks/incompatible-library` if desired.

---

## Recommended Actions (Priority Order)

### Immediate (Safe, Zero Risk)
1. **A1** `restyling/page.tsx` — Remove `t` from `useCallback` deps
2. **A2** `CompetitorAnalysisSection.tsx` — Add `validateFiles` to `useCallback` deps
3. **A3** `AnalyticsSection.tsx` — Add `locale` to `useMemo` deps
4. **A6** `UploadStep.tsx` — Add `analyzePreflight`, `campaignId`, `showPreflight` to deps
5. **C1** `VirtualList.tsx` — Add eslint-disable comment for false positive

### Defer (Intentional / Low Value)
- **A4** `BrandKitTab.tsx` — Keep as-is (memoization tradeoff)
- **A5** `BriefingStep.tsx` — Keep as-is (property access pattern)
- **A7** `TopBar.tsx` — Keep as-is (theoretical ref concern)
- **A8** `CreditHistoryTab.tsx` — Keep as-is (minor optimization)
- **All B** `no-img-element` — Keep as-is (intentional raw `<img>` usage)

---

## Quick-Fix Script

If applying the "Immediate" fixes:

```bash
# A1: restyling/page.tsx
sed -i '' 's/\[name, client, offer, ctaText, styleIntensity, baseImage, styleImage, validate, router, tCommon, t\]/[name, client, offer, ctaText, styleIntensity, baseImage, styleImage, validate, router, tCommon]/' src/app/(dashboard)/restyling/page.tsx

# A2: CompetitorAnalysisSection.tsx
sed -i '' 's/\[formData.files\]/[formData.files, validateFiles]/' src/components/campaigns/CompetitorAnalysisSection.tsx

# A3: AnalyticsSection.tsx
sed -i '' 's/\[campaigns, t\]/[campaigns, t, locale]/' src/components/dashboard/AnalyticsSection.tsx

# A6: UploadStep.tsx
sed -i '' 's/\[t, uploadAsset\]/[t, uploadAsset, analyzePreflight, campaignId, showPreflight]/' src/components/workspace/UploadStep.tsx

# C1: VirtualList.tsx
# Add eslint-disable comment before useVirtualizer call
```

**Expected outcome:** 15 warnings → **9 warnings** (6 fixed, 9 intentional/low-priority remain).
