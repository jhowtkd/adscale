# Stack Research: v11.6 Creative Strategy Cockpit

## Decision

No new stack is needed for v11.6.

The milestone should compose existing ADScale primitives:

- Next.js App Router for campaign workspace surfaces.
- TanStack Query for readiness, recipe, preview, and package server state.
- Drizzle/Postgres for persisted campaign, derivation, package, and readiness metadata.
- Existing OpenAI text/image integration through current server AI utilities.
- Existing quality taxonomy, preflight analysis, creative diagnosis, creative contract, QA, and regeneration modules.
- Existing R2 object storage, signed URLs, share links, and delivery package paths.

## Integration Points

- `app/src/server/ai/preflight-analysis.ts`
- `app/src/server/ai/creative-diagnosis.ts`
- `app/src/server/ai/creative-quality-taxonomy.ts`
- `app/src/server/ai/creative-contract.ts`
- `app/src/lib/hooks/use-campaign-workspace.ts`
- `app/src/components/workspace/*`
- `app/src/app/api/share/route.ts`
- `app/src/app/api/derivations/[id]/delivery-package/route.ts`

## Non-Goals

- Do not add a new AI provider.
- Do not migrate persistence.
- Do not introduce a separate workflow engine.
- Do not rebuild the campaign form from scratch.
