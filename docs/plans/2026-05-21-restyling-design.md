# Restyling Tool — Dedicated Page Design

## Overview

Add a **dedicated restyling page** at `/restyling` that lets users upload a base image and a style reference image, fill a brief form, and generate AI-powered restyled derivations using `openai.images.edit`. The tool uses existing infrastructure (campaigns, assets, derivations, Inngest jobs) with a focused UI.

## User Experience

### Flow

1. User navigates to `/restyling`
2. User fills: name, client (optional), offer (optional), CTA text (optional)
3. User selects style intensity: Soft / Medium / Strong
4. User uploads **Base Image** via drag & drop
5. User uploads **Style Reference Image** via drag & drop
6. User clicks "Gerar Derivation"
7. System creates campaign + assets + derivation, dispatches Inngest job
8. User is redirected to `/campaigns/[id]` for review

### Existing Reused Components

- `openai.images.edit` call at `jobs/derivation.ts:326` — already handles restyling mode
- `buildDerivationPrompt` with `generationMode="restyling"` at `prompt-builder.ts:288`
- Credit gate cost: `restyling: 5` at `credits.ts:15`
- `parseStyleIntensity` utility for parsing intensity from form input

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `app/src/app/(dashboard)/restyling/page.tsx` | Main page |
| `app/src/components/restyling/RestylingUpload.tsx` | Drag & drop upload zone for each image |
| `app/src/components/restyling/RestylingForm.tsx` | Form fields and intensity selector |
| `app/src/app/api/restyling/route.ts` | POST endpoint |

### Modified Files

| File | Change |
|------|--------|
| `app/src/components/layout/Sidebar.tsx` | Add "Restyling" nav item |
| `app/src/messages/pt-BR.json` | Add translations |
| `app/src/messages/en.json` | Add translations |

---

## API Design

### POST /api/restyling

