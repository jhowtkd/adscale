# Zep Brand Memory Engine Implementation Plan

Date: 2026-05-26
Status: Draft for approval

## Goal

Turn Zep into ADScale's learning layer for brands and clients.

The product should not only reuse manually saved references. It should learn from campaign history, approvals, rejections, QA results, persona tests, and delivery actions so future generation starts with better brand context and fewer repeated explanations.

## Product Thesis

ADScale's differentiator becomes:

> ADScale learns the creative pattern of each client over time.

This should be exposed to users as brand/client intelligence, not as "Zep". Zep is the infrastructure behind a product capability.

## Current Context

The app already has a relational memory foundation:

- `client_profiles` stores brand/client profile fields.
- `client_references` stores reusable visual references.
- campaigns store briefing fields, selected references, creative level, target formats, and CTA variants.
- derivations store prompts, outputs, approval state, QA state, scores, feedback, and regeneration context.
- persona simulations and delivery package flows already create useful post-generation signals.

The missing layer is cross-campaign learning: why a creative worked, what should be avoided, what tone and structure a brand tends to approve, and which contextual patterns matter when generating future work.

## Non-Goals

- Do not replace Postgres as source of truth.
- Do not upload raw images to Zep in the first version.
- Do not let Zep override hard generation contracts: literal CTA, target format, source image, campaign constraints, and generation mode remain authoritative.
- Do not build a full knowledge-base UI in the first version.
- Do not require Zep for local development or tests.

## Architecture

Use a two-layer model:

1. **Postgres: operational truth**
   - Stores users, workspaces, campaigns, profiles, references, assets, derivations, QA, billing, and statuses.

2. **Zep: learned context**
   - Stores and retrieves durable contextual facts and episodes derived from product activity.
   - Operates as auxiliary context for generation, briefing, and user-facing brand intelligence.

Recommended graph shape:

- one Zep graph per ADScale workspace, because workspace members need shared brand/client context;
- graph id format: `adscale_workspace_${workspaceId}`;
- use JSON/text episode ingestion first;
- defer custom ontology until retrieval quality proves it needs stricter labels.

Why no custom ontology in the first slice:

- Zep docs recommend starting with fewer, simpler structures.
- ADScale can get useful value from well-structured JSON events and graph search before adding custom entity/edge definitions.
- A custom ontology can be a second pass once we see which facts are noisy or missing.

## New Server Modules

Create a small memory subsystem under `app/src/server/memory/`.

Suggested files:

- `zep-client.ts`
  - creates the Zep client only when enabled;
  - centralizes graph creation/search/add calls;
  - returns safe no-op behavior when disabled.

- `brand-memory-events.ts`
  - defines event payloads ADScale emits into memory;
  - normalizes campaign, profile, derivation, QA, and persona signals into compact JSON.

- `brand-memory-ingest.ts`
  - adds events to the workspace graph;
  - strips secrets, raw image data, large prompts when not needed, and unsupported values;
  - attaches original timestamps.

- `brand-memory-context.ts`
  - searches Zep for relevant facts/episodes for a campaign, client profile, offer, audience, and generation mode;
  - formats a bounded context block for prompts.

## Environment Contract

Add optional env vars:

- `ZEP_API_KEY`
- `ZEP_ENABLED`
- `ZEP_GRAPH_PREFIX`

Default behavior:

- if `ZEP_ENABLED !== "true"` or `ZEP_API_KEY` is missing, memory is disabled;
- disabled memory must not break app startup, generation, tests, or local development;
- tests should mock the memory subsystem rather than calling Zep.

## Dependency

Add `@getzep/zep-cloud` to `app/package.json`.

Keep the dependency isolated to server-only modules.

## Memory Events

First-version ingestion events:

1. `brand_profile_created_or_updated`
   - profile name, description, visual notes, tone notes, constraints, required/prohibited elements, brand colors/fonts if present.

2. `campaign_created_or_updated`
   - campaign name, client/product, objective, audience, offer, tone, constraints, CTA variants, platforms, creative level, selected profile/reference ids.

