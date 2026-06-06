# Phase 61 Research: Creative Readiness Foundation

## Objective

Research how to plan Phase 61 well: a pre-generation readiness layer that uses existing ADScale analysis and quality primitives.

## Relevant Existing System

### Preflight API

`app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts` already provides:

- `GET` for cached/stored preflight result from campaign asset metadata.
- `POST` to run AI/technical analysis with rate limiting and `creative_qa` credit spend.
- Workspace and campaign membership validation.
- Asset ownership validation.
- stale `analyzing` reset after five minutes.
- cached response when completed metadata exists.
- metadata persistence via `updateAssetMetadata`.

### Preflight Analysis

`app/src/server/ai/preflight-analysis.ts` already returns:

- `overallScore`.
- `breakdown.technicalQuality`.
- `breakdown.textLegibility`.
- `breakdown.visualHierarchy`.
- `breakdown.ctaProminence`.
- `breakdown.composition`.
- `breakdown.brandConsistency`.
- `breakdown.platformReadiness`.
- `criticalIssues`.
- `suggestions`.
- technical metadata from Sharp.

This maps closely to READY-02 and READY-03.

### Existing UI Hook and Upload Path

`app/src/lib/hooks/use-preflight.ts` already exposes:

- `usePreflightScore(assetId, campaignId)`.
- `useAnalyzePreflight()`.

`app/src/components/workspace/PilotUploadPanel.tsx` already runs preflight and creative analysis in parallel after upload, but it only maps the result into lightweight upload/briefing suggestions. It does not yet expose a durable readiness panel.

### Downstream Generation

`app/src/server/jobs/derivation.ts` already passes `asset.metadata.preflightResult` into `buildDerivationPrompt`, and `app/src/server/ai/prompt-builder.ts` already includes a pre-flight prompt section when provided. Phase 61 should preserve that path.

### Quality Taxonomy

`app/src/server/ai/creative-quality-taxonomy.ts` defines canonical post-generation dimensions:

- `legibility`.
- `ctaOffer`.
- `informationPreservation`.
- `briefMatch`.
- `formatFit`.
- `creativeRisk`.
- `styleFidelity`.
- `variationLevelFit`.

Readiness should map preflight dimensions to these terms only where useful; it should not pretend pre-generation readiness can validate generated-output preservation.

## Planning Implications

- A small server-side readiness normalizer should convert `PreflightResult` plus campaign/brand context into a stable `CreativeReadinessResult`.
- Avoid making the UI parse raw preflight strings.
- Store or cache the readiness result where reruns can replace it without losing derivation history.
- Use the existing preflight route as the analysis execution path, then layer readiness normalization on top.
- Add focused unit tests for normalization and route behavior before UI integration.
- Add UI tests for the panel states: missing base creative, pending/analyzing, ready with blocking issues, ready with suggestions only, rerun.

## Validation Architecture

### Automated Validation

- Unit test readiness normalization with synthetic `PreflightResult` fixtures.
- Route/service tests should prove workspace/campaign/asset scoping and cached rerun behavior.
- Hook/component tests should prove the UI separates blocking issues from suggestions and supports rerun.

### Commands

- `cd app && npm test -- src/server/ai/creative-readiness.test.ts`
- `cd app && npm test -- src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts`
- `cd app && npm test -- src/components/workspace/CreativeReadinessPanel.test.tsx src/components/workspace/PilotUploadPanel.test.tsx`
- `cd app && npm run lint && npm run build`

### Manual Validation

- Browser smoke from a campaign draft with base creative: upload/analyze, view readiness, edit brief or replace asset, rerun readiness, confirm generation entry remains available but clearly informed by readiness.

## Risks

- Rebuilding Briefing Doctor under a new name. Keep this phase readiness-only.
- Making readiness look authoritative beyond what pre-generation analysis can know.
- Charging multiple preflight credits through accidental repeated clicks. Preserve cached result and explicit rerun semantics.
- Letting public or beta feedback surfaces expose raw readiness internals. Keep this campaign-workspace scoped.

## Recommendation

Create two plans:

1. Server readiness contract, normalization, route/hook extension, and persistence/rerun semantics.
2. Campaign workspace UI panel with clear states and focused component tests.