**Request:** `Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Campaign name |
| `client` | string | No | Client name |
| `offer` | string | No | Offer text |
| `ctaText` | string | No | CTA text to preserve |
| `styleIntensity` | string | Yes | `soft` \| `medium` \| `strong` |
| `baseImage` | File | Yes | Base image (PNG/JPEG/WebP, max 50MB) |
| `styleImage` | File | Yes | Style reference image (PNG/JPEG/WebP, max 50MB) |

**Response:** `201 Created`

```json
{
  "campaignId": "uuid",
  "derivationId": "uuid",
  "redirectUrl": "/campaigns/[id]"
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `invalidInput` | Missing name or images |
| 400 | `invalidFileType` | Non-image file uploaded |
| 400 | `fileTooLarge` | File > 50MB |
| 402 | `insufficientCredits` | No credits available |
| 500 | `internalError` | Job dispatch failure |

**Process:**
1. Validate inputs
2. Spend credits via `spendCreditsOrApiError`
3. Upload both images to R2
4. Create `campaign` with `generationMode: "restyling"`
5. Create two `asset` records: `base` and `style_reference`
6. Create `derivation` with status `queued`
7. Dispatch `inngest.send({ name: "derivation.generate", ... })`
8. Return redirect URL

**Compensating transaction on failure:** Delete uploaded R2 objects and campaign record.

---

## UI Components

### RestylingUpload

Props: `label`, `accept`, `value: File | null`, `onChange: (file: File) => void`, `error?: string`

**States:**
- Default: dashed border, icon, "Drag & drop or click"
- Drag over: highlighted border, "Drop here"
- File selected: thumbnail preview, filename, size, remove (X) button
- Error: red border, error message below

**Validation:** MIME type check (image/png, image/jpeg, image/webp), max 50MB.

### RestylingForm

Collects: `name`, `client`, `offer`, `ctaText`, `styleIntensity`.

**Style Intensity Selector:** Three radio buttons — Soft / Medium / Strong — styled as pill toggle.

### RestylingPage

Layout:
```
[Sidebar] | [Main Content]
           | Header: "Restyling"
           | Breadcrumb: Home > Restyling
           |
           | [RestylingUpload - Base Image]
           | [RestylingUpload - Style Reference]
           | [RestylingForm - name, client, offer, ctaText, intensity]
           | [Actions - Cancel, "Gerar Derivation"]
```

On submit: disable form, show loading on button, POST to `/api/restyling`, redirect on success.

On error: show toast, re-enable form.

---

## Sidebar Navigation

Add to `workspaceNavItems` in `Sidebar.tsx`:

```typescript
{ icon: Sparkles, label: tNav("restyling"), href: "/restyling" }
```

Icon: `Sparkles` from lucide-react.

---

## Translations

### PT-BR (`pt-BR.json`)

```json
{
  "navigation": {
    "restyling": "Restyling"
  },
  "restyling": {
    "title": "Restyling",
    "subtitle": "Aplique o estilo de uma imagem de referência ao seu creative base",
    "baseImage": "Imagem Base",
    "baseImageDescription": "O creative original com o conteúdo a preservar",
    "styleImage": "Referência de Estilo",
    "styleImageDescription": "Imagem com o estilo visual a aplicar",
    "formTitle": "Briefing",
    "name": "Nome da campanha",
    "namePlaceholder": "Ex: Black Friday - Restyling",
    "client": "Cliente",
    "clientPlaceholder": "Nome do cliente",
    "offer": "Oferta",
    "offerPlaceholder": "Oferta principal",
    "ctaText": "Texto do CTA",
    "ctaTextPlaceholder": "Texto da chamada para ação",
    "styleIntensity": "Intensidade do estilo",
    "intensitySoft": "Suave",
    "intensityMedium": "Médio",
    "intensityStrong": "Forte",
    "intensitySoftDesc": "Mantém o conteúdo original com ajustes sutis",
    "intensityMediumDesc": "Equilíbrio entre conteúdo e novo estilo",
    "intensityStrongDesc": "Transformação visual intensa",
    "generate": "Gerar Derivation",
    "generating": "Gerando...",
    "cancel": "Cancelar",
    "dragDropBase": "Arraste a imagem base ou clique para selecionar",
    "dragDropStyle": "Arraste a imagem de estilo ou clique para selecionar",
    "onlyImages": "Apenas PNG, JPEG ou WebP",
    "maxSize": "Máx 50MB",
    "errors": {
      "nameRequired": "Nome é obrigatório",
      "baseImageRequired": "Imagem base é obrigatória",
      "styleImageRequired": "Imagem de estilo é obrigatória",
      "invalidFileType": "Tipo de arquivo inválido",
      "fileTooLarge": "Arquivo grande demais"
    }
  }
}
```

### EN (`en.json`)

```json
{
  "navigation": {
    "restyling": "Restyling"
  },
  "restyling": {
    "title": "Restyling",
    "subtitle": "Apply a reference image's visual style to your base creative",
    "baseImage": "Base Image",
    "baseImageDescription": "The original creative with content to preserve",
    "styleImage": "Style Reference",
    "styleImageDescription": "Image with the visual style to apply",
    "formTitle": "Briefing",
    "name": "Campaign name",
    "namePlaceholder": "Ex: Black Friday - Restyling",
    "client": "Client",
    "clientPlaceholder": "Client name",
    "offer": "Offer",
    "offerPlaceholder": "Main offer",
    "ctaText": "CTA Text",
    "ctaTextPlaceholder": "Call to action text",
    "styleIntensity": "Style intensity",
    "intensitySoft": "Soft",
    "intensityMedium": "Medium",
    "intensityStrong": "Strong",
    "intensitySoftDesc": "Preserves original content with subtle adjustments",
    "intensityMediumDesc": "Balance between content and new style",
    "intensityStrongDesc": "Intense visual transformation",
    "generate": "Generate Derivation",
    "generating": "Generating...",
    "cancel": "Cancel",
    "dragDropBase": "Drag base image or click to select",
    "dragDropStyle": "Drag style image or click to select",
    "onlyImages": "PNG, JPEG or WebP only",
    "maxSize": "Max 50MB",
    "errors": {
      "nameRequired": "Name is required",
      "baseImageRequired": "Base image is required",
      "styleImageRequired": "Style image is required",
      "invalidFileType": "Invalid file type",
      "fileTooLarge": "File too large"
    }
  }
}
```

---

## Data Model

No new tables. Reuses:

- `campaigns` with `generationMode: "restyling"`, `creativeLevel: "balanced"`, `styleIntensity: "soft|medium|strong"`
- `assets` with roles `base` and `style_reference`
- `derivations` with `status: "queued"`, `generationMode: "restyling"`, `format: "1:1"`

Output always 1:1 format (1080x1080).

---

## Redirect Flow

On success, POST returns `{ redirectUrl: "/campaigns/[id]" }`. Client does:

```typescript
router.push(result.redirectUrl);
```

The campaign detail page shows the derivation in review mode with regenerate → score → QA → approve/reject flow already implemented.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid file type | Toast with `restyling.errors.invalidFileType` |
| File > 50MB | Toast with `restyling.errors.fileTooLarge` |
| Missing name | Inline form error on name field |
| Missing base/style image | Inline form error on respective upload zone |
| Insufficient credits | Toast with link to Settings |
| API error | Generic error toast |

---

## Test Coverage

1. **Unit: RestylingUpload** — render states (empty, drag, file selected, error)
2. **Unit: RestylingForm** — intensity selector, validation
3. **Integration: POST /api/restyling** — creates campaign + 2 assets + derivation + Inngest event
4. **Integration: Error flows** — missing fields, invalid file type, file too large, insufficient credits