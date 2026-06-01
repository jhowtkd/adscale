# Phase 44 — Real Visual UAT Evidence

**Phase:** 44-native-format-adaptation  
**Plan:** 02  
**Date:** 2026-06-01  
**Status:** complete — awaiting human visual approval

---

## Task 1 — UAT Target

### Campaign

| Field | Value |
|-------|-------|
| Campaign ID | `fd018597-f2c8-49f5-86d9-7ca82267605c` |
| Campaign name | Teste 4 |
| Workspace ID | `a4624b8c-6f5a-4d85-badf-322d3cc7b52b` |
| Client | Teste |
| Objective | Conversão (captação de inscrições/matrículas) |
| Audience | Professores, educadores e profissionais da área de educação interessados em especialização em alfabetização e letramento |

This is the **original complaint campaign** (`fd018597-f2c8-49f5-86d9-7ca82267605c`) — the same one that produced the "faixas" (blurred bands) bug. Accessible via the dev database.

### Base Asset

| Field | Value |
|-------|-------|
| Asset ID | `0c87205c-d7f6-4915-ab4b-ec5c4ae0b2e0` |
| Asset key | `campaigns/fd018597-f2c8-49f5-86d9-7ca82267605c/5d82a229-de80-4c81-9e2a-560268e209c9-WhatsApp_Image_2026-05-24_at_14.41.06__5_.jpeg` |
| Role | `base` |
| Type | `image/jpeg` |

### Target Formats

- `4:5` — Portrait feed (1080×1350 final)
- `9:16` — Stories/Reels (1080×1920 final)

### UAT Path

**Direct job trigger via Inngest dev server.** A Node.js script (`tmp/phase-44-format-uat/generate-uat.mjs`) inserted derivation rows in the database and POST-ed `derivation.generate` events to `http://localhost:8288/e/local` (Inngest dev server). The real derivation job ran against the live OpenAI API using `gpt-image-2` — the same code path as production, exercising all Plan 44-01 fixes.

---

## Task 2 — Generation Results

Both derivations completed successfully.

### 4:5 Format Adaptation

| Field | Value |
|-------|-------|
| Derivation ID | `bb4da8fe-a9e3-401e-a42f-6067275e3cdb` |
| Status | `completed` |
| Output key | `derivations/bb4da8fe-a9e3-401e-a42f-6067275e3cdb/1780331888727.png` |
| R2 public URL | `https://pub-b6f51a073b12476e9f0875b18dda4f89.r2.dev/derivations/bb4da8fe-a9e3-401e-a42f-6067275e3cdb/1780331888727.png` |
| Generation size (gpt-image-2) | `1024x1280` (native 4:5 aspect) |
| Normalized output dimensions | **1080×1350** ✓ |
| Local path | `tmp/phase-44-format-uat/derivation-4-5.png` |

### 9:16 Format Adaptation

| Field | Value |
|-------|-------|
| Derivation ID | `e9029139-4099-45ed-99cf-5955097ee8f1` |
| Status | `completed` |
| Output key | `derivations/e9029139-4099-45ed-99cf-5955097ee8f1/1780331955069.png` |
| R2 public URL | `https://pub-b6f51a073b12476e9f0875b18dda4f89.r2.dev/derivations/e9029139-4099-45ed-99cf-5955097ee8f1/1780331955069.png` |
| Generation size (gpt-image-2) | `1152x2048` (native 9:16 aspect) |
| Normalized output dimensions | **1080×1920** ✓ |
| Local path | `tmp/phase-44-format-uat/derivation-9-16.png` |

### Contact Sheet

- **Path:** `tmp/phase-44-format-uat/contact-sheet.png`
- **Dimensions:** 1859×1410 (both formats side-by-side at equal height)

---

## Task 3 — Visual Verdicts

### 4:5 Portrait Feed

**4:5 verdict: `accepted`**

Visual criteria applied (from 44-CONTEXT.md):

