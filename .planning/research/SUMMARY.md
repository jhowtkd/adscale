# v5.0 Research Summary

**Simplificação do Fluxo de Criação de Campanha**

*Synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*

---

## 1. Stack Additions/Changes Needed

**Zero new dependencies.** v5.0 is achievable entirely with the existing stack.

| Layer | Current | v5.0 Change |
|-------|---------|-------------|
| AI Vision | `gpt-5-mini` (text only) | Same model — already supports image input via `ChatCompletionContentPartImage` |
| UI | shadcn/ui + React Hook Form | Refactor, no additions |
| State | Zustand + TanStack Query | Refactor, no additions |
| Database | Neon PostgreSQL + Drizzle | Optional: `ai_deduced_fields` jsonb column |

**Key insight:** `gpt-5-mini` natively supports vision. Pass uploaded creative as base64 or R2 presigned URL in chat messages with `type: "image_url"`. No separate vision model needed.

**API Changes:**
- **New:** `POST /api/campaigns/[id]/analyze` — vision analysis endpoint
- **Modified:** `POST /api/campaigns` — simplified schema (name, client, profile only)
- **Deprecated:** `POST /api/campaigns/[id]/auto-briefing` — superseded by analyze endpoint
- **Removed:** Briefing Doctor routes, hooks, and UI

---

## 2. Feature Table Stakes vs Differentiators

### Table Stakes (Must Have)

| Feature | Description |
|---------|-------------|
| Drag-and-drop upload | PNG/JPEG/WebP with validation (reuse UPLOAD-01/02/03) |
| Non-blocking AI analysis | Upload completes first; analysis runs async with skeleton loader |
| Editable AI fields | Zero fields locked; user has final authority on all data |
| Graceful degradation | If vision API fails, form loads empty (not broken); user proceeds manually |
| Preserve campaign lifecycle | Draft → plan → derivations → complete state machine unchanged |
| i18n continuity | All strings via next-intl; AI prompts respect user locale |
| Workspace isolation | Analyze endpoint validates workspace membership (SEC-01) |
| Privacy disclosure | Note OpenAI image processing in privacy policy (LGPD compliance) |

### Differentiators (Nice to Have)

| Feature | Complexity | Priority |
|---------|-----------|----------|
| Multi-image analysis (2-3 creatives, compare patterns) | Medium | Defer |
| Visual similarity scoring (derivation vs original match score) | High | Defer |
| Smart CTA suggestions (3-5 variants by industry norms) | Medium | v5.1 |
| Brand kit extraction (hex codes, fonts, logo crop) | Medium-High | Defer |
| Historical campaign suggestion (pull style from past campaigns) | Low-Medium | v5.1 |
| Per-field confidence visualization | Low | v5.1 |
| Batch campaign creation | High | Defer |

---

## 3. Architecture Integration Points

### Reuse Existing Infrastructure

| Existing Component | How It's Reused |
|--------------------|-----------------|
| `/server/ai/image-analysis.ts` | Enhance `analyzeImageContent()` with "campaign dedução completa" prompt variant |
| `campaign_assets` table | `analysisStatus`, `analyzedAt`, `metadata` columns already exist — store AI results in `metadata.analysisResult` |
| `campaigns` table | No schema migration needed; fields shift from creation-time to analysis-time population |
| Upload flow (UPLOAD-01/02/03) | Upload becomes mandatory trigger for AI analysis |
| Plan generation (`POST /api/campaigns/[id]/plan`) | Unchanged; inputs may be AI-deduced instead of manual |
| Derivation generation (`POST /api/campaigns/[id]/derivations`) | Unchanged; reads `generationMode`, `creativeLevel` from campaign record (set later) |

### New Components

**Backend:**
- `/server/ai/campaign-deduction.ts` — enhanced OpenAI vision prompt + Zod schema
- `/server/validation/ai-deduction.ts` — Zod schema for AI-deduced fields
- `/api/campaigns/[id]/analyze/route.ts` — analysis endpoint with confidence scoring

**Frontend:**
- `SimplifiedBriefingForm` — name, client, profile only
- `CreativeUploadWithAnalysis` — upload zone + analysis trigger + progress
- `AIDeducedFieldsEditor` — editable AI fields with confidence indicators
- `GenerationModeConfig` — moved from BriefingStep: mode, creativity, CTAs, formats

### Data Flow (v5.0)

```
Create Campaign (name, client, profile)
    → Upload key creative (triggers AI analysis)
    → AI returns deduced fields (product, objective, audience, tone, offer, platforms)
    → User reviews/edits deduced fields
    → Proceed to generation mode (configure mode, creativity, CTAs, formats)
    → Save generation settings via PATCH
    → Plan generation → Derivations (same as v4)
```

---

## 4. Key Pitfalls to Watch Out For

