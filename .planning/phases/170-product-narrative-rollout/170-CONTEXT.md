# Phase 170: Product Narrative Rollout - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** `--auto` (conservative defaults; no interactive discussion)

<domain>
## Phase Boundary

Move product positioning into the **authenticated app** so users understand ADScale as a **curator workflow**, not a generic image generator.

In scope: onboarding tour, empty states, and user-facing copy on campaign creation, generation, review and settings surfaces (via i18n keys in `app/messages/en.json` and `app/messages/pt-BR.json`).

Out of scope: marketing site, email sequences, social/Reels copy, owner-only admin/corpus panels, renaming internal review mechanics (`Olhar`, export verdicts, calibration evidence), and unfreezing `marketing/brand/conceituacao.md` production copy.
</domain>

<decisions>
## Implementation Decisions

### conceituacao.md approval gate
- `marketing/brand/conceituacao.md` is **reference-only until founder approval** — status remains "Conceituação inicial; produção congelada."
- Phase 170 may borrow **structure and vocabulary** from conceituacao (Curator > operator, briefing → batch → curate, canonical/forbidden word lists) but must **not** lift unapproved marketing promises into in-app copy.
- **Conservative framing default:** describe what the product helps the user *do* (define brief, orchestrate variations, approve/refine) without performance guarantees, speed multiples, or "scale without hiring" claims.
- Founder approval of conceituacao.md is a **future gate** for marketing copy unfreeze — not a blocker for this phase's conservative in-app rollout.

### Curator > operator placement (BRAND-01)
- Apply curator framing at **workflow decision points** where users choose what to do next: onboarding steps, empty-state CTAs, campaign wizard intros, generation confirm buttons, review approve/reject guidance.
- Preferred narrative arc: **briefing before image → batch instead of one-offs → human curation at the end**.
- Keep **"curator"** as the canonical English role term in product copy; PT-BR equivalent: **"curador"** (estratégico), never "operador" as the user's target identity.
- Do **not** replace internal review terminology (`Olhar`, export verdicts, calibration source labels) in owner/review surfaces — those terms serve a different audience and stay honest/technical.

### Onboarding and empty states (BRAND-02)
- **Dashboard-only tour** (carries forward Phase 26 decision): rewrite existing 5 `onboarding.*` steps — no extension to other pages in this phase.
- Rewrite empty states on dashboard home, campaigns list, and library/generation surfaces using shared `EmptyState` component patterns where they exist.
- Explain the **curator role** in plain product language: define the brief, run variations as a batch, review and approve what ships.
- **Forbidden in onboarding/empty states:** Cenbrap references, calibration/corpus jargon, taste-profile mechanics, agreement-rate or sample-sufficiency language, and any implication of customer-real proof.
- Cenbrap remains **fixture/seed only** — never named or implied as the product model client.

### Consistent product language (BRAND-03)
- Establish in-app canonical terms aligned with conceituacao §4.1 (conservative subset):
  - **Use:** briefing/plano criativo, variação/derivação, batch, aprovar/curar, criativo base, workspace.
  - **Avoid:** "IA mágica", "revolucionário", "substitui o designer", "basta poucos cliques", "solução completa", performance-lift promises.
- Update **both** `en.json` and `pt-BR.json` in parallel for every changed key — no locale drift.
- Align navigation labels, wizard step titles/descriptions, generation CTAs, and review action copy across the campaign → generation → review → settings flow.
- Tone: **direct, technical, confident** — founder-scientist persona at product-surface level, not hype or coaching.

### Review checklist (BRAND-04)
- Add an in-repo **in-app copy review checklist** (recommended path: `marketing/brand/in-app-copy-checklist.md`) derived from conceituacao §4.2–4.4 and Phase 169 claim-gate constraints.
- Checklist must gate every copy change in this phase:
  1. Reflects Curator > operator at workflow decision points.
  2. No overclaim of full automation ("AI decides alone", "magic", "one click").
  3. No performance lift, ROAS/CPA improvement, or speed-multiple claims unless backed by verified product data (none available — withhold).
  4. No customer-real, agreement-rate, or quality-improvement proof implied.
  5. No Cenbrap or brand-specific fixture presented as product proof.
  6. No calibration/corpus/Olhar jargon on general user surfaces (onboarding, empty states, campaign wizard).
  7. Uses canonical vocabulary; avoids conceituacao forbidden list.
