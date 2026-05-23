# Auto-Briefing por Upload de Imagem — Implementation Plan

> **Status:** Draft  
> **Scope:** Backend API + Frontend integration + i18n + tests  
> **Backend readiness:** 100% (`src/server/ai/image-analysis.ts` ready)  
> **Estimated effort:** 1 API route + 1 hook + 1 modal + BriefingStep integration

---

## 1. Goal

Allow users to upload an existing ad creative image and have the AI automatically extract structured briefing fields from it — eliminating the manual data entry pain point.

**What gets extracted:**
- `client` / `product` — what's being advertised
- `offer` — discounts, promotions, pricing mentioned
- `ctaText` — call-to-action text and style
- `audience` — inferred from visual cues and copy
- `objective` — inferred CTA intent (buy, sign up, learn more)
- `platforms` — inferred from aspect ratio and format
- `constraints` — brand elements to preserve

**What gets extracted for style:**
- `tone` — inferred from visual personality (bold, elegant, playful)
- `constraints` — brand colors, logos, taglines to preserve

---

## 2. User Flow

```
[New Campaign Modal] or [BriefingStep]
         │
         ▼
   ┌─────────────┐
   │  "Extrair   │  ← New button
   │  de imagem" │
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Dropzone   │  ← Upload modal
   │  (PNG/JPG/  │     accepts ≤10MB
   │   WebP)     │
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Analyzing  │  ← Loading state
   │  with AI... │     ~5-8s
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Preview    │  ← Modal showing extracted
   │  & Confirm  │     fields side-by-side
   └─────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 [Apply]   [Cancel]
    │
    ▼
BriefingStep fields pre-filled
User reviews and adjusts
```

---

## 3. Backend

### 3.1 New API Route

**File:** `src/app/api/campaigns/[id]/auto-briefing/route.ts`

**POST** `/api/campaigns/:id/auto-briefing`

**Request:**
```json
{
  "imageKey": "campaigns/xxx/yyy-image.png"
}
```

**Flow:**
1. Validate workspace access (`requireWorkspaceAccess`)
2. Validate campaign exists and belongs to workspace
3. Download image buffer from R2 (`downloadBuffer(imageKey)`)
4. Call `analyzeImageContent(buffer, mimeType)` → `ContentBrief`
5. Call `analyzeImageStyle(buffer, mimeType)` → `StyleBrief` *(optional v1.1)*
6. Map AI output to `BriefingFormData` partial
7. Return structured response

**Response:**
```json
{
  "extracted": {
    "client": "Nike",
    "product": "Air Max",
    "offer": "50% off summer collection",
    "objective": "Comprar agora",
    "audience": "Mulheres 25-34, fitness enthusiasts",
    "ctaText": "Compre Agora",
    "tone": "bold",
    "platforms": ["Meta Ads"],
    "constraints": "Must preserve Nike swoosh logo, black background"
  },
  "confidence": {
    "client": 0.95,
    "offer": 0.88,
    "audience": 0.72
  }
}
```

**Error cases:**
- Image not found / not accessible → 404
- Unsupported format → 400
- Vision API failure → 500 with `autoBriefingFailed` code
- Rate limit → 429

**Credit cost:** 1 credit per analysis (reuse `spendCreditsOrApiError` with idempotency key `auto-briefing:${campaignId}:${imageKey}`)

### 3.2 No Schema Changes Required

The existing `image-analysis.ts` module already handles:
- Base64 encoding
- OpenAI Vision API calls
- JSON parsing and cleanup

---

## 4. Frontend

### 4.1 New Hook

**File:** `src/lib/hooks/use-auto-briefing.ts`

```typescript
export function useAutoBriefing(campaignId: string) {
  return useMutation({
    mutationFn: async (imageKey: string) => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/auto-briefing`, {
        method: "POST",
        body: JSON.stringify({ imageKey }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Auto-briefing failed");
      }
      return res.json() as AutoBriefingResult;
    },
  });
}
```

### 4.2 New Component: `AutoBriefingModal`

**File:** `src/components/workspace/AutoBriefingModal.tsx`

**States:**
1. **Upload** — dropzone with drag-and-drop, accepts PNG/JPG/WebP ≤10MB
2. **Analyzing** — skeleton loader with "Analisando criativo com IA..."
3. **Preview** — two-column layout:
   - Left: uploaded image thumbnail
   - Right: extracted fields with confidence badges
   - Each field has checkbox "Incluir este campo"
   - Fields with confidence < 0.7 are unchecked by default
4. **Apply** → calls `onApply(partialBriefing)` prop

**Props:**
```typescript
interface AutoBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  onApply: (data: Partial<BriefingFormData>) => void;
}
```

### 4.3 BriefingStep Integration

**File:** `src/components/workspace/BriefingStep.tsx`

Add a button in the header area (next to "Análise de Concorrência"):

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setAutoBriefingOpen(true)}
  className="gap-2"
>
  <ScanLine size={16} />
  {tBriefing("extractFromImage")}
</Button>
```