3. `creative_approved`
   - campaign context, derivation id, format, CTA text, generation mode, quality score, QA summary, source profile/reference ids, optional short prompt summary.

4. `creative_rejected`
   - campaign context, derivation id, feedback, score issues, QA issues, regeneration suggestion.

5. `creative_saved_as_reference`
   - reference label, kind, notes, source derivation, linked client profile.

6. `creative_qa_completed`
   - checklist result, issues, suggestions, offer/CTA/brand consistency notes.

7. `persona_test_completed`
   - what personas understood, rejected, wanted, and click intent summary.

8. `delivery_prepared`
   - approved creative converted into final formats and delivery context.

Do not ingest:

- raw API keys;
- full `.env` values;
- raw image buffers;
- payment data;
- unbounded full prompts unless explicitly needed for debugging.

## Ingestion Flow

Use existing background-job patterns where possible.

Recommended implementation:

1. Product action succeeds in Postgres.
2. Route/job emits an Inngest event like `brand-memory/ingest`.
3. Inngest function calls `ingestBrandMemoryEvent`.
4. Zep failure logs a warning but does not roll back the user-facing action.

This keeps Zep from becoming a synchronous failure point.

If we later need guaranteed delivery, add a durable outbox table. Do not start there unless dropped memory events become a real product risk.

## Retrieval Flow

Add brand memory retrieval to generation context:

1. In `src/server/jobs/derivation.ts`, after campaign/profile/reference context is loaded, call `getBrandMemoryContext`.
2. Query Zep with a compact search string built from:
   - client profile name;
   - campaign client/product;
   - offer;
   - audience;
   - generation mode;
   - target format;
   - CTA text.
3. Limit the result to a small prompt-safe block.
4. Pass the block into `buildDerivationPrompt`.

Prompt-builder contract:

- add `brandMemory?: BrandMemoryContext | null` to `DerivationPromptConfig`;
- render it under a section such as `BRAND MEMORY / LEARNED CONTEXT`;
- explicitly state that brand memory is auxiliary and cannot override hard rules.

Example prompt section:

```text
BRAND MEMORY / LEARNED CONTEXT:
- Prior approved campaigns for this brand favored direct CTA buttons and high-contrast offer cards.
- Avoid luxury/editorial tone; past rejected variants were considered too abstract.
- The brand usually preserves blue/yellow palette and product close-up framing.

These learned patterns are auxiliary context only. They must not override the literal CTA, source image, target format, campaign constraints, or generation mode.
```

## User-Facing UI

First UI slice:

- add a compact "Aprendido sobre esta marca" panel in the campaign briefing when a brand/client profile is selected;
- show 3-6 retrieved memory items with light source labels such as "aprendido por aprovacoes" or "a partir de QA";
- keep it read-only in v1;
- hide the panel when Zep is disabled or no useful memory exists.

Do not add a full edit/delete memory UI in the first slice. Corrections can come later through explicit confirm/dismiss controls once the retrieval quality is visible.

## API Surface

Add one read route:

- `GET /api/client-profiles/[id]/memory`
  - requires workspace access;
  - verifies the profile belongs to the workspace;
  - returns a bounded list of memory facts/episodes for the selected profile;
  - returns an empty list when Zep is disabled.

Avoid exposing raw Zep payloads directly. Normalize them to a stable ADScale response shape.

## Suggested Implementation Waves

### Wave 1: Foundation

Files:

- `app/package.json`
- `app/src/server/validation/env.ts`
- `app/src/server/validation/env.test.ts`
- `app/src/server/memory/zep-client.ts`
- `app/src/server/memory/brand-memory-events.ts`
- `app/src/server/memory/brand-memory-ingest.ts`
- `app/src/server/memory/brand-memory-context.ts`
- matching tests under `app/src/server/memory/`

Tasks:

- add optional Zep env contract;
- add server-only Zep wrapper with disabled no-op behavior;
- define normalized event and context types;
- test disabled behavior, payload sanitization, graph id generation, and search formatting.

Verification:

- `cd app && npm test -- src/server/validation/env.test.ts src/server/memory --run`
- `cd app && npm run lint -- src/server/memory src/server/validation/env.ts`