| Criterion | Result |
|-----------|--------|
| No blurred side/top/bottom bands | ✓ PASS — no bands visible |
| No pasted square poster in center | ✓ PASS — native portrait layout, not a framed square |
| No crowded text/photo/CTA/logo cluster | ✓ PASS — elements have clear breathing room |
| Portrait-feed spacing | ✓ PASS — content fills the tall canvas naturally |
| Critical facts inside safe areas | ✓ PASS — headline, R$9,90, +80%, CTA, logo all readable |
| No critical crop | ✓ PASS — all factual modules visible |

**Description:** The 4:5 output shows a native portrait ad layout for FASEC's "Transferência" campaign. It has a torn-paper info panel at the top (headline "Transferência FASEC / Administração" + pricing "Matrícula por apenas R$9,90"), the FASEC mascot/3D billboard element in the center-lower area, a "+80%" proof block to the right, a "QUERO TRANSFERIR" CTA pill near the bottom, and the FASEC logo at the very bottom. The canvas is used as a portrait creative, not as a padded square.

### 9:16 Story/Reels

**9:16 verdict: `accepted`**

Visual criteria applied (from 44-CONTEXT.md):

| Criterion | Result |
|-----------|--------|
| No blurred side/top/bottom bands | ✓ PASS — no bands visible |
| No pasted square poster in center | ✓ PASS — native vertical layout, not a centered square |
| Clear vertical zones (top/middle/lower) | ✓ PASS — header zone (info panel), middle zone (billboard visual), lower zone (proof + CTA + logo) |
| Important content inside safe areas | ✓ PASS — headline, pricing, CTA, logo all within safe central areas |
| No critical crop | ✓ PASS — all factual modules visible |

**Description:** The 9:16 output uses the full vertical canvas intentionally. Top zone: torn-paper info panel with headline and pricing. Middle zone: FASEC 3D billboard with mascot (significantly more breathing room than the 4:5 — the tall canvas allows the visual to breathe). Lower zone: "+80%" proof pill, "QUERO TRANSFERIR" CTA, FASEC logo. The tall canvas is not wasted — the layout redistributes elements into distinct vertical sections rather than centering the square composition.

### Comparison to Pre-Fix Behavior

The original complaint reported "faixas" (blurred bands/letterboxing) when using **Variar tamanho**. Both outputs are free of that artifact. The Plan 44-01 changes that produced these results:
- `formatToOpenAIImageSize` now returns `1024x1280` (4:5) and `1152x2048` (9:16) for gpt-image-2, so the model generates at the native target aspect rather than square-then-letterbox.
- `normalizeGeneratedImage` for `format_adaptation` uses `cover` resize (not the blur+contain+composite used for other modes), so there is no post-processing letterboxing step.

---

## UAT Sign-Off

- [x] Campaign and base asset identified — original complaint campaign `fd018597-f2c8-49f5-86d9-7ca82267605c`
- [x] Real 4:5 derivation completed — `bb4da8fe-a9e3-401e-a42f-6067275e3cdb`
- [x] Real 9:16 derivation completed — `e9029139-4099-45ed-99cf-5955097ee8f1`
- [x] Correct final dimensions confirmed — 1080×1350 and 1080×1920
- [x] Contact sheet created — `tmp/phase-44-format-uat/contact-sheet.png`
- [x] 4:5 verdict: **accepted** (no blurred bands, no pasted poster, no crowded clusters)
- [x] 9:16 verdict: **accepted** (no blurred bands, clear vertical zones, no critical crop)
- [ ] **Human visual approval** — awaiting checkpoint response

---

## Residual Risk

- The verdict is based on a single generation per format. Model outputs are non-deterministic; a second run might produce a less ideal result. Phase 46 quality-gate scoring and regeneration loop will address this.
- The campaign asset is a style_reference-heavy campaign (no explicit product photo in this run). Different campaign types (product-centric, text-heavy) should be tested in future UAT cycles.
- Legal/disclaimer text ("*Consulte o regulamento") is rendered vertically on the left edge — technically readable but may be too small for some safe-area guidelines. Not a hard failure per Phase 44 criteria.