- Phase verification should reference checklist pass before marking BRAND-04 complete.

### Claims and evidence honesty (cross-cutting)
- In-app copy must stay consistent with Phase 168/169 decisions: fixture validates operation only; customer-real claims remain withheld.
- User-facing copy may say the human stays in the loop; may **not** say the system has proven market outcomes or customer validation.
- Generation/review copy may describe AI-assisted variation — not autonomous creative direction.

### Claude's Discretion
- Exact string wording per surface (planner/implementer chooses phrasing within locked constraints).
- Whether to remove emoji from onboarding titles (current `👋` — tone-down acceptable).
- Which settings tab labels need curator framing vs neutral functional labels.
- Checklist file format (markdown table vs numbered list) as long as BRAND-04 criteria are auditable.
</decisions>

<specifics>
## Specific Ideas

- **Reference doc:** `marketing/brand/conceituacao.md` — Curator > operator belief (§1.1), three mechanisms (§1.2: briefing, batch, human curation), vocabulary canon/forbidden (§4.1–4.4), review checklist pattern (§5).
- **Conservative copy examples (approved direction):**
  - "Define your brief, generate variations as a batch, then curate what ships."
  - "You stay in the curator seat — AI handles the variations, you approve what goes live."
- **Examples to avoid in-app:**
  - "10x faster", "scale without hiring", "AI does everything", "proven ROAS lift", any Cenbrap-specific story.
- **Existing surfaces to update (non-exhaustive):** `onboarding.*`, `dashboard.home.empty*`, `metadata.description`, campaign wizard `generation.*` step copy, `review.*` action guidance, sign-up subtitle, library/generation empty descriptions.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OnboardingTour` + `useOnboarding()` — dashboard tour with 5 steps, binary completion via `user.onboardingCompletedAt`.
- `EmptyState` component (`app/src/components/ui/EmptyState.tsx`) — shared empty-state layout with title, description, action.
- Inline `EmptyState` on dashboard (`app/src/app/(dashboard)/page.tsx`).
- i18n namespaces: `onboarding`, `dashboard`, `campaigns`, `generation`, `review`, `settings`, `navigation`, `metadata` in `app/messages/{en,pt-BR}.json`.

### Established Patterns
- All user-facing copy flows through **next-intl** JSON message files — changes are key edits, not inline strings.
- Phase 26 locked: dashboard-only tour, binary progress, settings restart (already shipped — do not reopen scope).
- Review UI retains `Olhar` terminology for art-direction verdicts — separate from general narrative rollout.
- Phase 168/169: source-label honesty (`synthetic_fixture`, `operator_imported`, `real_customer`) lives in owner/corpus surfaces, not general onboarding.

### Integration Points
- `app/messages/en.json` and `app/messages/pt-BR.json` — primary edit targets.
- Dashboard page tour step definitions (`app/src/app/(dashboard)/page.tsx`).
- Campaign wizard, generation, review, and settings pages consume i18n keys — grep namespaces before editing.
- New checklist file under `marketing/brand/` for BRAND-04 audit trail.
</code_context>

<deferred>
## Deferred Ideas

- Unfreezing marketing copy production after founder approves `conceituacao.md` (sales page, emails, Reels — listed in conceituacao §6).
- Public/landing page metadata and unauthenticated marketing surfaces.
- Renaming `Olhar` to user-friendly art-direction label in review UI — separate UX decision.
- Onboarding tour extension beyond dashboard (Phase 26 deferred).
- Owner-only corpus/calibration panel copy refresh — honest technical language already appropriate.
- Performance metrics in dashboard KPI copy tied to real customer proof.
- Video tutorials, onboarding analytics, personalized tours by role.
</deferred>

---

*Phase: 170-product-narrative-rollout*
*Context gathered: 2026-06-25*
