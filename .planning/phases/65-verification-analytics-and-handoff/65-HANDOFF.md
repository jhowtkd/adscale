# v11.6 Creative Strategy Cockpit — Beta Handoff

**Date:** 2026-06-05  
**Milestone:** v11.6  
**Phase:** 65 — Verification, Analytics, and Handoff

## What shipped

The campaign workspace now guides users through a single cockpit path:

1. **Creative Readiness** — score base creative + brief before generation (`CreativeReadinessPanel`, preflight API).
2. **Guided Briefing** — one-question-at-a-time flow for weak briefs (`GuidedBriefingPanel`).
3. **Strategy Recipes** — Safe Iteration, Performance Push, Visual Differentiation with overrides (`StrategyRecipePanel`).
4. **Preview Gate** — one preview derivation before full batch; credit estimate shown (`PreviewGatePanel`).
5. **Client Approval Package** — shareable package from approved derivations (`ClientApprovalPackagePanel`).

## Credit behavior (beta)

| Action | Credits | Notes |
|--------|---------|-------|
| Preflight / readiness analysis | 0 | Reuses existing preflight job; no new provider |
| Guided briefing suggestions | 0 | Rule-based suggestions; no LLM per question |
| Preview derivation | 1× `image_derivation` per preview job | Same cost model as a single derivation |
| Full batch | `estimateCreditCost(config)` | Based on CTA variants × target formats × mode; shown in recipe modal and preview gate before queue |
| Approval package | 0 | Assembly + share link only |

**Important:**

- Credits are deducted when derivation jobs run, not when viewing readiness or recipes.
- Preview and batch use the same quality gate and creative contract — preview spend is not refunded if the user revises the recipe.
- Beta entitlements still apply (`v11.2`); insufficient credits block queue with existing billing errors.

## Privacy boundaries

| Data | Stored / transmitted | Who can access |
|------|----------------------|----------------|
| Campaign brief + guided answers | Workspace DB (`campaigns`) | Workspace members |
| Base creative assets | Object storage (signed URLs) | Workspace members; share gallery via token-scoped signed URLs only |
| Readiness / preflight results | Asset metadata + API response | Workspace members on campaign |
| Client approval package | `share_links` + campaign notes snapshot | Anyone with share token; assets via signed redirect URLs |
| Feedback reports (v11.4) | Owner triage at `/feedback` | Platform owners only |

**Intentionally excluded from share/feedback payloads:**

- Auth tokens, cookies, API keys, full prompts, raw OpenAI responses
- Unscoped asset URLs (share routes validate token + derivation membership)

## AI limitations (beta)

- **Readiness** derives from preflight analysis (vision + heuristics). It is advisory — `canGenerate: false` blocks the UI affordance but does not guarantee ad performance.
- **Guided briefing** uses template suggestions, not a conversational agent. Skipped questions remain empty in the campaign form.
- **Recipes** rank from readiness dimensions; they do not auto-run A/B tests or predict ROAS.
- **Preview** is one variant — quality gate may still fail on batch scale or different CTA/format combos.
- **Approval package** reflects status at snapshot time; stale badge appears when derivations change — refresh required.
- **Languages:** Guided copy supports PT-BR and EN; generation language follows existing campaign rules.
- **No new provider** in v11.6 — same OpenAI path as v11.5 quality loop.

## Automated verification (CQA-01)

```bash
cd app
npm test -- \
  src/server/ai/creative-readiness.test.ts \
  src/server/ai/guided-briefing.test.ts \
  src/server/ai/strategy-recipes.test.ts \
  src/server/ai/preview-gate.test.ts \
  src/server/ai/cockpit-path.test.ts \
  src/server/ai/client-approval-package.test.ts \
  src/components/workspace/CreativeReadinessPanel.test.tsx \
  src/components/workspace/GuidedBriefingPanel.test.tsx \
  src/components/workspace/StrategyRecipePanel.test.tsx \
  src/components/workspace/PreviewGatePanel.test.tsx \
  src/components/workspace/ClientApprovalPackagePanel.test.tsx
```

55 tests passing across 14 files (2026-06-05).

## Browser smoke (CQA-02)

See `65-SMOKE-EVIDENCE.md` for the operator checklist. Recommended path:

1. Create/open campaign draft → upload base creative.
2. Run readiness → confirm dimensions + blocking issues order.
3. Start guided briefing on weak brief → accept/edit/skip → verify form fields.
4. Open Derivar → pick recipe → generate preview → confirm credit lines.
5. Approve batch or revise → confirm preview gate dismisses after batch queued.
6. Approve derivations → create client package → open share link.

## Residual risks

| Risk | Mitigation |
|------|------------|
| Production browser smoke not run from CI agent | Operator completes `65-SMOKE-EVIDENCE.md` on deploy |
| Migration 0027 not applied in prod | Run `npm run verify:migration-0027` in Render shell |
| Lint warnings (pre-existing) | 0 errors; warnings outside v11.6 scope |
| Credit estimate drift from billing constants | `estimateCreditCost` documents sync with `CREDIT_COSTS` |

## Next actions for milestone close

1. Operator browser smoke on production (or staging).
2. Run `/gsd-audit-milestone` for v11.6 requirement sweep.
3. Archive milestone artifacts to `.planning/milestones/v11.6-*`.
