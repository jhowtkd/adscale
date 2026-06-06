# Phase 68: Progression Foundation - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 68 establishes the durable foundation for Ads Scientist progression. It should persist and calculate workspace-level progression from real product actions, expose the user's current level and next action in a compact dashboard surface, and leave enough evidence for later mission and insight phases.

This phase does not build the full mission list, insight prompt system, credit upgrade prompt system, or a complete gamified academy. Those belong to phases 69-71.

</domain>

<decisions>
## Implementation Decisions

### Progression model
- Use a hybrid model: infer progress from real product actions where possible, and persist a workspace-level progression snapshot for fast UI, auditability, and explainability.
- Progression belongs to the workspace, not the individual user, because campaigns, credits, beta entitlement, and generation usage are workspace-scoped.
- The snapshot should store current level, completed progression requirements, timestamps, and evidence IDs or evidence metadata that explain why the workspace advanced.
- Do not model progress as manual checkboxes. Completion should be backed by product events or durable product records.

### Progress evidence
- Phase 68 should recognize only nuclear product actions as reliable evidence: campaign setup, base creative upload, readiness analysis, derivation/generation, review/approval, export/share, and related existing usage or credit events.
- Avoid tracking page visits, tour steps, and generic clicks as progression evidence. They are too easy to inflate and do not prove product value.
- Credit spend alone should not advance levels. Credit consumption can support evidence, but status must be tied to value-producing actions.
- Blocked next actions should be represented as useful blockers with a reason and CTA instead of counting as progress.

### Level pacing and semantics
- Keep the progression more prestigious than a quick onboarding checklist. A strong first session should show visible progress but should not necessarily move the user out of the first level.
- Leaving the first level should require a real created result, with "first approved creative" as the preferred gate for moving beyond beginner status.
- Level advancement should prefer completed outcomes over started actions. The user should not level up just for creating an empty campaign or opening a screen.
- Thresholds may be defined in code/config during the foundation phase so the team can calibrate after beta sessions without changing the database shape.

### Level naming and tone
- Use a playful "cientista pop" tone: keep the science/lab metaphor, but avoid childish RPG language.
- The status journey should still communicate professional progress toward becoming better at ads.
- The previously proposed names are directionally right but may be made more playful during planning/implementation. Preserve the arc: beginner → creative analyst → ads strategist → ads scientist.
- The product should feel like a lab for experiments with ads, not a generic game.

### Dashboard presence
- The first visible surface should be a compact dashboard module near the top of the dashboard.
- The compact module should show current level, a progress bar, and one next action.
- The CTA should point to the next useful product action, not to a full mission list yet.
- Copy should frame the next step as a useful challenge, for example "complete your next experiment", rather than generic congratulations.
- Do not make a large hero section or full mission center in phase 68. The richer mission experience belongs to phase 69.

### Claude's Discretion
- Exact data model shape, as long as it remains workspace-scoped, explainable, and compatible with inferred product evidence.
- Exact compact dashboard layout, icons, spacing, and microcopy within the "lab / experiments / ads scientist" tone.
- Exact first-pass level thresholds, as long as leaving the first level requires a real approved creative or equivalent value-producing result.

</decisions>

<specifics>
## Specific Ideas

- User direction: create a milestone/status system that makes the person learn and use all app functions, spend credits naturally, and become more invested in the product.
- User framing: "começa como um jovem aprendiz e vai se tornando um cientista de ads."
- User chose the balanced monetization/activation path: progression should teach, capture insight, and encourage credit usage without feeling manipulative.
- User selected more playful names than the initial proposal, but also selected a slower first-session progression. The system should feel fun without making levels cheap.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/app/(dashboard)/page.tsx`: Main dashboard already has a top header, campaign grid, stats sections, onboarding tour integration, and room for a compact progression module near the top.
- `app/src/lib/hooks/use-dashboard-stats.ts`: Existing TanStack Query pattern for dashboard data fetching. A progression hook can follow the same query style.
- `app/src/components/dashboard/CreditPanel.tsx`: Existing compact dashboard card pattern for credit state, progress bar, and upgrade link.
- `app/src/lib/hooks/use-onboarding.ts` and `app/src/app/api/user/onboarding/route.ts`: Existing onboarding status is per-user and boolean. Progression should not reuse this as the primary model, but the API/hook pattern is useful.
- `app/src/server/repositories/dashboard.ts`: Existing dashboard repository aggregates campaigns, derivations, credits, and recent activity. Progression can either extend dashboard stats or use a separate repository/API with similar workspace-scoped access.

### Established Patterns
- Workspace-scoped state is the right boundary for product/business data. Existing workspace membership, beta access, billing, campaigns, assets, derivations, usage events, and credit transactions all use `workspaceId`.
- Existing billing semantics from Phase 49: user-visible units should be generated ads/credits, not raw provider tokens; beta allowance is workspace-scoped and server-enforced.
- Existing dashboard UI uses compact cards, Tailwind, CSS variables, lucide icons, and TanStack Query.
- The app already tracks durable product records that can support inferred progression: campaigns, campaign assets, derivations, exports, share links, credit transactions, usage events, and activity events.

### Integration Points
- Database: likely add a workspace-scoped progression table/snapshot, plus possibly event/evidence metadata rather than duplicating all product records.
- API: a workspace-authenticated endpoint can return current level, progress percentage, completed evidence, blocked reason, and next action.
- Dashboard: add a compact status module near the top of `app/src/app/(dashboard)/page.tsx`.
- Tests: repository/service tests should cover level calculation, workspace isolation, snapshot refresh, and evidence explanation.

</code_context>

<deferred>
## Deferred Ideas

- Full mission list and resumable mission CTAs across the product — Phase 69.
- Mission-linked insight prompts after key actions — Phase 70.
- Upgrade/top-up prompts tied to mission value and insufficiency — Phase 71.
- Per-user progression inside a shared workspace — future phase if team use becomes important.
- Team leaderboard, certificates, seasonal challenges, discounts, or reward credits — future milestones.

</deferred>

---

*Phase: 68-progression-foundation*
*Context gathered: 2026-06-06*