### Wave 2: Ingestion

Files likely touched:

- `app/src/server/jobs/` for a memory ingestion function;
- `app/src/server/jobs/client.ts` or the existing job export registration point;
- campaign/profile/reference routes and repositories where events are emitted;
- derivation approval/rejection paths;
- QA/persona/delivery route or job handlers.

Tasks:

- create `brand-memory/ingest` background job;
- emit events after successful product actions;
- ensure Zep failures are logged but non-blocking;
- add route/job tests proving event emission does not change response contracts.

Verification:

- focused tests for touched routes/jobs;
- existing derivation/job tests;
- no regressions in save-reference and persona simulation route tests.

### Wave 3: Retrieval Into Generation

Files likely touched:

- `app/src/server/jobs/derivation.ts`
- `app/src/server/ai/prompt-builder.ts`
- `app/src/server/ai/prompt-builder.test.ts`
- `app/src/server/jobs/derivation.test.ts`

Tasks:

- fetch brand memory context during generation;
- pass it into `buildDerivationPrompt`;
- render it as auxiliary context;
- prove literal CTA, target format, generation mode, and source-image contracts still win.

Verification:

- `cd app && npm test -- src/server/ai/prompt-builder.test.ts src/server/jobs/derivation.test.ts --run`
- add specific prompt tests:
  - includes brand memory when present;
  - omits memory when absent;
  - preserves literal CTA even when memory suggests a different CTA;
  - preserves target format even when memory mentions another format.

### Wave 4: Brand Memory Panel

Files likely touched:

- `app/src/app/api/client-profiles/[id]/memory/route.ts`
- `app/src/lib/hooks/use-client-profile-memory.ts`
- campaign briefing/profile-selection UI components;
- message files `app/messages/pt-BR.json` and `app/messages/en.json`.

Tasks:

- expose normalized memory retrieval API;
- show a compact read-only panel in briefing;
- add loading, empty, disabled, and error states;
- keep the panel visually quiet and secondary.

Verification:

- route tests for auth, workspace scoping, disabled Zep, and normalized results;
- component tests for selected profile, empty state, and retrieved memory;
- translation JSON parse;
- browser smoke on the campaign briefing surface.

## Acceptance Criteria

- Zep can be fully disabled without breaking app startup, generation, or tests.
- Product actions continue to succeed if Zep ingestion fails.
- At least three product actions emit useful memory events: campaign update, creative approval/rejection, and save as reference.
- Generation prompts can include learned brand memory.
- Prompt tests prove learned memory cannot override literal CTA, target format, source image, campaign constraints, or generation mode.
- A selected brand/client profile can show a small learned-memory panel.
- No raw images, secrets, payment data, or env values are sent to Zep.
- Workspace isolation is preserved through per-workspace graph ids and route authorization.

## Risks

1. **Noisy retrieval**
   - Mitigation: small result limits, domain-specific query string, prompt-safe formatting, later ontology only if needed.

2. **Privacy and external processing**
   - Mitigation: opt-in env flag, no raw image ingestion, sanitized event payloads, clear privacy policy follow-up before production launch.

3. **Prompt conflict**
   - Mitigation: memory section is auxiliary; hard rules remain earlier and explicit; tests cover conflicts.

4. **Latency**
   - Mitigation: ingestion async; retrieval bounded; fail closed to no memory.

5. **Overbuilding**
   - Mitigation: first UI is read-only; no custom ontology or memory management console until real usage proves need.

## Open Decisions

1. Should Zep be enabled for all paid workspaces, or only selected beta workspaces at first?
2. Should campaign prompts include memory by default, or only when a client/brand profile is selected?
3. Should approved creative prompts be summarized before ingestion, or is structured metadata enough for v1?
4. Should the first UI say "Marca", "Cliente", or "Marca/cliente" while vocabulary research is still open?

## Recommended First Slice

Implement Waves 1-3 first, behind `ZEP_ENABLED`.

Reason: this proves the product value where it matters most: better generation context. The read-only UI panel can follow once ingestion and prompt retrieval are verified.

