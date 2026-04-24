# Phase 3: AI Plan & Derivation Jobs

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

Integrate OpenAI for creative plan generation and image derivation via Inngest jobs.
</domain>

<decisions>
## Implementation Decisions

### API Routes
- `POST /api/campaigns/[id]/plan`
- `PATCH /api/campaigns/[id]/plan`
- `POST /api/campaigns/[id]/derivations`
- `GET /api/campaigns/[id]/derivations`

### Plan Generation
- OpenAI text model: `gpt-5-mini`
- Structured JSON output: strategy, angles, hooks, CTAs
- Zod validation before saving

### Derivation Flow
1. User approves plan
2. API creates N derivations with status `queued`
3. Credits estimated/discounted
4. Inngest event emitted per derivation
5. Handler downloads input from R2
6. Calls OpenAI image model: `gpt-image-2-2026-04-21`
7. Output stored back to R2
8. DB updated with key, prompt, format, usage

### Derivation Status
- `queued | processing | completed | approved | rejected | failed`

### Polling
- UI uses TanStack Query polling until final status

</decisions>

<code_context>
## Existing Code Insights

- Campaigns and assets exist from Phase 2
- Inngest client configured from Phase 1
- OpenAI SDK already in dependencies
</code_context>

<specifics>
## Specific Ideas

- Creative plan repository
- Derivation repository
- Inngest function for image generation
- Prompt builder service
- Credit tracking service (simple MVP)
</specifics>