Add modal at the bottom:
```tsx
<AutoBriefingModal
  open={autoBriefingOpen}
  onOpenChange={setAutoBriefingOpen}
  campaignId={campaign.id}
  onApply={(partial) => {
    setFormData((prev) => ({ ...prev, ...partial }));
    setAutoBriefingOpen(false);
    addToast("success", tBriefing("briefingExtracted"));
  }}
/>
```

### 4.4 Upload Strategy

The modal needs to upload the image first before analysis. Two approaches:

**Option A (Recommended):** Reuse existing presign flow
1. User drops image in modal
2. Modal internally calls presign API → gets signed URL
3. Uploads directly to R2
4. Gets back `imageKey`
5. Calls auto-briefing API with `imageKey`

**Option B:** Accept direct upload in the API route
- Simpler frontend (single POST with FormData)
- But needs handling of large files in serverless function
- Less consistent with existing upload architecture

**Decision:** Use Option A for consistency with existing `UploadStep` patterns.

---

## 5. i18n

**Files:** `messages/pt-BR.json`, `messages/en.json`

New keys under `briefing` namespace:
```json
{
  "extractFromImage": "Extrair de imagem",
  "extractFromImageDesc": "Faça upload de um criativo existente para preencher o briefing automaticamente",
  "analyzingImage": "Analisando criativo com IA...",
  "analysisComplete": "Análise concluída",
  "fieldsDetected": "{{count}} campos detectados",
  "lowConfidence": "Baixa confiança",
  "mediumConfidence": "Confiança média",
  "highConfidence": "Alta confiança",
  "includeField": "Incluir",
  "applyExtracted": "Aplicar campos selecionados",
  "briefingExtracted": "Briefing preenchido automaticamente. Revise antes de continuar."
}
```

---

## 6. Tests

### 6.1 API Tests
**File:** `src/app/api/campaigns/[id]/auto-briefing/route.test.ts`

- Returns 401 without auth
- Returns 404 for non-existent campaign
- Returns 400 for unsupported image format
- Returns extracted fields on success
- Caches result (idempotency)
- Deducts 1 credit

### 6.2 Hook Tests
**File:** `src/lib/hooks/use-auto-briefing.test.ts`

- Calls correct endpoint
- Handles error responses
- Invalidates briefing data on success

### 6.3 Component Tests
**File:** `src/components/workspace/AutoBriefingModal.test.tsx`

- Renders upload state
- Shows analyzing state during mutation
- Renders preview with checkboxes
- Calls onApply with selected fields only
- Handles drag-and-drop

---

## 7. Implementation Order

| Step | Task | File(s) | Est. Time |
|---|---|---|---|
| 1 | Create API route | `src/app/api/campaigns/[id]/auto-briefing/route.ts` | 1h |
| 2 | Create useAutoBriefing hook | `src/lib/hooks/use-auto-briefing.ts` | 30min |
| 3 | Create AutoBriefingModal component | `src/components/workspace/AutoBriefingModal.tsx` | 3h |
| 4 | Integrate into BriefingStep | `src/components/workspace/BriefingStep.tsx` | 30min |
| 5 | Add i18n keys | `messages/pt-BR.json`, `messages/en.json` | 30min |
| 6 | API route tests | `src/app/api/campaigns/[id]/auto-briefing/route.test.ts` | 1h |
| 7 | Hook tests | `src/lib/hooks/use-auto-briefing.test.ts` | 30min |
| 8 | Component tests | `src/components/workspace/AutoBriefingModal.test.tsx` | 1h |
| 9 | Manual smoke test | Browser | 30min |
| 10 | Build & commit | — | 15min |

**Total: ~8.5h of focused implementation**

---

## 8. Open Questions

1. **Should we extract `audience` and `objective` from image, or only from brief?**
   - The AI can infer audience from visual cues (age, gender, style)
   - But objective might be harder to infer without context
   - **Recommendation:** Extract everything the model returns, mark low-confidence fields

2. **Should we support URL input (paste image URL) in addition to upload?**
   - Nice-to-have v1.1
   - Would require fetching external images server-side (CORS issues)
   - **Recommendation:** Skip for v1

3. **Should extracted fields trigger Briefing Doctor analysis?**
   - Yes — after applying extracted fields, the Briefing Doctor should re-run automatically
   - Already happens because `formData` changes trigger `analyzeBriefingLocal`

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vision API returns malformed JSON | Medium | The `image-analysis.ts` already has `JSON.parse` with cleanup. Add try/catch and return `autoBriefingFailed` |
| Image has no text → poor extraction | High | Show confidence scores. Allow user to skip extraction and fill manually |
| User uploads non-ad image | Medium | Accept anything. The AI will return generic results. User decides to apply or not |
| Credit abuse (re-analyzing same image) | Low | Idempotency key prevents double-charging |

---

## 10. Success Criteria

1. User can upload an image from BriefingStep
2. AI extracts at least 4 fields with >80% accuracy on typical ad creatives
3. User can selectively apply extracted fields
4. Build passes, tests pass
5. No regression in BriefingStep functionality