### Critical Risks

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **AI hallucination** | Incorrect campaign data → irrelevant derivations | All fields editable; never persist without user confirmation; confidence scoring |
| **API chaining failures** | Upload succeeds but analysis hangs; form empty | Decouple upload from analysis; allow manual entry; never block core flow |
| **Prompt injection via images** | Malicious images hijack analysis | Zod strict validation; never include raw analysis in downstream prompts; content moderation |
| **Race conditions** | AI overwrites user manual input | Never auto-fill focused/non-empty fields; explicit "Apply Suggestions" button |
| **Schema drift** | AI returns unexpected fields or types | Adapter layer between AI output and form; strict Zod validation; log mismatches |
| **Breaking API contracts** | Mobile apps/integrations break | Backward-compatible payloads; deprecate with sunset timeline; clear migration docs |
| **Cost explosion** | Large images multiply vision API costs | Resize to ~512px before API; cache by perceptual hash; per-workspace quotas |

### UX/Trust Risks

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **Overwhelming single-page form** | Cognitive overload; abandonment | Progressive disclosure; 3 core fields + expandable AI suggestions; clear visual hierarchy |
| **Feature grief (Briefing Doctor removal)** | Power user churn; support spike | Sunset period (30 days); analytics audit first; communicate "why" before "what changed" |
| **Moved features invisible** | Users think creativity profile is gone | Temporary "Moved to Generation Mode" banners; update all guidance; release notes mapping |
| **"Creepy" factor** | Privacy concerns; distrust | Explain analysis method (colors, text, layout); transparency toggle; never suggest implausible data |

---

## 5. Overall Risk Assessment

| Category | Level | Rationale |
|----------|-------|-----------|
| **Technical Risk** | Low-Medium | Zero new dependencies; existing AI infrastructure reused; no DB schema changes. Main risk: OpenAI vision reliability with diverse creatives (heavily designed ads, unusual compositions). |
| **UX Risk** | Medium | Single-page form can overwhelm if not progressively disclosed. AI suggestions add cognitive burden. Briefing Doctor removal risks power user churn. |
| **Integration Risk** | Low | Backward compatible: all existing fields remain in campaigns table; PATCH endpoint unchanged; plan/derivation logic untouched. |
| **Cost Risk** | Low | ~$0.0008 per image analysis (negligible). Guard with image resizing + caching. |
| **Schedule Risk** | Low-Medium | Critical path: ~8-12 days focused development. AI analysis endpoint is the riskiest piece (external API + prompt engineering). |

**Biggest Risk:** OpenAI vision model reliability with creative images. Plan for extensive prompt engineering with few-shot examples, graceful degradation, and user testing across diverse creative types.

---

## 6. Recommended Build Order

### Phase 1: Foundation (Backend) — Days 1-4
1. **Create `/server/ai/campaign-deduction.ts`** — enhanced vision prompt + Zod schema + confidence scoring
2. **Create `/api/campaigns/[id]/analyze` route** — download image from R2, call AI, store result in asset metadata
3. **Update `POST /api/campaigns`** — simplify schema to name, client, clientProfileId only

### Phase 2: Frontend Core — Days 5-7
4. **Create `SimplifiedBriefingForm`** — minimal form; replace BriefingStep for new campaigns
5. **Create `CreativeUploadWithAnalysis`** — upload zone + auto-trigger analysis + progress indicator
6. **Create `AIDeducedFieldsEditor`** — editable AI fields with confidence badges

### Phase 3: Generation Mode — Days 8-9
7. **Create `GenerationModeConfig`** — relocate mode, creativity, CTA, formats; add AI suggestions
8. **Update `useCampaignWorkspace` hook** — new step flow: Briefing → Upload+Analysis → Edit → Generation → Plan → Derivations

### Phase 4: Cleanup — Day 10
9. **Remove Briefing Doctor** — delete routes, lib files, hooks, translation keys
10. **Update translations** — add new UI strings; remove Briefing Doctor keys

### Phase 5: Testing & Polish — Days 11-12
11. **Integration tests** — create → upload → analyze → edit → generate
12. **E2E validation** — full flow across diverse creative types
13. **Prompt refinement** — test with 10-20 real user uploads; measure accuracy

### Cross-Cutting (All Phases)
- i18n compliance for AI-generated content
- Security review of image handling pipeline
- Analytics instrumentation for AI suggestion acceptance rates
- Privacy policy update for OpenAI image processing disclosure

---

## Quick Reference

| Decision | Rationale |
|----------|-----------|
| Reuse auto-briefing, don't rebuild | Existing `analyzeImageContent()` does 70% of what's needed |
| No DB schema changes | All fields exist; shift when populated, not what exists |
| Store analysis in asset metadata | `campaign_assets.metadata` is already jsonb |
| Remove Briefing Doctor entirely | AI visual analysis replaces rule-based validation; reduces friction |
| Move advanced settings to generation | Separates "what" (brief) from "how" (mode config) |
| Keep plan generation unchanged | Inputs change (AI-deduced vs manual), not logic |

---

*Synthesized: 2026-05-26*
