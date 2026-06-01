# Feature Research

**Domain:** AI ad creative generation quality and format adaptation
**Researched:** 2026-06-01
**Confidence:** HIGH for user-visible failures from UAT; MEDIUM for exact model-control levers.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Native format adaptation | "Variar tamanho" implies a real 9:16/4:5 ad, not a square poster with bands. | MEDIUM | Requires prompt, generation size, post-processing, and visual UAT. |
| Safe-area preservation | Paid-social ads must not crop CTA, logo, faces, offer, or legal copy. | MEDIUM | Needs prompt rules plus QA checks. |
| CTA contract consistency | User-provided CTAs must survive generation and evaluation exactly where required. | MEDIUM | Must resolve effective CTA by mode before prompt/scoring/QA. |
| Brand/product/offer preservation | Users expect generated ads to preserve factual campaign content. | HIGH | Restyling must not copy factual claims from style references. |
| Actionable failure feedback | Bad outputs need clear reasons and regeneration guidance. | MEDIUM | Split hard-rule failures from polish suggestions. |
| Workspace error clarity | Output inspection should not be blocked by vague loading/error states. | LOW | Need distinguish auth/workspace/not-found/network failures where possible. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hard quality gate before approval/export | Prevents users from shipping invalid outputs. | MEDIUM | Block/flag only hard failures; do not overblock subjective polish. |
| Side-by-side source vs output contract review | Makes fidelity visible and trustworthy. | HIGH | Could be later; v11.1 can start with metadata and issue surfacing. |
| Regeneration from structured failure reasons | Turns QA into an actionable repair loop. | MEDIUM | Use existing `regenerationSuggestion`, but make it contract-aware. |
| Selected style reference fidelity | Gives user control over which style image is used. | MEDIUM | Needs persistence/passing of selected style asset IDs. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic blur-fill to target dimensions | Quickly produces correct pixel size. | Looks cheap and hides bad adaptation. | Native target-size generation plus crop-only final normalization. |
| One-click generation with no quality gate | Feels fast. | Produces expensive bad outputs and user distrust. | Generate fast, then auto-diagnose before approval/export. |
| Let style reference override content | Can create visually attractive outputs. | Copies discounts, brands, claims, or CTAs from unrelated ads. | Style reference supplies design language only. |

## Feature Dependencies

```text
Effective Creative Contract
    ├──requires──> Mode-specific CTA/brand/source rules
    ├──requires──> Selected source/style asset resolution
    └──enables──> Prompt, scoring, QA, regeneration consistency

Native Format Adaptation
    ├──requires──> Target-size generation/editing
    ├──requires──> No decorative blur/letterbox normalization
    └──requires──> Visual UAT on 1:1 → 4:5/9:16 outputs

Hard Quality Gate
    ├──requires──> Structured scoring/QA result
    └──enables──> UI warnings and regeneration suggestions
```

### Dependency Notes

- **Creative contract first:** Without a shared contract, prompts, scoring, and QA disagree about whether an output is valid.
- **Format adaptation before QA tuning:** QA needs to know what valid 9:16/4:5 output looks like.
- **UI error clarity can ship independently:** It improves inspection even before all generation quality fixes land.

## MVP Definition for v11.1

### Launch With

- [ ] Native 9:16/4:5 adaptation without blurred bands, letterboxing, or center-pasted posters.
- [ ] Restyling uses selected style reference only as style language and preserves base facts.
- [ ] One shared effective contract for CTA, brand, offer, product, source asset, style asset, target format, and generation mode.
- [ ] Scoring/QA flags hard failures separately from polish issues.
- [ ] Campaign workspace shows inspectable access/session/loading errors.

### Add After Validation

- [ ] Automated visual diff/source-output comparison panel.
- [ ] Multi-turn repair loop using Responses image tool if single-shot edits remain unreliable.
- [ ] User-tunable quality threshold per workspace.

### Future Consideration

- [ ] Direct platform preview overlays for Meta/TikTok/Google safe areas.
- [ ] Structured brand-policy library per client profile.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Native format adaptation | HIGH | MEDIUM | P1 |
| Effective creative contract | HIGH | MEDIUM | P1 |
| Restyling content/style separation | HIGH | MEDIUM | P1 |
| Hard QA/scoring gate | HIGH | MEDIUM | P1 |
| Workspace error clarity | MEDIUM | LOW | P1 |
| Source/output comparison panel | MEDIUM | HIGH | P2 |
| Platform safe-area overlays | MEDIUM | MEDIUM | P2 |

## Sources

- UAT from campaign `fd018597-f2c8-49f5-86d9-7ca82267605c`: format adaptation produced bands/crowding; restyling copied reference facts; UI failed to load campaign for the active workspace session.
- OpenAI Image generation guide: https://platform.openai.com/docs/guides/image-generation/ — verified available target sizes and edit/generate behavior.
- Local repo: `app/src/server/jobs/derivation.ts`, `app/src/app/api/campaigns/[id]/restyle/route.ts`, `app/src/server/ai/creative-score.ts`.

---
*Feature research for: v11.1 Qualidade de Geração e Contratos Criativos*
*Researched: 2026-06-01*
