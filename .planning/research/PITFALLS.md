# Pitfalls Research

**Domain:** AI ad creative generation quality and format adaptation
**Researched:** 2026-06-01
**Confidence:** HIGH for observed pitfalls; MEDIUM for prevention effectiveness until UAT regenerates outputs.

## Critical Pitfalls

### Pitfall 1: Correct dimensions but wrong creative

**What goes wrong:**
The output has the right pixel dimensions but is just a centered poster with blurred bands or crowded elements.

**Why it happens:**
Post-processing treats format adaptation as image fitting instead of layout reconstruction.

**How to avoid:**
Generate/edit at the target aspect ratio, forbid blurred bands in prompt, use final sharp step only for dimension normalization, and visually UAT 9:16/4:5 outputs.

**Warning signs:**
Blurred side/top/bottom areas, square art pasted into portrait canvas, CTA/logo/text clustered near center.

**Phase to address:**
Phase 44.

---

### Pitfall 2: Style references leak factual content

**What goes wrong:**
Restyling copies reference-image claims like discounts, brands, prices, or CTAs into the base creative.

**Why it happens:**
The model sees both images and the code/prompt does not enforce a strong enough base-facts vs style-language contract.

**How to avoid:**
Resolve explicit base and selected style assets; prompt says base is factual source and style is visual-only; QA checks for copied style-reference claims.

**Warning signs:**
Generated output contains a brand/offer/discount not present in the base campaign.

**Phase to address:**
Phase 45.

---

### Pitfall 3: CTA contract drift

**What goes wrong:**
Generation, scoring, and regeneration disagree on whether CTA should be exact, inherited from base, or absent.

**Why it happens:**
`null` is overloaded and no per-mode effective CTA contract exists.

**How to avoid:**
Resolve effective CTA before prompt/scoring/QA. For art variation, use explicit CTA. For restyling, preserve base CTA unless the user explicitly overrides/removes. For format adaptation, preserve source CTA or selected CTA according to mode entry point.

**Warning signs:**
Scoring says "CTA must be none" while output correctly preserved the base CTA, or regeneration suggests removing a valid CTA.

**Phase to address:**
Phase 45.

---

### Pitfall 4: Visually good output gets approved despite hard failures

**What goes wrong:**
The output looks polished but has wrong brand, unsupported offer, bad CTA, cropped logo, or unreadable legal copy.

**Why it happens:**
One blended quality score hides hard-rule failures.

**How to avoid:**
Store hard failures separately from polish suggestions; surface them in the UI before approve/export; provide structured regeneration suggestions.

**Warning signs:**
Scores above 70 with issues that should block approval.

**Phase to address:**
Phase 46.

---

### Pitfall 5: UI error prevents output diagnosis

**What goes wrong:**
The campaign page displays a generic loading/error state, so users cannot tell whether outputs are bad or the workspace/session is wrong.

**Why it happens:**
UI collapses auth, workspace, not-found, timeout, and route errors into one generic state.

**How to avoid:**
Expose inspectable error messages and recovery actions for campaign fetch and derivation fetch failures.

**Warning signs:**
Page remains skeleton-only or says "Erro ao carregar campanha" with no distinction between access/session/data problems.

**Phase to address:**
Phase 47.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing `ctaText=null` as "none" | Minimal schema changes | False positives/negatives across modes | Never for scoring/QA. |
| Asset order selection | Fast to implement | Ignores user intent | Only for legacy fallback with explicit logs. |
| Blurred padding | Correct pixel dimensions | Bad creative quality and user distrust | Never for format adaptation. |
| QA-only after user clicks | Less background work | Bad outputs sit unflagged | Acceptable only for optional deep QA, not hard-rule checks. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI Image API | Asking for target format but then post-processing into another visual structure | Request closest native size and validate final output. |
| Restyling edit | Passing base + style images without explicit factual/style split | Contract resolver + prompt + QA checks. |
| Inngest job | Event lacks selected style refs | Persist metadata or include selected IDs in derivation/job event. |
| UI scoring | Treating all issue strings equally | Separate blocking failures from advisory suggestions. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Generic "quality score" | User cannot tell whether output is unusable or just imperfect. | Show "Bloqueio" vs "Melhoria sugerida". |
| Hidden source/target contract | User cannot debug why an output drifted. | Display target format, CTA contract, base asset, style reference, and hard failures. |
| Vague campaign load errors | User loses trust in outputs and app state. | Show likely cause and recovery action. |

## "Looks Done But Isn't" Checklist

- [ ] **Format adaptation:** Output fills 9:16/4:5 without blurred bars, pasted square poster, or clustered modules.
- [ ] **Restyling:** No factual content from style reference appears unless it also exists in base/campaign contract.
- [ ] **CTA:** Scoring and regeneration use the same effective CTA as prompt generation.
- [ ] **Brand:** Client/brand assumptions are resolved from base/brief/profile before generation.
- [ ] **QA:** Hard failures are visible before approval/export.
- [ ] **UI:** Campaign page error distinguishes workspace/session/not-found/network when possible.

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Correct dimensions but wrong creative | Phase 44 | Generate/review 1:1 -> 4:5/9:16 fixtures; no blurred bars or center-pasted layouts. |
| Style references leak factual content | Phase 45 | Restyling tests + UAT with reference containing unrelated discount/brand. |
| CTA contract drift | Phase 45 | Unit tests for effective CTA by mode and scoring prompt. |
| Hard failures hidden by score | Phase 46 | Scoring/QA fixture with visually good but invalid output produces blocking failure. |
| UI error prevents diagnosis | Phase 47 | Browser/API checks for unauthorized/workspace-mismatch/not-found states. |

## Sources

- UAT review of campaign `fd018597-f2c8-49f5-86d9-7ca82267605c`.
- OpenAI Image generation guide: https://platform.openai.com/docs/guides/image-generation/
- Local repo: `app/src/server/jobs/derivation.ts`, `app/src/server/ai/prompt-builder.ts`, `app/src/server/ai/creative-score.ts`, `app/src/components/workspace/DerivationCard.tsx`.

---
*Pitfalls research for: v11.1 Qualidade de Geração e Contratos Criativos*
*Researched: 2026-06-01*
