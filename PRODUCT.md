# Product

<!-- impeccable:product-schema 1 -->
<!-- Init substitution: no structured question tool in this session. Facts below are inferred from the assignment (product UI / Estúdio, not a marketing brand site) plus canonical repo evidence: CONTEXT.md, docs/adr/0013, docs/agents/source-of-truth.md, design.md, app/src/app layout and destinations. Label: inferred until a human revises this file. -->

## Platform

web

## Users

Primary users are people and small teams who produce static creatives for paid ads (Meta, TikTok, Google) and are bottlenecked on volume, speed, and variety: in-house marketers, freelance designers, agencies (~5–30), ecommerce and SaaS growth teams. Typical situation: a trafficker or designer at a desk, mid-campaign, starting or resuming a Trabalho in Estúdio, reviewing generated Peças, then exporting.

Anti-audience (explicit): buyers who want “AI that does everything,” artisan brand-craft production, or hiring another designer instead of a production system.

Other roles that exist in the product, not as the ICP: workspace members vs the platform owner (cross-workspace ops). Do not treat critique personas (Alex / Jordan / Sam) as the ICP; they were a UX-review device.

## Product Purpose

ADScale is production infrastructure for **inteligência criativa em escala**: the human decides intent and outcome; the model infers operational briefing and production detail from the authorized context (the operator’s request, the active brand, and sources explicitly attached to the Trabalho). Reviewing inferred fields is optional, not a required step.

Success is speed to exportable, brand-faithful Peças the operator can approve or discard — not “AI generated an image.” Generation Settlement (charge, reserve, dispatch, compensate, retry, refund) is a billing/ops cycle; it does not set price, paint pixels, or judge quality.

## Positioning

Neighbors (AdCreative.ai, Pencil, Madgicx) sell “AI generates ads.” ADScale’s claim a neighbor cannot truthfully copy: the human is repositioned as the decision-maker, not replaced; the model infers a versioned briefing with fields marked sustained / inferred / unknown; factual claims (offer, benefit, price) are never invented to reach “ready.”

## Operating Context

Canonical spine (ADR 0013): brand/client → intent and briefing → Trabalho → generation → review/approval → delivery → learning.

Operator surface is **Estúdio** (start or resume a Trabalho). **Visão geral** is a secondary management surface. **Campanha** is optional grouping of Trabalhos, not the product spine. Campaign/workspace, Assistente, and historical Quick Tools / Criar Post are adapters over the same `creative_work` contract.

Protocols (creation modes on a Trabalho): Variações, Peça única, Adaptar formatos, Mudar estilo. A Rascunho stays bound to one Protocolo; switching Protocolo preserves the current draft rather than converting it.

Authorized context is the operator request, active brand, and sources linked to that Trabalho — not the whole workspace history by default. Visual references guide look; they do not support campaign facts.

Product UI is a Next.js app (`app/`, default `npm run dev` on port 3000). Locales: `pt-BR` (default) and `en` via next-intl. Image generation uses OpenAI GPT Image 2 behind a provider seam. Live visual iteration needs the local app, not production HTTPS.

## Capabilities and Constraints

Confirmed:

- One canonical creative-work aggregate; HTTP, chat, and panel are adapters and must not duplicate business rules.
- Inferred briefing with readiness `ready` | `exploratory` | `blocked`. Unknown factual fields stay empty.
- Objective verdict (approved / rejected / inconclusive) is separate from subjective score. Human approval can confirm inconclusive; it cannot override an objective rejection.
- Brand Training / brand kit is an independent per-brand module consumed by Trabalhos.
- Templates accelerate intent inside the canonical flow; they must materialize, not dead-end.
- Allowed primary destinations are frozen in `docs/decisions/allowed-primary-destinations.json` (Estúdio `/`, `/creative-work/[id]`, campaigns, assistant, brand kit, templates). Landing Page generator and Persona Simulation are frozen (`app/src/server/ai/FROZEN.md`); UI must not imply they are live product.
- Layerize / native layer editor is optional post-process on a completed Peça, entitlement-gated, not a generator.
- Postgres is operational truth; learned memory is auxiliary.

Undecided / do not invent: pricing, packaging, unpaid testimonials, WCAG conformance target, and whether marketing Lab Notes cadence belongs in product chrome.

## Brand Commitments

- Product name: **ADScale**.
- Verbal identity: Expert, Fast, Creative. Not pedantic, not clickbait, not “diferentão.”
- Founder voice mix (ADR 0008): 80% founder-personal / 20% professional / 0% intimate. Humor: deadpan British. Forbidden in product copy: sneaker/RAD slang (drop, hype, cool, streetwear, limited edition) and “TL;DR” closers.
- Canonical glossary in `CONTEXT.md` (Trabalho, Campanha, Protocolo, Rascunho, Peça, Variação, Estúdio, Visão geral). Do not revive campaign/cockpit/Quick Tools as the named spine.
- Identity constraint volunteered by existing design context: no purple/indigo brand accents on product UI. Visual tokens themselves live in `design.md` / CSS — not restated here.

## Evidence on Hand

- Product vocabulary and thesis: `CONTEXT.md`
- Accepted architecture: `docs/adr/` (especially 0013), `docs/agents/source-of-truth.md`
- Incumbent visual system (do not replace during init): `design.md`, `app/src/app/globals.css`
- Prior UX critique: `.impeccable/critique/2026-06-01T21-08-47Z__c-components-workspace-artvariationconfigmodal-tsx.md` (campaign derivation modal; silent auto-suggestion failure; Operate-mode product register)
- Commercial / client study assets under `docs/client-cases/` and `docs/commercial-studies/` (use only files that exist; do not fabricate logos, quotes, or metrics)

Absences future work must not fabricate: customer testimonials, press logos, benchmark numbers, and features behind the frozen-module list.

## Product Principles

1. The human decides; the model infers. Never fill unknown facts to look ready.
2. One Trabalho spine. New primary destinations need an explicit freeze lift, not a parallel journey.
3. Optimize operator time to an exportable Peça: visible job status, recoverable errors, no silent AI fallbacks.
4. Brand fidelity is a contract (references, voice, CTAs), not a mood board the UI can contradict.
5. Empty states and chrome must not advertise frozen or unshipped capabilities.

## Accessibility & Inclusion

No WCAG conformance target is recorded as a product requirement. Shipped product UI already includes a skip-to-content link, `A11yProvider` (axe contrast/focus in development), and `prefers-reduced-motion` handling. Locales are `pt-BR` and `en`. Treat those as incumbent behavior to preserve, not as a certified standard.
